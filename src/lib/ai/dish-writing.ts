/**
 * The single model call behind AI dish writing (T34), and the code checks on
 * its output. SERVER-ONLY.
 *
 * One call per dish returns, in one structured response:
 *  - an English description, only when the dish has none
 *  - the dish name in Hindi (Devanagari)
 *  - a Hindi description (of the current or the new English one)
 *
 * `checkDishText` is the guardrail the workflow loops on: when it finds a
 * problem, the dish is written again with that problem as feedback. Code
 * decides what passes, not the model (ADR 0009).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_MODELS, FALLBACK_PARAMS } from "@/lib/ai/client";
import {
  containsHealthClaim,
  redactCurrencyAmounts,
  UNTRUSTED_CONTENT_RULE,
  wrapUntrusted,
} from "@/lib/ai/guardrails";
import type { FoodType } from "@/types";

export const DISH_TEXT_LIMITS = {
  descriptionEn: 300,
  nameHi: 200,
  descriptionHi: 500,
} as const;

/** What the workflow knows about a dish. Loaded from the DB by the server, never from the client. */
export type DishInput = {
  itemId: string;
  name: string;
  category: string;
  foodType: FoodType;
  currentDescription: string | null;
};

export const DishTextSchema = z.object({
  descriptionEn: z
    .string()
    .nullable()
    .describe("One plain English sentence, max 20 words. null if the dish already has a description."),
  nameHi: z.string().describe("The dish name in Hindi (Devanagari), as Indian menus write it."),
  descriptionHi: z
    .string()
    .nullable()
    .describe("The English description in natural Hindi. null if there is no English description."),
});

export type DishText = z.infer<typeof DishTextSchema>;

export const DISH_WRITING_SYSTEM_PROMPT = `You write menu text for restaurants in India. For one dish you return English and Hindi text in the required JSON schema.

Rules:
- descriptionEn: only when the dish has no description. One plain, appetising sentence, at most 20 words, about what the dish is and how it is cooked. If the dish already has a description, return null.
- nameHi: write the dish name in Devanagari the way Indian menus do. Transliterate dish names, don't translate them literally: "Paneer Tikka" is "पनीर टिक्का", "Butter Chicken" is "बटर चिकन". Translate only plain words that a Hindi menu would translate.
- descriptionHi: translate the English description (the current one, or your new one) into natural, simple Hindi. null only if there is no English description at all.
- Only describe what the name, category and description tell you. Never invent ingredients, origins or awards.
- Never make health, diet or allergy claims in either language: no healthy, nutritious, gluten-free, sugar-free, vegan, Jain, halal, low-calorie, allergen-free, and no Hindi equivalents (हेल्दी, पौष्टिक, ग्लूटेन-फ्री, जैन and so on). Diners with allergies must ask the staff.
- Never mention prices or quantities of money.
- ${UNTRUSTED_CONTENT_RULE}`;

export type WriteDishResult =
  | { ok: true; text: DishText; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; code: "AI_DECLINED" | "PARSE_ERROR" | "SCHEMA_ERROR" | "TOO_LONG" };

/**
 * Anthropic API errors (rate limit, 5xx) are thrown for the workflow to turn
 * into a per-dish failure; model-level outcomes are returned as results.
 */
export async function writeDishText(
  client: Anthropic,
  dish: DishInput,
  feedback: string | null
): Promise<WriteDishResult> {
  const dishData = wrapUntrusted(
    "menu_data",
    JSON.stringify({
      name: dish.name,
      category: dish.category,
      foodType: dish.foodType,
      currentDescription: dish.currentDescription,
    })
  );
  const ask = feedback
    ? `Your previous answer for this dish was rejected: ${feedback}\nWrite it again and fix that.`
    : "Write the text for this dish.";

  const message = await client.beta.messages.create(
    {
      model: AI_MODELS.menuWriting,
      max_tokens: 4096,
      ...FALLBACK_PARAMS,
      // Short, simple writing: low effort keeps it fast and cheap per dish.
      output_config: { effort: "low", format: betaZodOutputFormat(DishTextSchema) },
      system: [{ type: "text", text: DISH_WRITING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${dishData}\n\n${ask}` }],
    },
    { timeout: 60_000 }
  );

  if (message.stop_reason === "refusal") return { ok: false, code: "AI_DECLINED" };
  if (message.stop_reason === "max_tokens") return { ok: false, code: "TOO_LONG" };

  const raw = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "PARSE_ERROR" };
  }
  const parsed = DishTextSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "SCHEMA_ERROR" };

  return {
    ok: true,
    text: parsed.data,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}

// ---------------------------------------------------------------- guardrail

/** Which fields failed, and why — in words the model is given back as feedback. */
export type DishTextProblems = Partial<Record<keyof DishText, string>>;

function clean(text: string | null): string | null {
  if (text === null) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

function problemFor(text: string | null, max: number, label: string): string | null {
  if (text === null) return null;
  if (text.length > max) return `${label} is longer than ${max} characters`;
  if (containsHealthClaim(text)) return `${label} makes a health, diet or allergy claim`;
  if (redactCurrencyAmounts(text) !== text) return `${label} mentions a price`;
  return null;
}

/**
 * Normalises the model's text for one dish and reports every problem.
 * An English description is dropped (not a problem) when the dish already has one.
 */
export function checkDishText(
  dish: DishInput,
  text: DishText
): { text: DishText; problems: DishTextProblems } {
  const normalised: DishText = {
    descriptionEn: dish.currentDescription ? null : clean(text.descriptionEn),
    nameHi: clean(text.nameHi) ?? "",
    descriptionHi: clean(text.descriptionHi),
  };

  const problems: DishTextProblems = {};
  const en = problemFor(normalised.descriptionEn, DISH_TEXT_LIMITS.descriptionEn, "The English description");
  if (en) problems.descriptionEn = en;

  if (!normalised.nameHi) problems.nameHi = "The Hindi name is empty";
  else if (!/[ऀ-ॿ]/.test(normalised.nameHi)) problems.nameHi = "The Hindi name is not written in Devanagari";
  else {
    const hiName = problemFor(normalised.nameHi, DISH_TEXT_LIMITS.nameHi, "The Hindi name");
    if (hiName) problems.nameHi = hiName;
  }

  const hi = problemFor(normalised.descriptionHi, DISH_TEXT_LIMITS.descriptionHi, "The Hindi description");
  if (hi) problems.descriptionHi = hi;

  return { text: normalised, problems };
}
