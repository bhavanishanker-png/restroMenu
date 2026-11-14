import { randomUUID } from "crypto";
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
import { extractMenu, type MenuMediaType } from "@/lib/ai/menu-extract";
import {
  MAX_IMPORT_PAGES,
  PAGE_FAILURE_MESSAGES,
  startMenuImport,
  type PageExtraction,
} from "@/lib/ai/menu-import-graph";
import { getWorkflowCheckpointer } from "@/lib/ai/workflow-checkpointer";

// Pages are read in parallel, so N pages take about as long as the slowest one.
export const maxDuration = 120;

const ALLOWED_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_BYTES_PER_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_BYTES_TOTAL = 20 * 1024 * 1024; // 20 MB

type Page = { bytes: Uint8Array; mediaType: MenuMediaType };

// ─── POST /api/ai/menu-extract ──────────────────────────────────────────────
//
// Starts a menu import (LangGraph thread, see src/lib/ai/menu-import-graph.ts):
// reads 1–5 pages in parallel, merges them, checks the result in code, then
// pauses at owner review. Returns the draft and the thread id. It never writes
// the menu: the owner approves via POST /api/ai/menu-extract/[threadId], and
// the dialog saves through /api/menu/categories and /api/menu/items.

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

  // One import = up to MAX_IMPORT_PAGES model calls; cap imports per restaurant and IP.
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

  const files = [...formData.getAll("files"), ...formData.getAll("file")].filter(
    (entry): entry is File => entry instanceof File
  );
  if (files.length === 0) {
    return aiErrorResponse("MISSING_FILE", "No file uploaded.", 400);
  }
  if (files.length > MAX_IMPORT_PAGES) {
    return aiErrorResponse(
      "TOO_MANY_FILES",
      `Upload at most ${MAX_IMPORT_PAGES} pages at a time.`,
      400
    );
  }

  let totalBytes = 0;
  const pages: Page[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = files.length > 1 ? `Page ${i + 1}: ` : "";
    if (!ALLOWED_TYPES.has(file.type)) {
      return aiErrorResponse("INVALID_TYPE", `${label}Upload a JPG, PNG, WebP, or PDF file.`, 400);
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      return aiErrorResponse("FILE_TOO_LARGE", `${label}Each file must be under 10 MB.`, 400);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_BYTES_TOTAL) {
      return aiErrorResponse("FILE_TOO_LARGE", "All pages together must be under 20 MB.", 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!fileMatchesDeclaredType(bytes, file.type)) {
      return aiErrorResponse(
        "INVALID_TYPE",
        `${label}That file isn't a real JPG, PNG, WebP or PDF. Export it again and retry.`,
        400
      );
    }
    pages.push({ bytes, mediaType: file.type as MenuMediaType });
  }

  const catalog = await fetchMenuCatalog(session.restaurantId);
  if (!catalog) {
    return aiErrorResponse("DB_ERROR", "Couldn't load your current menu. Try again.", 500);
  }

  let checkpointer;
  try {
    checkpointer = await getWorkflowCheckpointer();
  } catch (err) {
    console.error("[menu-extract] checkpointer setup failed", err);
    return aiErrorResponse("DB_ERROR", "Couldn't start the import. Try again.", 500);
  }

  // Closure over the uploaded bytes: images never enter graph state, so they
  // are never written to the checkpoint store.
  const extractPage = async (pageNumber: number): Promise<PageExtraction> => {
    const page = pages[pageNumber - 1];
    try {
      const result = await extractMenu(client, page.bytes, page.mediaType);
      console.info("[menu-extract]", {
        restaurantId: session.restaurantId,
        page: pageNumber,
        stopReason: result.stopReason,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      if (result.ok) return { page: pageNumber, ok: true, extraction: result.extraction };
      if (result.detail) console.error(`[menu-extract] page ${pageNumber} ${result.code}:`, result.detail);
      return { page: pageNumber, ok: false, code: result.code };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        console.error(`[menu-extract] page ${pageNumber} Anthropic rate limit:`, err.message);
        return { page: pageNumber, ok: false, code: "AI_BUSY" };
      }
      if (err instanceof Anthropic.APIError) {
        console.error(`[menu-extract] page ${pageNumber} Anthropic API error ${err.status}:`, err.message);
      } else {
        console.error(`[menu-extract] page ${pageNumber} Anthropic call failed:`, err);
      }
      return { page: pageNumber, ok: false, code: "AI_ERROR" };
    }
  };

  let result;
  try {
    result = await startMenuImport({
      checkpointer,
      extractPage,
      catalog,
      threadId: randomUUID(),
      restaurantId: session.restaurantId,
      pageCount: pages.length,
    });
  } catch (err) {
    console.error("[menu-extract] import graph failed", err);
    return aiErrorResponse("AI_ERROR", "AI extraction failed. Please try again.", 502);
  }

  if (result.status === "failed") {
    const first = result.failedPages[0];
    if (!first) {
      return aiErrorResponse("NO_ITEMS", "No dishes could be read. Try a sharper, well-lit photo.", 422);
    }
    const busy = result.failedPages.every((f) => f.code === "AI_BUSY");
    const message =
      pages.length === 1 ? PAGE_FAILURE_MESSAGES[first.code] : `No page could be read. Page ${first.page}: ${first.message}`;
    return aiErrorResponse(first.code, message, busy ? 503 : 422);
  }

  return NextResponse.json({ pending: result.pending });
}
