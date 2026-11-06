/**
 * Customer menu assistant — a small tool-using agent that helps a diner find
 * dishes ("something spicy and veg?", "कुछ मीठा?").
 *
 * What it CAN do: search this restaurant's menu, read a dish's details, and
 * suggest dishes. What it CANNOT do, by construction — there is no tool for
 * it: add to the cart, place or change an order, quote a total, or touch any
 * other restaurant's data. The diner taps a suggestion, which opens the
 * normal item sheet, and the cart and POST /api/orders work exactly as
 * before (server-side pricing included).
 *
 * SERVER-ONLY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { computeUnitPrice } from "@/lib/pricing";
import { AI_MODELS, FALLBACK_PARAMS } from "@/lib/ai/client";
import {
  AI_LIMITS,
  ALLERGY_NOTE,
  UNTRUSTED_CONTENT_RULE,
  containsHealthClaim,
  redactCurrencyAmounts,
  wrapUntrusted,
} from "@/lib/ai/guardrails";
import type {
  AssistantChatTurn,
  AssistantReply,
  AssistantSuggestion,
  MenuItem,
  PublicMenu,
} from "@/types";

// ---------------------------------------------------------------- prompt

/** Stable across restaurants and requests, so it caches. Per-restaurant context goes in a second block. */
const SYSTEM_PROMPT = `You are the menu assistant inside a restaurant's QR ordering app. A diner at a table is chatting with you on their phone.

Your job: help them choose dishes from THIS restaurant's menu, and nothing else.

How to work:
- Use search_menu to find dishes, and get_item_details when you need sizes, add-ons or a full description. Never mention a dish you haven't seen in a tool result.
- When you recommend dishes, call suggest_items with them (at most ${AI_LIMITS.chatMaxSuggestions}). The app shows each one as a card the diner can tap to add. Suggest dishes only through suggest_items.
- Then reply in 1–3 short sentences. Don't repeat the full card details.

Hard rules:
- Never state a price, a total, or a bill amount, and never do arithmetic on prices. The cards and the cart show the correct prices. You may use the max_price filter to respect a budget, and say the dishes fit it.
- You cannot add to the cart, place, change or cancel orders, apply discounts, take payments, or call staff. If asked, say the diner can tap a dish to add it, or use the Requests tab to call a waiter.
- The only dietary information you have is each dish's food type: veg, non_veg or egg. Never claim a dish is free of an allergen, vegan, gluten-free, Jain, halal, healthy or similar. For allergies or dietary needs, tell the diner to confirm with the staff.
- Only discuss this menu. For anything else, politely say you can only help with the menu.
- Reply in the language the diner writes in (Hindi, Hinglish, Tamil, English, ...).
- ${UNTRUSTED_CONTENT_RULE}`;

// ---------------------------------------------------------------- menu index

type IndexedItem = {
  item: MenuItem;
  category: string;
  haystack: string;
};

/** Only dishes the diner can actually order right now. */
function buildIndex(menu: PublicMenu): Map<string, IndexedItem> {
  const index = new Map<string, IndexedItem>();
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      if (!item.isAvailable || !item.isActive) continue;
      index.set(item.id, {
        item,
        category: cat.name,
        haystack: [item.name, item.description ?? "", cat.name, ...item.tags].join(" ").toLowerCase(),
      });
    }
  }
  return index;
}

function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---------------------------------------------------------------- tools

