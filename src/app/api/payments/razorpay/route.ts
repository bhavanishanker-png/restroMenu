import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({ orderId: z.string().uuid() });

// POST /api/payments/razorpay
// Creates a Razorpay order for an existing DB order.
// Called by POST /api/orders (step 9) and by the checkout form on payment retry.
export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // Fetch the order to get its total.
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, total, payment_status")
    .eq("id", orderId)
    .single();

  if (error || !order) {
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

  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const rzpOrder = await rzp.orders.create({
    amount: Math.round(Number(order.total) * 100), // paise
    currency: "INR",
    receipt: orderId.slice(0, 40),
  });

  // Store Razorpay order ID in payment_ref so the webhook can look up the order.
  await supabase
    .from("orders")
    .update({ payment_ref: rzpOrder.id })
    .eq("id", orderId);

  return NextResponse.json({
    razorpayOrderId: rzpOrder.id,
    amount: rzpOrder.amount,
    keyId: process.env.RAZORPAY_KEY_ID!,
  });
}
