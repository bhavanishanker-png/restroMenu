import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerClient } from "@/lib/supabase/server";

// POST /api/payments/webhook
// Razorpay calls this after payment events. Always returns 200 once verified —
// non-200 responses cause Razorpay to retry indefinitely.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // --- Step 1: Verify HMAC-SHA256 signature ---
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ ok: false }, { status: 500 });
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
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventType = event.event as string;
  const payment = (
    (event.payload as Record<string, unknown>)?.payment as Record<string, unknown>
  )?.entity as Record<string, unknown> | undefined;

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
  const { data: order } = await supabase
    .from("orders")
    .select("id, payment_status")
    .or(`payment_ref.eq.${razorpayOrderId},payment_ref.eq.${razorpayPaymentId}`)
    .maybeSingle();

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
      console.error("Webhook: failed to update payment_status to paid", error);
      // Return 200 anyway — we log and alert; Razorpay retrying won't help.
    }
  } else if (eventType === "payment.failed") {
    await supabase
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id);
  }

  return NextResponse.json({ ok: true });
}
