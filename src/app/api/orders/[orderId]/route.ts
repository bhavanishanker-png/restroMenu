import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { toOrder, toOrderItem } from "@/lib/mappers";
import type { DbOrder, DbOrderItem } from "@/types/db";

// ---------------------------------------------------------------- GET /api/orders/[orderId]
// Used by the order tracker for 15s polling fallback and after each Realtime event.

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  const { orderId } = params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    order: toOrder(data as DbOrder),
    items: ((data.order_items ?? []) as DbOrderItem[]).map(toOrderItem),
  });
}
