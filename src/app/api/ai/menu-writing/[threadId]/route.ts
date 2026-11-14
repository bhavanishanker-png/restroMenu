import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePublicMenu } from "@/lib/queries/menu";
import { aiErrorResponse, isAiFeatureEnabled } from "@/lib/ai/guardrails";
import {
  MAX_WRITING_DISHES,
  finishMenuWriting,
  getPendingMenuWriting,
  resumeMenuWriting,
} from "@/lib/ai/menu-writing-graph";
import { getWorkflowCheckpointer } from "@/lib/ai/workflow-checkpointer";
import type { ApprovedDishText, StaffSession } from "@/types";

// ─── /api/ai/menu-writing/[threadId] ────────────────────────────────────────
//   GET    → the paused run again (no AI call)
//   POST   → owner decisions; the graph validates them, then this route saves
//   DELETE → discard
// Another restaurant's thread is a 404, never a 403.

type Params = { params: { threadId: string } };

const resumeSchema = z.object({
  decisions: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        descriptionEn: z.string().max(1000).nullable(),
        nameHi: z.string().max(1000),
        descriptionHi: z.string().max(2000).nullable(),
      })
    )
    .max(MAX_WRITING_DISHES),
});

const NOT_FOUND = () =>
  aiErrorResponse("RUN_NOT_FOUND", "This run has expired or was already saved. Start a new one.", 404);

type Context =
  | { ok: true; session: StaffSession; threadId: string }
  | { ok: false; response: NextResponse };

async function authorise(params: Params["params"]): Promise<Context> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return { ok: false, response: guard };
  const session = await getStaffSession();
  if (!session) {
    return { ok: false, response: aiErrorResponse("UNAUTHORIZED", "Authentication required.", 401) };
  }
  if (!isAiFeatureEnabled("menu_writing")) {
    return { ok: false, response: aiErrorResponse("AI_DISABLED", "AI dish writing is turned off.", 503) };
  }
  const id = z.string().uuid().safeParse(params.threadId);
  if (!id.success) return { ok: false, response: NOT_FOUND() };
  return { ok: true, session, threadId: id.data };
}

async function loadCheckpointer() {
  try {
    return { ok: true as const, checkpointer: await getWorkflowCheckpointer() };
  } catch (err) {
    console.error("[menu-writing/thread] checkpointer setup failed", err);
    return { ok: false as const, response: aiErrorResponse("DB_ERROR", "Couldn't load the run. Try again.", 500) };
  }
}

/**
 * Writes the approved text. Every query is scoped by restaurant_id, and dishes
 * that were deleted since the run started are skipped. An English description
 * is only written into a dish that still has none, so an edit the owner made
 * in the menu manager meanwhile is never overwritten.
 */
async function saveApproved(
  restaurantId: string,
  approved: ApprovedDishText[]
): Promise<{ ok: true; saved: number; skipped: number } | { ok: false }> {
  const supabase = createServerClient();
  const ids = approved.map((a) => a.itemId);

  const { data: live, error: liveError } = await supabase
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .in("id", ids);
  if (liveError) {
    console.error("[menu-writing] save: load dishes", liveError);
    return { ok: false };
  }
  const liveIds = new Set((live ?? []).map((r: { id: string }) => r.id));
  const toSave = approved.filter((a) => liveIds.has(a.itemId));

  if (toSave.length > 0) {
    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("menu_item_translations").upsert(
      toSave.map((a) => ({
        restaurant_id: restaurantId,
        item_id: a.itemId,
        locale: "hi",
        name: a.nameHi,
        description: a.descriptionHi,
        source: a.hiSource,
        updated_at: now,
      })),
      { onConflict: "item_id,locale" }
    );
    if (upsertError) {
      console.error("[menu-writing] save: translations", upsertError);
      return { ok: false };
    }

    for (const a of toSave) {
      if (!a.descriptionEn) continue;
      const { error } = await supabase
        .from("menu_items")
        .update({ description: a.descriptionEn })
        .eq("id", a.itemId)
        .eq("restaurant_id", restaurantId)
        .is("description", null);
      if (error) {
        console.error("[menu-writing] save: description", a.itemId, error);
        return { ok: false };
      }
    }
  }

  return { ok: true, saved: toSave.length, skipped: approved.length - toSave.length };
}

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = await authorise(params);
  if (!ctx.ok) return ctx.response;
  const cp = await loadCheckpointer();
  if (!cp.ok) return cp.response;
  try {
    const pending = await getPendingMenuWriting(cp.checkpointer, ctx.threadId, ctx.session.restaurantId);
    return pending ? NextResponse.json({ pending }) : NOT_FOUND();
  } catch (err) {
    console.error("[menu-writing/thread] load failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't load the run. Try again.", 500);
  }
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = await authorise(params);
  if (!ctx.ok) return ctx.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return aiErrorResponse("INVALID_JSON", "Invalid request.", 400);
  }
  const body = resumeSchema.safeParse(raw);
  if (!body.success) {
    return aiErrorResponse("VALIDATION_ERROR", body.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  const cp = await loadCheckpointer();
  if (!cp.ok) return cp.response;

  try {
    const result = await resumeMenuWriting(cp.checkpointer, ctx.threadId, ctx.session.restaurantId, body.data.decisions);
    if (result.status === "not_found") return NOT_FOUND();
    if (result.status === "invalid") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: result.errors[0], details: result.errors } },
        { status: 400 }
      );
    }

    const saved = await saveApproved(ctx.session.restaurantId, result.approved);
    if (!saved.ok) {
      // The approval is kept, so sending the same request again retries the save.
      return aiErrorResponse("DB_ERROR", "Couldn't save the text. Try again; nothing is lost.", 500);
    }
    revalidatePublicMenu(ctx.session.restaurantId);
    await finishMenuWriting(cp.checkpointer, ctx.threadId, ctx.session.restaurantId);
    return NextResponse.json({ saved: saved.saved, skipped: saved.skipped });
  } catch (err) {
    console.error("[menu-writing/thread] resume failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't finish. Try again.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = await authorise(params);
  if (!ctx.ok) return ctx.response;
  const cp = await loadCheckpointer();
  if (!cp.ok) return cp.response;
  try {
    const removed = await finishMenuWriting(cp.checkpointer, ctx.threadId, ctx.session.restaurantId);
    return removed ? NextResponse.json({ ok: true }) : NOT_FOUND();
  } catch (err) {
    console.error("[menu-writing/thread] discard failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't discard. Try again.", 500);
  }
}
