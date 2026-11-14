/**
 * The single model call behind AI menu import. SERVER-ONLY.
 *
 * Shared by POST /api/ai/menu-extract and the offline eval
 * (evals/menu-extract), so the eval measures exactly the prompt, schema and
 * parameters that production uses.
 *
 * Anthropic API errors (rate limits, 5xx, timeouts) are thrown for the caller
 * to map; every model-level outcome is returned as a typed result.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_MODELS, FALLBACK_PARAMS } from "@/lib/ai/client";
import {
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
  type Extraction,
} from "@/lib/ai/menu-onboarding";
import type { MenuImportFailureCode } from "@/types";

export type MenuMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

export type ExtractUsage = { inputTokens: number; outputTokens: number };

export type ExtractFailureCode = Exclude<MenuImportFailureCode, "AI_BUSY" | "AI_ERROR">;

export type ExtractResult =
  | { ok: true; extraction: Extraction; usage: ExtractUsage; stopReason: string | null }
  | { ok: false; code: ExtractFailureCode; usage: ExtractUsage; stopReason: string | null; detail?: string };

export async function extractMenu(
  client: Anthropic,
  bytes: Uint8Array,
  mediaType: MenuMediaType
): Promise<ExtractResult> {
  const base64 = Buffer.from(bytes).toString("base64");
  const contentBlock: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

  // Streamed: a long menu can need a large output budget, and a
  // non-streaming request that size risks an HTTP timeout.
  const stream = client.beta.messages.stream(
    {
      model: AI_MODELS.menuOnboarding,
      max_tokens: 64_000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: "Extract every dish from this <menu_document>." },
          ],
        },
      ],
    },
    { timeout: 110_000 }
  );
  const message = await stream.finalMessage();

  const usage: ExtractUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
  const stopReason = message.stop_reason;

  if (stopReason === "refusal") return { ok: false, code: "AI_DECLINED", usage, stopReason };
  if (stopReason === "max_tokens") return { ok: false, code: "MENU_TOO_LONG", usage, stopReason };

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "PARSE_ERROR", usage, stopReason, detail: text.slice(0, 500) };
  }

  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "SCHEMA_ERROR",
      usage,
      stopReason,
      detail: JSON.stringify(parsed.error.issues.slice(0, 5)),
    };
  }

  if (!parsed.data.isMenu) return { ok: false, code: "NOT_A_MENU", usage, stopReason };

  return { ok: true, extraction: parsed.data, usage, stopReason };
}
