import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ai/guardrails";
import { toPaymentShare } from "@/lib/mappers";
import { toGuestPaymentShare } from "@/lib/order-privacy";
import {
  buildSplitState,
  closeQrQuietly,
  createShareQr,
  getRazorpay,
  loadActiveShares,
  loadSplitOrder,
  qrStillUsable,
} from "@/lib/payment-shares";
import type { DbPaymentShare } from "@/types/db";

// POST /api/orders/[orderId]/split/[shareId]/qr
// Give a share a fresh QR: its first one failed to create, or it expired.
// Guest route — the order UUID is the credential, as on the tracker.
// Idempotent while the current QR is still usable: it is returned unchanged.

const paramsSchema = z.object({ orderId: z.string().uuid(), shareId: z.string().uuid() });

function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string; shareId: string } }
): Promise<NextResponse> {
  if (!(await checkRateLimit(`split-qr:${clientIp(req.headers)}`, 20, 60_000))) {
    return fail("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
  }

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return fail("NOT_FOUND", "Share not found.", 404);
  const { orderId, shareId } = parsed.data;

  const rzp = getRazorpay();
  if (!rzp) return fail("PAYMENTS_UNAVAILABLE", "QR payments aren't available right now. Please pay at the counter.", 503);

  const supabase = createServerClient();
  const orderResult = await loadSplitOrder(supabase, orderId);
  if (!orderResult.ok) return fail("DB_ERROR", "Couldn't load the order. Try again.", 500);
  const order = orderResult.value;
  if (!order) return fail("NOT_FOUND", "Order not found.", 404);
  if (order.paymentStatus === "paid") return fail("ALREADY_PAID", "This bill has already been paid.", 409);

  const { data: row, error } = await supabase
    .from("order_payment_shares")
    .select("*")
    .eq("restaurant_id", order.restaurantId)
    .eq("order_id", order.id)
    .eq("id", shareId)
    .maybeSingle();
  if (error) {
    console.error("[split qr] share lookup failed", error);
    return fail("DB_ERROR", "Couldn't load the share. Try again.", 500);
  }
  if (!row) return fail("NOT_FOUND", "Share not found.", 404);
  const share = toPaymentShare(row as DbPaymentShare);
  if (share.status !== "pending") {
    return fail("SHARE_NOT_PENDING", share.status === "paid" ? "This share is already paid." : "This split was cancelled.", 409);
  }

  if (!qrStillUsable(share)) {
    // Close the old QR first so only one QR for this share can take money.
    await closeQrQuietly(rzp, share.razorpayQrId);

    const active = await loadActiveShares(supabase, order.restaurantId, order.id);
    const shareCount = active.ok ? active.value.length : share.position;
    try {
      const qr = await createShareQr(rzp, share, order.orderNumber, shareCount);
      const { error: updateError } = await supabase
        .from("order_payment_shares")
        .update({ razorpay_qr_id: qr.razorpayQrId, qr_image_url: qr.qrImageUrl, qr_expires_at: qr.qrExpiresAt })
        .eq("restaurant_id", order.restaurantId)
        .eq("id", share.id)
        .eq("status", "pending");
      if (updateError) {
        console.error("[split qr] saving QR failed", updateError);
        await closeQrQuietly(rzp, qr.razorpayQrId);
        return fail("DB_ERROR", "Couldn't make a new QR. Try again.", 500);
      }
    } catch (err) {
      console.error("[split qr] QR create failed", err);
      return fail("GATEWAY_ERROR", "The payment provider didn't respond. Try again in a moment.", 502);
    }
  }

  const shares = await loadActiveShares(supabase, order.restaurantId, order.id);
  if (!shares.ok) return fail("DB_ERROR", "Couldn't load the split bill. Try again.", 500);
  return NextResponse.json(buildSplitState(order, shares.value, toGuestPaymentShare));
}
