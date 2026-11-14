import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/ai/client";
import {
  aiErrorResponse,
  clientIp,
  enforceAiRateLimits,
  isAiFeatureEnabled,
} from "@/lib/ai/guardrails";
import { writeDishText, type DishInput } from "@/lib/ai/dish-writing";
import { MAX_WRITING_DISHES, startMenuWriting } from "@/lib/ai/menu-writing-graph";
import { getWorkflowCheckpointer } from "@/lib/ai/workflow-checkpointer";
import type { FoodType } from "@/types";

// Up to 40 dishes, 5 at a time, each up to 3 short calls.
export const maxDuration = 120;

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, "Pick at least one dish.").max(MAX_WRITING_DISHES),
});

type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  food_type: string;
  menu_categories: { name: string } | { name: string }[] | null;
};

// ─── POST /api/ai/menu-writing ──────────────────────────────────────────────
//
// Starts a dish-writing run (LangGraph, src/lib/ai/menu-writing-graph.ts):
// English descriptions for dishes without one, plus Hindi name and
// description, each checked by guardrails and rewritten if needed. Pauses at
// owner review; nothing is saved until POST /api/ai/menu-writing/[threadId].

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  if (!session) return aiErrorResponse("UNAUTHORIZED", "Authentication required.", 401);

  if (!isAiFeatureEnabled("menu_writing")) {
    return aiErrorResponse("AI_DISABLED", "AI dish writing is turned off.", 503);
  }
  const client = getAnthropicClient();
  if (!client) return aiErrorResponse("NO_API_KEY", "ANTHROPIC_API_KEY is not configured.", 503);

  const limited = await enforceAiRateLimits([
    { key: `ai-writing:r:${session.restaurantId}`, limit: 10, windowMs: 60 * 60_000 },
    { key: `ai-writing:ip:${clientIp(req.headers)}`, limit: 20, windowMs: 60 * 60_000 },
  ]);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return aiErrorResponse("INVALID_JSON", "Invalid request.", 400);
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return aiErrorResponse("VALIDATION_ERROR", body.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  // The dishes come from the database, scoped to this restaurant. The client
  // only says which ids; anything not on this restaurant's menu is ignored.
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, description, food_type, menu_categories(name)")
    .eq("restaurant_id", session.restaurantId)
    .eq("is_active", true)
    .in("id", body.data.itemIds);

  if (error) {
    console.error("[menu-writing] load dishes", error);
    return aiErrorResponse("DB_ERROR", "Couldn't load those dishes. Try again.", 500);
  }
  const rows = (data ?? []) as ItemRow[];
  if (rows.length === 0) {
    return aiErrorResponse("NO_DISHES", "None of those dishes are on your menu.", 400);
  }

  // Keep the order the owner picked.
  const order = new Map(body.data.itemIds.map((id, i) => [id, i] as const));
  const dishes: DishInput[] = rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => {
      const cat = Array.isArray(r.menu_categories) ? r.menu_categories[0] : r.menu_categories;
      return {
        itemId: r.id,
        name: r.name,
        category: cat?.name ?? "Menu",
        foodType: r.food_type as FoodType,
        currentDescription: r.description?.trim() ? r.description : null,
      };
    });

  let checkpointer;
  try {
    checkpointer = await getWorkflowCheckpointer();
  } catch (err) {
    console.error("[menu-writing] checkpointer setup failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't start. Try again.", 500);
  }

  try {
    const pending = await startMenuWriting({
      checkpointer,
      threadId: randomUUID(),
      restaurantId: session.restaurantId,
      dishes,
      writeDish: async (dish, feedback) => {
        try {
          const result = await writeDishText(client, dish, feedback);
          if (result.ok) {
            // Counts only, never the text (privacy rule for AI logs).
            console.info("[menu-writing]", {
              restaurantId: session.restaurantId,
              retry: feedback !== null,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            });
          }
          return result;
        } catch (err) {
          if (err instanceof Anthropic.RateLimitError) {
            console.error("[menu-writing] Anthropic rate limit:", err.message);
          } else if (err instanceof Anthropic.APIError) {
            console.error(`[menu-writing] Anthropic API error ${err.status}:`, err.message);
          }
          throw err; // the graph marks this dish ai_failed and carries on
        }
      },
    });
    return NextResponse.json({ pending });
  } catch (err) {
    console.error("[menu-writing] run failed", err);
    return aiErrorResponse("AI_ERROR", "The AI couldn't write those dishes. Try again.", 502);
  }
}
