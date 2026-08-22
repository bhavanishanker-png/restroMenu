import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toTable } from "@/lib/mappers";
import type { DbRestaurantTable } from "@/types/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  // Verify the table belongs to this restaurant
  const { data: existing } = await supabase
    .from("restaurant_tables")
    .select("id, label")
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Table not found." } },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("restaurant_tables")
    .update({ qr_token: crypto.randomUUID() })
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .select()
    .single();

  if (error || !data) {
    console.error("[regenerate-qr]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to regenerate QR." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ table: toTable(data as DbRestaurantTable) });
}
