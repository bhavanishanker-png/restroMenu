import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fetchPublicMenu } from "@/lib/queries/menu";
import { getAnthropicClient } from "@/lib/ai/client";
import {
  AI_LIMITS,
  aiErrorResponse,
  clientIp,
  enforceAiRateLimits,
  isAiFeatureEnabled,
  sanitizeUserText,
} from "@/lib/ai/guardrails";
import { runMenuAssistant } from "@/lib/ai/menu-assistant";
import type { AssistantChatTurn, AssistantReply } from "@/types";

export const maxDuration = 60;

// History is client-supplied, so it is untrusted: bounded here, sanitised
// below, and fenced as data inside the agent. A forged "assistant" turn can't
// do harm — every tool is read-only and every suggestion is re-validated.
const schema = z.object({
  slug: z.string().min(1).max(100),
  token: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(AI_LIMITS.chatHistoryAssistantChars),
      })
    )
    .min(1)
    .max(40),
});

// ─── POST /api/ai/menu-chat ─────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAiFeatureEnabled("menu_assistant")) {
    return aiErrorResponse("AI_DISABLED", "The menu assistant is turned off.", 503);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return aiErrorResponse("INVALID_JSON", "Invalid request.", 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return aiErrorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input.",
      400
    );
  }
  const { slug, token } = parsed.data;

  const history = toHistory(parsed.data.messages);
  if (!history) {
    return aiErrorResponse("VALIDATION_ERROR", "Type a question about the menu.", 400);
  }

  // Customer-facing and pay-per-call: capped per IP, per table and per restaurant.
  const limited = enforceAiRateLimits([
    { key: `ai-chat:ip:${clientIp(req.headers)}`, limit: 15, windowMs: 5 * 60_000 },
    { key: `ai-chat:t:${token}`, limit: 40, windowMs: 60 * 60_000 },
    { key: `ai-chat:r:${slug}`, limit: 400, windowMs: 60 * 60_000 },
  ]);
  if (limited) return limited;

  const client = getAnthropicClient();
  if (!client) {
    return aiErrorResponse("NO_API_KEY", "The menu assistant isn't set up yet.", 503);
  }

  // Restaurant and table are resolved server-side from the slug and QR
  // token; a bad token means no assistant (and no free AI for scrapers).
  const result = await fetchPublicMenu(slug, token);
  if (!result.ok) {
    if (result.code === "MENU_ERROR") {
      return aiErrorResponse("DB_ERROR", "Couldn't load the menu. Try again.", 500);
    }
    return aiErrorResponse("NOT_FOUND", "This table link isn't valid.", 404);
  }

  try {
    const { reply, suggestions, stopReason, usage } = await runMenuAssistant(
      client,
      result.menu,
      history
    );

    // Counts only: no diner text in logs.
    console.info("[menu-chat]", {
      restaurantId: result.menu.restaurant.id,
      turns: history.length,
      suggestions: suggestions.length,
      stopReason,
      inputTokens: usage.input,
      outputTokens: usage.output,
    });

    const body: AssistantReply = { reply, suggestions };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("[menu-chat] Anthropic rate limit:", err.message);
      return aiErrorResponse("AI_BUSY", "The assistant is busy. Try again in a moment.", 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[menu-chat] Anthropic API error ${err.status}:`, err.message);
    } else {
      console.error("[menu-chat] assistant failed:", err);
    }
    return aiErrorResponse(
      "AI_ERROR",
      "The assistant couldn't answer. You can still browse the menu.",
      502
    );
  }
}

/**
 * Last N turns, sanitised, starting with a diner turn and ending with one.
 * Returns null if nothing usable is left.
 */
function toHistory(turns: AssistantChatTurn[]): AssistantChatTurn[] | null {
  const cleaned = turns
    .slice(-AI_LIMITS.chatHistoryTurns)
    .map((t) => ({
      role: t.role,
      content: sanitizeUserText(
        t.content,
        t.role === "user" ? AI_LIMITS.chatMessageChars : AI_LIMITS.chatHistoryAssistantChars
      ),
    }))
    .filter((t) => t.content.length > 0);

  while (cleaned.length > 0 && cleaned[0].role !== "user") cleaned.shift();
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") return null;
  return cleaned;
}
