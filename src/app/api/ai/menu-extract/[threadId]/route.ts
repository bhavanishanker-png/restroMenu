import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { aiErrorResponse, isAiFeatureEnabled } from "@/lib/ai/guardrails";
import {
  discardMenuImport,
  getPendingMenuImport,
  resumeMenuImport,
} from "@/lib/ai/menu-import-graph";
import { getMenuImportCheckpointer } from "@/lib/ai/menu-import-checkpointer";
import type { StaffSession } from "@/types";

// ─── /api/ai/menu-extract/[threadId] ────────────────────────────────────────
//
// A paused menu import (LangGraph thread waiting at owner review).
//   GET    → the draft again, for "Continue your last import" (no AI call)
//   POST   → the owner's decisions; resumes the graph, which validates them
//   DELETE → discard
// Every handler checks the thread belongs to the signed-in staff member's
// restaurant; anything else is a 404, never a 403, so ids can't be probed.

type Params = { params: { threadId: string } };

const threadIdSchema = z.string().uuid();

const resumeSchema = z.object({
  decisions: z
    .array(
      z.object({
        categoryIndex: z.number().int().min(0),
        itemIndex: z.number().int().min(0),
        basePrice: z.number().nullable(),
        foodType: z.enum(["veg", "non_veg", "egg"]).nullable(),
      })
    )
    .max(400),
});

const NOT_FOUND = () =>
  aiErrorResponse(
    "IMPORT_NOT_FOUND",
    "This import has expired or was already finished. Upload the menu again.",
    404
  );

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
  if (!isAiFeatureEnabled("menu_onboarding")) {
    return { ok: false, response: aiErrorResponse("AI_DISABLED", "AI menu import is turned off.", 503) };
  }
  const id = threadIdSchema.safeParse(params.threadId);
  if (!id.success) return { ok: false, response: NOT_FOUND() };
  return { ok: true, session, threadId: id.data };
}

async function checkpointerOrError() {
  try {
    return { ok: true as const, checkpointer: await getMenuImportCheckpointer() };
  } catch (err) {
    console.error("[menu-extract/thread] checkpointer setup failed", err);
    return {
      ok: false as const,
      response: aiErrorResponse("DB_ERROR", "Couldn't load the import. Try again.", 500),
    };
  }
}

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = await authorise(params);
  if (!ctx.ok) return ctx.response;
  const cp = await checkpointerOrError();
  if (!cp.ok) return cp.response;

  try {
    const pending = await getPendingMenuImport(cp.checkpointer, ctx.threadId, ctx.session.restaurantId);
    return pending ? NextResponse.json({ pending }) : NOT_FOUND();
  } catch (err) {
    console.error("[menu-extract/thread] load failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't load the import. Try again.", 500);
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

  const cp = await checkpointerOrError();
  if (!cp.ok) return cp.response;

  try {
    const result = await resumeMenuImport(
      cp.checkpointer,
      ctx.threadId,
      ctx.session.restaurantId,
      body.data.decisions
    );
    if (result.status === "not_found") return NOT_FOUND();
    if (result.status === "invalid") {
      // The graph is still paused at review, so the owner can fix and resend.
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: result.errors[0], details: result.errors } },
        { status: 400 }
      );
    }
    return NextResponse.json({ categories: result.categories });
  } catch (err) {
    console.error("[menu-extract/thread] resume failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't finish the import. Try again.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = await authorise(params);
  if (!ctx.ok) return ctx.response;
  const cp = await checkpointerOrError();
  if (!cp.ok) return cp.response;

  try {
    const removed = await discardMenuImport(cp.checkpointer, ctx.threadId, ctx.session.restaurantId);
    return removed ? NextResponse.json({ ok: true }) : NOT_FOUND();
  } catch (err) {
    console.error("[menu-extract/thread] discard failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't discard the import. Try again.", 500);
  }
}
