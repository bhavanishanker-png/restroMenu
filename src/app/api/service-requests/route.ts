import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  restaurantSlug: z.string().min(1),
  tableToken: z.string().min(1),
  type: z.enum(["waiter", "water", "bill"]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 10 requests per IP per minute — enough for any table, blocks spam
  if (!checkRateLimit(`service-requests:${ip}`, 10, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait." } },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const { restaurantSlug, tableToken, type } = parsed.data;
  const supabase = createServerClient();

  // Resolve restaurant
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, is_active")
    .eq("slug", restaurantSlug)
    .single();

  if (!restaurant || !restaurant.is_active) {
    return NextResponse.json(
      { error: { code: "RESTAURANT_NOT_FOUND", message: "Restaurant not found." } },
      { status: 404 }
    );
  }

  // Resolve table — must belong to this restaurant
  const { data: table } = await supabase
    .from("restaurant_tables")
    .select("id")
    .eq("qr_token", tableToken)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (!table) {
    return NextResponse.json(
      { error: { code: "TABLE_NOT_FOUND", message: "Table not found." } },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await supabase
    .from("service_requests")
    .insert({
      restaurant_id: restaurant.id,
      table_id: table.id,
      type,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[service-requests POST]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to create request." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}

// PATCH /api/service-requests — resolve a request (staff only via kitchen display)
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const patchSchema = z.object({ id: z.string().uuid() });
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "id must be a UUID." } },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("service_requests")
    .update({ status: "resolved" })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[service-requests PATCH]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to resolve request." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
