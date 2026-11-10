import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/sessions/[joinCode]
// Looks up an open session by join code.
// Returns enough info for the joining device to adopt the session.
export async function GET(
  req: NextRequest,
  { params }: { params: { joinCode: string } }
): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // The response carries the table's QR token, and the code space is only
  // 900k. Without a limit, walking the codes leaks the token of every open
  // session — enough to order to that table from anywhere. 10/min is plenty
  // for a guest mistyping a code.
  if (!(await checkRateLimit(`session-join:${ip}`, 10, 60_000))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." } },
      { status: 429 }
    );
  }

  const { joinCode } = params;

  if (!joinCode || !/^\d{6}$/.test(joinCode)) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "Invalid join code." } },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("table_sessions")
    .select("id, join_code, status, restaurant_id, table_id, restaurant_tables(label, qr_token), restaurants(slug)")
    .eq("join_code", joinCode)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("[sessions/:joinCode GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not look up that code. Try again." } },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: "SESSION_NOT_FOUND", message: "No active group order found for this code." } },
      { status: 404 }
    );
  }

  const tableData = (Array.isArray(data.restaurant_tables) ? data.restaurant_tables[0] : data.restaurant_tables) as { label: string; qr_token: string } | null;
  const restaurantData = (Array.isArray(data.restaurants) ? data.restaurants[0] : data.restaurants) as { slug: string } | null;

  return NextResponse.json({
    sessionId: data.id,
    joinCode: data.join_code,
    tableLabel: tableData?.label ?? null,
    tableToken: tableData?.qr_token ?? null,
    restaurantSlug: restaurantData?.slug ?? null,
  });
}
