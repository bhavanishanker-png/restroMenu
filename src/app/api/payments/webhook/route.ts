import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { toPaise } from "@/lib/pricing";
import { cancelPendingShares, getRazorpay, settleOrderFromShares } from "@/lib/payment-shares";
import { broadcastOrderUpdate } from "@/lib/realtime";
import type { DbPaymentShare } from "@/types/db";

// POST /api/payments/webhook
// Razorpay calls this after payment events. Once verified, returns 200 for
// anything a retry can't fix (unknown events, unknown orders, replays) and 500
// only when our own database write fails — that's exactly the case Razorpay's
// retry exists for, and the handler is idempotent so a retry is safe.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // --- Step 1: Verify HMAC-SHA256 signature ---
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Webhook secret is not configured." } },
      { status: 500 }
    );
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  // Use timingSafeEqual to prevent timing attacks.
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return NextResponse.json(
      { error: { code: "INVALID_SIGNATURE", message: "Signature mismatch." } },
      { status: 400 }
    );
  }

  // --- Step 2: Parse event ---
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Body is not valid JSON." } },
      { status: 400 }
    );
  }

  const eventType = event.event as string;
  const payment = (
    (event.payload as Record<string, unknown>)?.payment as Record<string, unknown>
  )?.entity as Record<string, unknown> | undefined;

  // Split bill (T38): a guest paid their share by scanning its QR.
  if (eventType === "qr_code.credited") {
    const qrCode = (
      (event.payload as Record<string, unknown>)?.qr_code as Record<string, unknown>
    )?.entity as Record<string, unknown> | undefined;
    return handleShareCredited(qrCode?.id, payment);
  }

  // Always acknowledge unknown events.
  if (!payment || (eventType !== "payment.captured" && eventType !== "payment.failed")) {
    return NextResponse.json({ ok: true });
  }

  const razorpayOrderId = payment.order_id as string | undefined;
  const razorpayPaymentId = payment.id as string | undefined;

  if (!razorpayOrderId || !razorpayPaymentId) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerClient();

  // --- Step 3: Find our DB order ---
  // Look up by razorpayOrderId (initial value of payment_ref) OR
  // by razorpayPaymentId (value set on first successful processing).
  // This makes the handler idempotent: a replay finds the already-updated row.
  const { data: order, error: lookupError } = await supabase
    .from("orders")
    .select("id, restaurant_id, payment_status")
    .or(`payment_ref.eq.${razorpayOrderId},payment_ref.eq.${razorpayPaymentId}`)
    .maybeSingle();

  if (lookupError) {
    console.error("Webhook: order lookup failed", lookupError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Order lookup failed." } },
      { status: 500 }
    );
  }

  if (!order) {
    // Unknown order — still return 200 so Razorpay doesn't retry forever.
    console.error("Webhook: order not found for razorpay order", razorpayOrderId);
    return NextResponse.json({ ok: true });
  }

  // --- Step 4: Idempotency check ---
  if (order.payment_status === "paid") {
    return NextResponse.json({ ok: true }); // already processed
  }

  // --- Step 5: Mutate payment state ---
  if (eventType === "payment.captured") {
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_ref: razorpayPaymentId, // overwrite order ID with payment ID
      })
      .eq("id", order.id);

    if (error) {
      // A captured payment that isn't recorded is lost money. Let Razorpay
      // retry — a transient DB failure will usually clear.
      console.error("Webhook: failed to update payment_status to paid", error);
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Failed to record payment." } },
        { status: 500 }
      );
    }

    // The whole bill was paid in one go, so any split shares still open must
    // not take more money. Best effort: the payment is already recorded, and
    // a failure here is logged rather than retried.
    const cancelled = await cancelPendingShares(supabase, getRazorpay(), order.restaurant_id as string, order.id as string);
    if (!cancelled.ok) console.error("Webhook: couldn't cancel open split shares for paid order", order.id);

    await broadcastOrderUpdate(order.id as string);
  } else if (eventType === "payment.failed") {
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id);

    if (error) {
      console.error("Webhook: failed to update payment_status to failed", error);
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Failed to record payment failure." } },
        { status: 500 }
      );
    }

    await broadcastOrderUpdate(order.id as string);
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------- split bill share

/**
 * qr_code.credited → mark that share paid, then mark the order paid if the
 * paid shares now cover it. Idempotent: the update only matches a share that
 * isn't paid yet, and settling twice writes the same values.
 *
 * A share that was cancelled (the split was redone just as someone scanned)
 * is still recorded as paid: the money really arrived, so it must count, and
 * the log line lets the owner refund any overpayment.
 */
async function handleShareCredited(
  qrId: unknown,
  payment: Record<string, unknown> | undefined
): Promise<NextResponse> {
  const paymentId = payment?.id;
  if (typeof qrId !== "string" || typeof paymentId !== "string") {
    console.error("Webhook: qr_code.credited without a QR or payment id");
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerClient();

  // The restaurant is unknown until the share is found by its unique QR id.
  const { data: row, error: lookupError } = await supabase
    .from("order_payment_shares")
    .select("id, restaurant_id, order_id, amount, status")
    .eq("razorpay_qr_id", qrId)
    .maybeSingle();
  if (lookupError) {
    console.error("Webhook: share lookup failed", lookupError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Share lookup failed." } },
      { status: 500 }
    );
  }
  if (!row) {
    // Money arrived for a QR we no longer track (e.g. replaced just as it was
    // paid). Never silent: this needs a manual refund or reconciliation.
    console.error("Webhook: UNMATCHED split-bill QR payment — reconcile manually", { qrId, paymentId });
    return NextResponse.json({ ok: true });
  }

  const share = row as Pick<DbPaymentShare, "id" | "restaurant_id" | "order_id" | "amount" | "status">;
  if (share.status === "cancelled") {
    console.error("Webhook: payment for a CANCELLED split share — recorded; check for overpayment", { shareId: share.id, paymentId });
  }
  if (typeof payment?.amount === "number" && payment.amount !== toPaise(Number(share.amount))) {
    console.error("Webhook: split share paid a different amount than expected", {
      shareId: share.id,
      expectedPaise: toPaise(Number(share.amount)),
      paidPaise: payment.amount,
    });
  }

  if (share.status !== "paid") {
    const { error } = await supabase
      .from("order_payment_shares")
      .update({
        status: "paid",
        method: "upi",
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString(),
      })
      .eq("restaurant_id", share.restaurant_id)
      .eq("id", share.id)
      .neq("status", "paid");
    if (error) {
      console.error("Webhook: failed to mark split share paid", error);
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Failed to record share payment." } },
        { status: 500 }
      );
    }
  }

  // Runs on replays too, so a settle that failed last time is retried.
  const settled = await settleOrderFromShares(supabase, share.restaurant_id, share.order_id);
  if (!settled.ok) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to settle the order." } },
      { status: 500 }
    );
  }

  // Push the paid share to the other phones at the table (best-effort).
  await broadcastOrderUpdate(share.order_id);

  return NextResponse.json({ ok: true });
}
