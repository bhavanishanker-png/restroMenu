import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getStaffSession, requireRole } from "@/lib/auth";
import { fetchMenuCatalog } from "@/lib/queries/menu";
import { getAnthropicClient } from "@/lib/ai/client";
import {
  aiErrorResponse,
  clientIp,
  enforceAiRateLimits,
  fileMatchesDeclaredType,
  isAiFeatureEnabled,
} from "@/lib/ai/guardrails";
import { reconcileDraft } from "@/lib/ai/menu-onboarding";
import {
  extractMenu,
  type ExtractFailureCode,
  type ExtractResult,
  type MenuMediaType,
} from "@/lib/ai/menu-extract";
import type { MenuDraft } from "@/types";

// Reading a multi-page menu can take a while; Vercel's default would cut it off.
export const maxDuration = 120;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTRACT_FAILURES: Record<ExtractFailureCode, { message: string; status: number }> = {
  AI_DECLINED: { message: "The AI couldn't process this file. Try a clearer photo of the menu.", status: 422 },
  MENU_TOO_LONG: {
    message: "This menu is too long to read in one go. Upload it a few pages at a time.",
    status: 422,
  },
  PARSE_ERROR: { message: "AI returned malformed data. Please try again.", status: 422 },
  SCHEMA_ERROR: { message: "AI returned unexpected data. Please try again.", status: 422 },
  NOT_A_MENU: { message: "That doesn't look like a menu. Upload a photo or PDF of your menu.", status: 422 },
};

// ─── POST /api/ai/menu-extract ──────────────────────────────────────────────
//
// Returns a reviewed-by-code DRAFT. It never writes the menu: the owner ticks
// dishes in MenuExtractDialog, which saves them through the normal
// /api/menu/categories and /api/menu/items routes (and their validation).

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  if (!session) {
    return aiErrorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  if (!isAiFeatureEnabled("menu_onboarding")) {
    return aiErrorResponse("AI_DISABLED", "AI menu import is turned off.", 503);
  }

  const client = getAnthropicClient();
  if (!client) {
    return aiErrorResponse("NO_API_KEY", "ANTHROPIC_API_KEY is not configured.", 503);
  }

  // Each import is one large model call; cap it per restaurant and per IP.
  const limited = await enforceAiRateLimits([
    { key: `ai-import:r:${session.restaurantId}`, limit: 10, windowMs: 60 * 60_000 },
    { key: `ai-import:ip:${clientIp(req.headers)}`, limit: 20, windowMs: 60 * 60_000 },
  ]);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return aiErrorResponse("INVALID_FORM", "Invalid multipart form data.", 400);
  }

  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return aiErrorResponse("MISSING_FILE", "No file uploaded.", 400);
  }
  const file = entry;

  if (!ALLOWED_TYPES.has(file.type)) {
    return aiErrorResponse("INVALID_TYPE", "Upload a JPG, PNG, WebP, or PDF file.", 400);
  }
  if (file.size > MAX_BYTES) {
    return aiErrorResponse("FILE_TOO_LARGE", "File must be under 10 MB.", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!fileMatchesDeclaredType(bytes, file.type)) {
    return aiErrorResponse(
      "INVALID_TYPE",
      "That file isn't a real JPG, PNG, WebP or PDF. Export it again and retry.",
      400
    );
  }

  const catalog = await fetchMenuCatalog(session.restaurantId);
  if (!catalog) {
    return aiErrorResponse("DB_ERROR", "Couldn't load your current menu. Try again.", 500);
  }

  let result: ExtractResult;
  try {
    result = await extractMenu(client, bytes, file.type as MenuMediaType);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("[menu-extract] Anthropic rate limit:", err.message);
      return aiErrorResponse("AI_BUSY", "The AI service is busy. Try again in a minute.", 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[menu-extract] Anthropic API error ${err.status}:`, err.message);
    } else {
      console.error("[menu-extract] Anthropic call failed:", err);
    }
    return aiErrorResponse("AI_ERROR", "AI extraction failed. Please try again.", 502);
  }

  console.info("[menu-extract]", {
    restaurantId: session.restaurantId,
    stopReason: result.stopReason,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  if (!result.ok) {
    if (result.detail) console.error(`[menu-extract] ${result.code}:`, result.detail);
    const { message, status } = EXTRACT_FAILURES[result.code];
    return aiErrorResponse(result.code, message, status);
  }

  const draft: MenuDraft = reconcileDraft(result.extraction, catalog);
  if (draft.totalItems === 0) {
    return aiErrorResponse("NO_ITEMS", "No dishes could be read. Try a sharper, well-lit photo.", 422);
  }

  return NextResponse.json({ draft });
}
