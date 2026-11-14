/**
 * Anthropic client for every AI feature. SERVER-ONLY — the API key must never
 * reach the browser, exactly like the Supabase service role key. Import this
 * only from route handlers and other files under src/lib/ai.
 */
import Anthropic from "@anthropic-ai/sdk";

/** One model id per feature, so each can be retuned (or downgraded for cost) on its own. */
export const AI_MODELS = {
  menuOnboarding: "claude-opus-5-5",
  menuAssistant: "claude-opus-5-5",
  menuWriting: "claude-opus-5-5",
} as const;

/**
 * Server-side refusal fallback: if the model declines, the API re-runs the
 * same request on a fallback model inside the same call. `"default"` routes
 * by refusal category so there is no model list to maintain.
 */
export const FALLBACK_PARAMS: {
  betas: Anthropic.Beta.AnthropicBeta[];
  fallbacks: Anthropic.Beta.Messages.BetaFallbacksParam;
} = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let cached: Anthropic | null = null;

/** Null when ANTHROPIC_API_KEY is unset — callers answer 503 instead of crashing. */
export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cached) {
    // maxRetries 1: a customer is waiting on the other end; one retry on a
    // 429/5xx is worth it, three is not.
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  }
  return cached;
}
