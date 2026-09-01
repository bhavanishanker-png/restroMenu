import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableToken: z.string().min(1),
});

function generateJoinCode(): string {
  // 6-digit code (100000–999999) — low collision risk even at busy restaurants
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const { restaurantSlug, tableToken } = parsed.data;
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

  // Resolve table
  const { data: table } = await supabase
    .from("restaurant_tables")
    .select("id, label")
    .eq("qr_token", tableToken)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (!table) {
    return NextResponse.json(
      { error: { code: "TABLE_NOT_FOUND", message: "Table not found." } },
      { status: 400 }
    );
  }

  // Try up to 5 times to generate a unique join code
  let session: { id: string; join_code: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    const { data, error } = await supabase
      .from("table_sessions")
      .insert({
        restaurant_id: restaurant.id,
        table_id: table.id,
        join_code: joinCode,
        status: "open",
      })
      .select("id, join_code")
      .single();

    if (!error && data) {
      session = data as { id: string; join_code: string };
      break;
    }
    // Unique constraint violation — retry with a new code
    if (error?.code !== "23505") {
      console.error("[sessions POST]", error);
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Failed to create session." } },
        { status: 500 }
      );
    }
  }

  if (!session) {
    return NextResponse.json(
      { error: { code: "CODE_COLLISION", message: "Could not generate a unique session code. Please try again." } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { sessionId: session.id, joinCode: session.join_code, tableLabel: table.label },
    { status: 201 }
  );
}
