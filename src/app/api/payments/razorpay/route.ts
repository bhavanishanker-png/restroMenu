import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { toPaise } from "@/lib/pricing";

const schema = z.object({ orderId: z.string().uuid() });

// POST /api/payments/razorpay
// Creates a Razorpay order for an existing DB order.
// Called by POST /api/orders (step 9) and by the checkout form on payment retry.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!(await checkRateLimit(`razorpay:${ip}`, 10, 60_000))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." } },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const { orderId } = parsed.data;
  const supabase = createServerClient();

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error("[payments/razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
    return NextResponse.json(
      { error: { code: "PAYMENTS_UNAVAILABLE", message: "Online payment isn't available right now. Please pay at the table." } },
      { status: 503 }
    );
  }

  // Fetch the order to get its total.
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, total, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[payments/razorpay] order lookup", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not start payment. Please try again." } },
      { status: 500 }
    );
  }
  if (!order) {
    return NextResponse.json(
      { error: { code: "ORDER_NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }

  if (order.payment_status === "paid") {
    return NextResponse.json(
      { error: { code: "ALREADY_PAID", message: "This order has already been paid." } },
      { status: 409 }
    );
  }
  if (order.status === "cancelled") {
    return NextResponse.json(
      { error: { code: "ORDER_CANCELLED", message: "This order was cancelled, so it can't be paid." } },
      { status: 409 }
    );
  }

  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  let rzpOrder: { id: string; amount: number | string };
  try {
    rzpOrder = await rzp.orders.create({
      amount: toPaise(Number(order.total)),
      currency: "INR",
      receipt: orderId.slice(0, 40),
    });
  } catch (err) {
    console.error("[payments/razorpay] gateway order create failed", err);
    return NextResponse.json(
      { error: { code: "GATEWAY_ERROR", message: "The payment provider didn't respond. Try again, or pay at the table." } },
      { status: 502 }
    );
  }

  // Store Razorpay order ID in payment_ref so the webhook can look up the order.
  // Without it the webhook can't match the payment, so don't open checkout.
  const { error: refError } = await supabase
    .from("orders")
    .update({ payment_ref: rzpOrder.id })
    .eq("id", orderId);

  if (refError) {
    console.error("[payments/razorpay] payment_ref update failed", refError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not start payment. Please try again." } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    razorpayOrderId: rzpOrder.id,
    amount: rzpOrder.amount,
    keyId,
  });
}
