import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { fetchMenuCatalog } from "@/lib/queries/menu";
import { AI_MODELS, FALLBACK_PARAMS, getAnthropicClient } from "@/lib/ai/client";
import {
  aiErrorResponse,
  clientIp,
  enforceAiRateLimits,
  fileMatchesDeclaredType,
  isAiFeatureEnabled,
} from "@/lib/ai/guardrails";
import {
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
  reconcileDraft,
} from "@/lib/ai/menu-onboarding";
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
  const limited = enforceAiRateLimits([
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

  const base64 = Buffer.from(bytes).toString("base64");
  const contentBlock: Anthropic.Beta.BetaContentBlockParam =
    file.type === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: base64,
          },
        };

  let message: Anthropic.Beta.BetaMessage;
  try {
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
    message = await stream.finalMessage();
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
    stopReason: message.stop_reason,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  if (message.stop_reason === "refusal") {
    return aiErrorResponse("AI_DECLINED", "The AI couldn't process this file. Try a clearer photo of the menu.", 422);
  }
  if (message.stop_reason === "max_tokens") {
    return aiErrorResponse(
      "MENU_TOO_LONG",
      "This menu is too long to read in one go. Upload it a few pages at a time.",
      422
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    console.error("[menu-extract] Non-JSON response:", text.slice(0, 500));
    return aiErrorResponse("PARSE_ERROR", "AI returned malformed data. Please try again.", 422);
  }

  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[menu-extract] Schema mismatch:", parsed.error.issues.slice(0, 5));
    return aiErrorResponse("SCHEMA_ERROR", "AI returned unexpected data. Please try again.", 422);
  }

  if (!parsed.data.isMenu) {
    return aiErrorResponse("NOT_A_MENU", "That doesn't look like a menu. Upload a photo or PDF of your menu.", 422);
  }

  const draft: MenuDraft = reconcileDraft(parsed.data, catalog);
  if (draft.totalItems === 0) {
    return aiErrorResponse("NO_ITEMS", "No dishes could be read. Try a sharper, well-lit photo.", 422);
  }

  return NextResponse.json({ draft });
}
