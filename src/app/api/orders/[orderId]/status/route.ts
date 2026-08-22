import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { canTransition } from "@/types";
import type { OrderStatus } from "@/types";

const schema = z.object({
  status: z.enum(["accepted", "preparing", "ready", "served", "cancelled"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request." } },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid input.",
        },
      },
      { status: 400 }
    );
  }

  const { status: newStatus } = parsed.data;
  const session = await getStaffSession();
  const supabase = createServerClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", params.orderId)
    .eq("restaurant_id", session!.restaurantId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }

  if (!canTransition(order.status as OrderStatus, newStatus)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot transition from '${order.status}' to '${newStatus}'.`,
        },
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, string> = { status: newStatus };
  if (newStatus === "accepted") update.accepted_at = now;
  else if (newStatus === "ready") update.ready_at = now;
  else if (newStatus === "served") update.served_at = now;

  const { error: updateError } = await supabase
    .from("orders")
    .update(update)
    .eq("id", params.orderId);

  if (updateError) {
    console.error("[status] update failed:", updateError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to update order status." } },
      { status: 500 }
    );
  }

  const { error: eventError } = await supabase.from("order_events").insert({
    order_id: params.orderId,
    status: newStatus,
    staff_id: session!.staffId,
  });

  if (eventError) {
    console.error("[status] event insert failed:", eventError);
  }

  return NextResponse.json({ ok: true });
}