function buildTools(index: Map<string, IndexedItem>, suggestions: AssistantSuggestion[]) {
  const searchMenu = betaZodTool({
    name: "search_menu",
    description:
      "Search the dishes that are available right now. All filters are optional and combine with AND. " +
      "Returns up to " + AI_LIMITS.chatSearchResults + " dishes with id, name, category, food type, starting price, spice level (0-3) and tags.",
    inputSchema: z.object({
      query: z
        .string()
        .max(100)
        .optional()
        .describe("Words to match in dish name, description, category or tags, e.g. 'paneer', 'dessert', 'biryani'. Matches any word."),
      foodTypes: z.array(z.enum(["veg", "non_veg", "egg"])).optional(),
      maxPrice: z.number().positive().optional().describe("Only dishes whose starting price is at most this."),
      minSpiceLevel: z.number().int().min(0).max(3).optional(),
      maxSpiceLevel: z.number().int().min(0).max(3).optional(),
      tag: z.string().max(40).optional().describe("Exact tag, e.g. 'bestseller'."),
    }),
    run: (input) => {
      const words = (input.query ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

      const rows = Array.from(index.values())
        .filter(({ item, haystack }) => {
          if (input.foodTypes && !input.foodTypes.includes(item.foodType)) return false;
          if (input.maxPrice !== undefined && item.basePrice > input.maxPrice) return false;
          if (input.minSpiceLevel !== undefined && item.spiceLevel < input.minSpiceLevel) return false;
          if (input.maxSpiceLevel !== undefined && item.spiceLevel > input.maxSpiceLevel) return false;
          if (input.tag && !item.tags.includes(input.tag.toLowerCase())) return false;
          if (words.length > 0 && !words.some((w) => haystack.includes(w))) return false;
          return true;
        })
        .slice(0, AI_LIMITS.chatSearchResults)
        .map(({ item, category }) => ({
          id: item.id,
          name: item.name,
          category,
          foodType: item.foodType,
          startingPrice: item.basePrice,
          spiceLevel: item.spiceLevel,
          tags: item.tags,
          description: truncate(item.description, 120),
          hasSizesOrAddons: item.variants.length > 0 || item.addonGroups.length > 0,
        }));

      if (rows.length === 0) {
        return "No dishes match. Try fewer filters or different words.";
      }
      return wrapUntrusted("menu_data", JSON.stringify(rows));
    },
  });

  const getItemDetails = betaZodTool({
    name: "get_item_details",
    description: "Full details for one dish by id: description, sizes with their prices, add-on groups, prep time.",
    inputSchema: z.object({ itemId: z.string().max(64) }),
    run: ({ itemId }) => {
      const entry = index.get(itemId);
      if (!entry) return "No available dish has that id. Use an id from search_menu.";
      const { item, category } = entry;
      return wrapUntrusted(
        "menu_data",
        JSON.stringify({
          id: item.id,
          name: item.name,
          category,
          foodType: item.foodType,
          description: truncate(item.description, 500),
          spiceLevel: item.spiceLevel,
          prepMinutes: item.prepMinutes,
          tags: item.tags,
          // Size prices come from pricing.ts, never from the model.
          sizes: item.variants.map((v) => ({
            name: v.name,
            price: computeUnitPrice(item.basePrice, v.priceDelta, []),
          })),
          addOnGroups: item.addonGroups.map((g) => ({
            name: g.name,
            options: g.addons.map((a) => a.name),
          })),
        })
      );
    },
  });

  const suggestItems = betaZodTool({
    name: "suggest_items",
    description:
      "Show dishes to the diner as tappable cards. Use ids from search_menu. Call once per answer with all the dishes you recommend.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            itemId: z.string().max(64),
            reason: z.string().max(160).describe("Why this fits what they asked, in their language. No prices."),
          })
        )
        .min(1)
        .max(AI_LIMITS.chatMaxSuggestions),
    }),
    run: ({ items }) => {
      const rejected: string[] = [];
      for (const { itemId, reason } of items) {
        // The model may only suggest real, orderable dishes of this restaurant.
        if (!index.has(itemId)) {
          rejected.push(itemId);
          continue;
        }
        if (suggestions.some((s) => s.itemId === itemId)) continue;
        if (suggestions.length >= AI_LIMITS.chatMaxSuggestions) break;
        suggestions.push({ itemId, reason: cleanReason(reason) });
      }
      return rejected.length > 0
        ? `Shown ${suggestions.length} dishes. These ids are not available and were skipped: ${rejected.join(", ")}.`
        : `Shown ${suggestions.length} dishes.`;
    },
  });

  return [searchMenu, getItemDetails, suggestItems];
}

// ---------------------------------------------------------------- output guardrails

function cleanReason(reason: string): string {
  const text = redactCurrencyAmounts(reason.trim()).slice(0, 160);
  // A reason that makes a health claim is dropped rather than shown.
  return containsHealthClaim(text) ? "" : text;
}

function cleanReply(reply: string): string {
  let text = redactCurrencyAmounts(reply.trim());
  if (containsHealthClaim(text) && !text.includes(ALLERGY_NOTE)) {
    text = `${text}\n\n${ALLERGY_NOTE}`;
  }
  return text;
}

const FALLBACK_REPLY = "Sorry, I couldn't help with that. Try asking about a dish, a flavour or a budget.";

// ---------------------------------------------------------------- run

/**
 * `history` is client-supplied and therefore untrusted: the route has already
 * capped and sanitised it. Diner turns are fenced as data here.
 */
export async function runMenuAssistant(
  client: Anthropic,
  menu: PublicMenu,
  history: AssistantChatTurn[]
): Promise<AssistantReply & { stopReason: string | null; usage: { input: number; output: number } }> {
  const index = buildIndex(menu);
  const suggestions: AssistantSuggestion[] = [];

  if (index.size === 0) {
    return {
      reply: "No dishes are available to order right now. Please ask the staff.",
      suggestions: [],
      stopReason: null,
      usage: { input: 0, output: 0 },
    };
  }

  const categories = menu.categories
    .filter((c) => c.items.some((i) => index.has(i.id)))
    .map((c) => c.name);

  const restaurantContext = wrapUntrusted(
    "menu_data",
    JSON.stringify({ restaurant: menu.restaurant.name, categories, dishCount: index.size })
  );

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) =>
    turn.role === "user"
      ? { role: "user", content: wrapUntrusted("diner_message", turn.content) }
      : { role: "assistant", content: turn.content }
  );

  const finalMessage = await client.beta.messages.toolRunner(
    {
      model: AI_MODELS.menuAssistant,
      max_tokens: 4096,
      max_iterations: AI_LIMITS.chatMaxIterations,
      ...FALLBACK_PARAMS,
      // Chat: low effort keeps answers quick and cheap; the tools do the heavy lifting.
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `This restaurant:\n${restaurantContext}` },
      ],
      tools: buildTools(index, suggestions),
      messages,
    },
    // One deadline for the whole loop (every model call and tool run), not per request.
    { signal: AbortSignal.timeout(45_000) }
  );

  const stopReason = finalMessage.stop_reason;
  const usage = {
    input: finalMessage.usage.input_tokens,
    output: finalMessage.usage.output_tokens,
  };

  if (stopReason === "refusal") {
    return {
      reply: "Sorry, I can only help you choose from this menu.",
      suggestions: [],
      stopReason,
      usage,
    };
  }

  const text = finalMessage.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Ran out of iterations mid-search, or answered with cards only.
  const reply = text
    ? cleanReply(text)
    : suggestions.length > 0
      ? "Here are a few dishes you might like."
      : FALLBACK_REPLY;

  return { reply, suggestions, stopReason, usage };
}
