import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/sessions/[joinCode]
// Looks up an open session by join code.
// Returns enough info for the joining device to adopt the session.
export async function GET(
  _req: NextRequest,
  { params }: { params: { joinCode: string } }
): Promise<NextResponse> {
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
    .single();

  if (error || !data) {
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
