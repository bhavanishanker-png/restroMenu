import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { getAnthropicClient } from "@/lib/ai/client";
import {
  AI_LIMITS,
  aiErrorResponse,
  enforceAiRateLimits,
  isAiFeatureEnabled,
  sanitizeChatHistory,
} from "@/lib/ai/guardrails";
import { runOwnerAssistant } from "@/lib/ai/owner-assistant";
import { supabaseOwnerData } from "@/lib/mcp/owner-data";

export const maxDuration = 60;

// History is client-supplied and untrusted: bounded here, sanitised by
// sanitizeChatHistory. The tools only ever read this restaurant's data.
const schema = z.object({
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

// ─── POST /api/ai/owner-chat ────────────────────────────────────────────────
// The dashboard "Ask AI" assistant (T36). Owners and managers only. The
// restaurant comes from the staff session, never from the request body.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;
  const session = await getStaffSession();
  if (!session) return aiErrorResponse("UNAUTHORIZED", "Authentication required.", 401);

  if (!isAiFeatureEnabled("owner_assistant")) {
    return aiErrorResponse("AI_DISABLED", "Ask AI is turned off.", 503);
  }
  const client = getAnthropicClient();
  if (!client) return aiErrorResponse("NO_API_KEY", "ANTHROPIC_API_KEY is not configured.", 503);

  const limited = await enforceAiRateLimits([
    { key: `owner-chat:s:${session.staffId}`, limit: 30, windowMs: 5 * 60_000 },
    { key: `owner-chat:r:${session.restaurantId}`, limit: 200, windowMs: 60 * 60_000 },
  ]);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return aiErrorResponse("INVALID_JSON", "Invalid request.", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return aiErrorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }
  const history = sanitizeChatHistory(parsed.data.messages);
  if (!history) return aiErrorResponse("VALIDATION_ERROR", "Type a question about your restaurant.", 400);

  try {
    const result = await runOwnerAssistant(
      client,
      { data: supabaseOwnerData(session.restaurantId), now: () => new Date() },
      history
    );
    // Counts only: never the conversation or the figures.
    console.info("[owner-chat]", {
      restaurantId: session.restaurantId,
      turns: history.length,
      tools: result.toolsUsed,
      stopReason: result.stopReason,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
    });
    return NextResponse.json({ reply: result.reply });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("[owner-chat] Anthropic rate limit:", err.message);
      return aiErrorResponse("AI_BUSY", "The assistant is busy. Try again in a moment.", 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[owner-chat] Anthropic API error ${err.status}:`, err.message);
    } else {
      console.error("[owner-chat] assistant failed:", err);
    }
    return aiErrorResponse("AI_ERROR", "The assistant couldn't answer. Your dashboard and reports still work.", 502);
  }
}
