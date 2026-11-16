import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth";
import {
  buildSplitState,
  closeQrQuietly,
  getRazorpay,
  loadActiveShares,
  loadSplitOrder,
  settleOrderFromShares,
} from "@/lib/payment-shares";
import type { DbPaymentShare } from "@/types/db";
import type { StaffRole } from "@/types";

// POST /api/orders/[orderId]/split/[shareId]/cash
// Staff record that a guest paid their share in cash. Closes that share's QR
// so it can't also be paid by UPI, then settles the order if it's now fully
// paid. Scoped to the staff session's restaurant. Kitchen staff don't handle
// money, so they can't do this.

const paramsSchema = z.object({ orderId: z.string().uuid(), shareId: z.string().uuid() });
const CASH_ROLES: readonly StaffRole[] = ["owner", "manager", "waiter"];

function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  _req: Request,
  { params }: { params: { orderId: string; shareId: string } }
): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) return fail("UNAUTHORIZED", "Authentication required.", 401);
  if (!CASH_ROLES.includes(session.role)) {
    return fail("FORBIDDEN", "Only owners, managers and waiters can record cash payments.", 403);
  }

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return fail("NOT_FOUND", "Share not found.", 404);
  const { orderId, shareId } = parsed.data;
  const restaurantId = session.restaurantId;

  const supabase = createServerClient();
  const orderResult = await loadSplitOrder(supabase, orderId, restaurantId);
  if (!orderResult.ok) return fail("DB_ERROR", "Couldn't load the order. Try again.", 500);
  if (!orderResult.value) return fail("NOT_FOUND", "Order not found.", 404);

  // Only a pending share can be marked — the status filter makes a double tap
  // (or a UPI payment landing first) a no-op instead of a double record.
  const { data: updated, error } = await supabase
    .from("order_payment_shares")
    .update({
      status: "paid",
      method: "cash",
      paid_at: new Date().toISOString(),
      marked_by: session.staffId,
    })
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("id", shareId)
    .eq("status", "pending")
    .select("razorpay_qr_id");
  if (error) {
    console.error("[split cash] mark paid failed", error);
    return fail("DB_ERROR", "Couldn't record the cash payment. Try again.", 500);
  }
  const rows = (updated ?? []) as Pick<DbPaymentShare, "razorpay_qr_id">[];
  if (rows.length === 0) {
    return fail("SHARE_NOT_PENDING", "This share is already paid or was cancelled. Refresh to see the latest.", 409);
  }

  await closeQrQuietly(getRazorpay(), rows[0].razorpay_qr_id);

  const settled = await settleOrderFromShares(supabase, restaurantId, orderId);
  if (!settled.ok) {
    // The share is recorded; only the order roll-up failed. The next split
    // GET (tracker or this sheet refreshing) self-heals it, so the tap succeeds.
    console.error("[split cash] settling order failed", orderId);
  }

  const fresh = await loadSplitOrder(supabase, orderId, restaurantId);
  const shares = await loadActiveShares(supabase, restaurantId, orderId);
  if (!fresh.ok || !fresh.value || !shares.ok) {
    return fail("DB_ERROR", "Cash recorded, but the bill couldn't be reloaded. Refresh.", 500);
  }
  // Staff see the full share, including who took the cash.
  return NextResponse.json(buildSplitState(fresh.value, shares.value, (s) => s));
}
