import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

// ─── output schema ──────────────────────────────────────────────────────────

const ExtractedItem = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  basePrice: z.number().min(0),
  foodType: z.enum(["veg", "non_veg", "egg"]).nullable(),
});

const ExtractedCategory = z.object({
  name: z.string().min(1),
  items: z.array(ExtractedItem),
});

export const ExtractedMenuSchema = z.object({
  categories: z.array(ExtractedCategory),
});

export type ExtractedMenu = z.infer<typeof ExtractedMenuSchema>;

// ─── Next.js body size limit ────────────────────────────────────────────────

export const config = { api: { bodyParser: false } };

// ─── POST /api/ai/menu-extract ──────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const PROMPT = `Extract every menu item visible in this image or document.
Return ONLY a JSON object — no markdown fences, no prose — with this exact shape:

{
  "categories": [
    {
      "name": "Category heading (e.g. Starters, Main Course)",
      "items": [
        {
          "name": "Dish name",
          "description": "Short description or null",
          "basePrice": 120,
          "foodType": "veg" | "non_veg" | "egg" | null
        }
      ]
    }
  ]
}

Rules:
- basePrice is a plain number in the local currency (no symbol). If a price range, use the lower value. If no price visible, use 0.
- foodType: "veg" = vegetarian, "non_veg" = non-vegetarian/meat/seafood, "egg" = egg-based, null = unknown.
- Group items under the section heading shown in the menu. If none exists, group under "Main Menu".
- Include every visible item — do not skip anything.
- Return ONLY the JSON, no other text.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: { code: "NO_API_KEY", message: "ANTHROPIC_API_KEY is not configured." } },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_FORM", message: "Invalid multipart form data." } },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "No file uploaded." } },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: { code: "INVALID_TYPE", message: "Upload a JPG, PNG, WebP, or PDF file." } },
      { status: 400 }
    );
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: "FILE_TOO_LARGE", message: "File must be under 10 MB." } },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const contentBlock: Anthropic.MessageParam["content"][number] =
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let responseText: string;
  try {
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: PROMPT }],
        },
      ],
    });

    const block = message.content.find((b) => b.type === "text");
    responseText = block?.type === "text" ? block.text : "";
  } catch (err) {
    console.error("[menu-extract] Anthropic error:", err);
    return NextResponse.json(
      { error: { code: "AI_ERROR", message: "AI extraction failed. Please try again." } },
      { status: 502 }
    );
  }

  // Strip possible markdown fences and find the JSON object
  const jsonMatch = responseText.replace(/```json?|```/g, "").match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[menu-extract] No JSON in response:", responseText.slice(0, 500));
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "Could not parse menu data from the image." } },
      { status: 422 }
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "AI returned malformed JSON." } },
      { status: 422 }
    );
  }

  const result = ExtractedMenuSchema.safeParse(raw);
  if (!result.success) {
    console.error("[menu-extract] Schema mismatch:", result.error.flatten());
    return NextResponse.json(
      { error: { code: "SCHEMA_ERROR", message: "AI returned unexpected data shape." } },
      { status: 422 }
    );
  }

  const totalItems = result.data.categories.reduce((s, c) => s + c.items.length, 0);
  return NextResponse.json({ menu: result.data, totalItems });
}
