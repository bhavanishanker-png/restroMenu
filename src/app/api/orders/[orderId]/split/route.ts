import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ai/guardrails";
import { toPaymentShare } from "@/lib/mappers";
import { orderIdSchema, toGuestPaymentShare } from "@/lib/order-privacy";
import {
  MAX_SPLIT_SHARES,
  MIN_SHARE_AMOUNT,
  formatMoney,
  remainingAfterShares,
  roundMoney,
  sharesMatchTotal,
  splitEqually,
} from "@/lib/pricing";
import {
  buildSplitState,
  cancelPendingShares,
  createShareQr,
  getRazorpay,
  loadActiveShares,
  loadSplitOrder,
  settleOrderFromShares,
  type SplitOrder,
} from "@/lib/payment-shares";
import type { DbPaymentShare } from "@/types/db";
import type { PaymentShare } from "@/types";

// /api/orders/[orderId]/split — split an order's bill into per-person UPI QRs (T38).
//
// Guest routes: holding the order's random UUID is the credential, as on the
// tracker, and the response is redacted with toGuestPaymentShare. The
// restaurant is always taken from the order row, never from the request.
//
//   GET    → current split state (polled by the tracker while the sheet is open)
//   POST   → create or redo the split; amounts are computed here, never trusted
//   DELETE → cancel the split; only allowed while no share has been paid

function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

const labelSchema = z.string().trim().min(1).max(40);

// Amounts must be whole paise: 100.005 is not a price anyone can pay.
const amountSchema = z
  .number()
  .finite()
  .min(MIN_SHARE_AMOUNT, `Each share must be at least ${formatMoney(MIN_SHARE_AMOUNT)}.`)
  .max(10_000_000)
  .refine((n) => roundMoney(n) === n, "Amounts can have at most 2 decimal places.");

const splitSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("equal"),
    count: z.number().int().min(2).max(MAX_SPLIT_SHARES),
    labels: z.array(labelSchema).max(MAX_SPLIT_SHARES).optional(),
  }),
  z.object({
    mode: z.literal("custom"),
    shares: z
      .array(z.object({ label: labelSchema, amount: amountSchema }))
      .min(2, "Split between at least 2 people.")
      .max(MAX_SPLIT_SHARES, `Split between at most ${MAX_SPLIT_SHARES} people.`),
  }),
]);

type Loaded = { ok: true; order: SplitOrder } | { ok: false; response: NextResponse };

async function loadOrder(supabase: ReturnType<typeof createServerClient>, rawId: string): Promise<Loaded> {
  const parsedId = orderIdSchema.safeParse(rawId);
  if (!parsedId.success) return { ok: false, response: fail("NOT_FOUND", "Order not found.", 404) };
  const result = await loadSplitOrder(supabase, parsedId.data);
  if (!result.ok) return { ok: false, response: fail("DB_ERROR", "Couldn't load the order. Try again.", 500) };
  if (!result.value) return { ok: false, response: fail("NOT_FOUND", "Order not found.", 404) };
  return { ok: true, order: result.value };
}

async function stateResponse(
  supabase: ReturnType<typeof createServerClient>,
  order: SplitOrder,
  status = 200
): Promise<NextResponse> {
  let shares = await loadActiveShares(supabase, order.restaurantId, order.id);
  if (!shares.ok) return fail("DB_ERROR", "Couldn't load the split bill. Try again.", 500);
  // Self-heal: if every share is paid but the order roll-up failed earlier
  // (a webhook or cash tap hit a DB error), settle it now.
  if (shares.value.length > 0 && shares.value.every((s) => s.status === "paid") && order.paymentStatus !== "paid") {
    const settled = await settleOrderFromShares(supabase, order.restaurantId, order.id);
    if (!settled.ok) console.error("[split] self-heal settle failed", order.id);
    shares = await loadActiveShares(supabase, order.restaurantId, order.id);
    if (!shares.ok) return fail("DB_ERROR", "Couldn't load the split bill. Try again.", 500);
  }
  // Re-read the payment status: a share settling may have just paid the order.
  const fresh = await loadSplitOrder(supabase, order.id, order.restaurantId);
  const paymentStatus = fresh.ok && fresh.value ? fresh.value.paymentStatus : order.paymentStatus;
  return NextResponse.json(
    buildSplitState({ total: order.total, paymentStatus }, shares.value, toGuestPaymentShare),
    { status }
  );
}

// ---------------------------------------------------------------- GET

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const loaded = await loadOrder(supabase, params.orderId);
  if (!loaded.ok) return loaded.response;
  return stateResponse(supabase, loaded.order);
}

// ---------------------------------------------------------------- POST

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  if (!(await checkRateLimit(`split:${clientIp(req.headers)}`, 10, 60_000))) {
    return fail("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = splitSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid split.", 400);
  }

  const rzp = getRazorpay();
  if (!rzp) {
    console.error("[split POST] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
    return fail("PAYMENTS_UNAVAILABLE", "Splitting the bill isn't available right now. Please pay at the counter.", 503);
  }

  const supabase = createServerClient();
  const loaded = await loadOrder(supabase, params.orderId);
  if (!loaded.ok) return loaded.response;
  const { order } = loaded;

  if (order.status === "cancelled") {
    return fail("ORDER_CANCELLED", "This order was cancelled, so there's nothing to pay.", 409);
  }
  if (order.paymentStatus === "paid") {
    return fail("ALREADY_PAID", "This bill has already been paid.", 409);
  }

  // Amounts are computed here from the stored order total. The client only
  // says how to split; for custom splits its amounts must add up exactly.
  const body = parsed.data;
  let planned: { label: string; amount: number }[];
  if (body.mode === "equal") {
    planned = splitEqually(order.total, body.count).map((amount, i) => ({
      label: body.labels?.[i] ?? `Person ${i + 1}`,
      amount,
    }));
    if (planned.some((s) => s.amount < MIN_SHARE_AMOUNT)) {
      return fail("SHARE_TOO_SMALL", `Each share must be at least ${formatMoney(MIN_SHARE_AMOUNT)}. Split between fewer people.`, 422);
    }
  } else {
    planned = body.shares;
    const amounts = planned.map((s) => s.amount);
    if (!sharesMatchTotal(order.total, amounts)) {
      const left = remainingAfterShares(order.total, amounts);
      const detail = left > 0 ? `${formatMoney(left)} is still unassigned` : `${formatMoney(-left)} too much is assigned`;
      return fail("SPLIT_MISMATCH", `The shares must add up to ${formatMoney(order.total)} — ${detail}.`, 422);
    }
  }

  // A split is locked once anyone has paid: moving money between people after
  // that would leave someone over- or under-charged.
  const existing = await loadActiveShares(supabase, order.restaurantId, order.id);
  if (!existing.ok) return fail("DB_ERROR", "Couldn't split the bill. Try again.", 500);
  if (existing.value.some((s) => s.status === "paid")) {
    return fail("SPLIT_LOCKED", "Someone has already paid their share, so this split can't be changed.", 409);
  }

  const cancelled = await cancelPendingShares(supabase, rzp, order.restaurantId, order.id);
  if (!cancelled.ok) return fail("DB_ERROR", "Couldn't split the bill. Try again.", 500);

  const { data: inserted, error: insertError } = await supabase
    .from("order_payment_shares")
    .insert(
      planned.map((s, i) => ({
        restaurant_id: order.restaurantId,
        order_id: order.id,
        position: i + 1,
        label: s.label,
        amount: s.amount,
      }))
    )
    .select("*");
  if (insertError) {
    // 23505: another guest split this bill at the same moment.
    if (insertError.code === "23505") {
      return fail("SPLIT_CONFLICT", "Someone else just split this bill. Refresh to see their split.", 409);
    }
    console.error("[split POST] insert shares failed", insertError);
    return fail("DB_ERROR", "Couldn't split the bill. Try again.", 500);
  }

  // One QR per share, made in parallel. A share whose QR fails keeps
  // qr_image_url null and the guest gets a "Retry" button for it.
  const shares: PaymentShare[] = ((inserted ?? []) as DbPaymentShare[]).map(toPaymentShare);
  await Promise.all(
    shares.map(async (share) => {
      try {
        const qr = await createShareQr(rzp, share, order.orderNumber, shares.length);
        const { error } = await supabase
          .from("order_payment_shares")
          .update({ razorpay_qr_id: qr.razorpayQrId, qr_image_url: qr.qrImageUrl, qr_expires_at: qr.qrExpiresAt })
          .eq("restaurant_id", order.restaurantId)
          .eq("id", share.id);
        if (error) console.error("[split POST] saving QR failed", share.id, error);
      } catch (err) {
        console.error("[split POST] QR create failed", share.id, err);
      }
    })
  );

  return stateResponse(supabase, order, 201);
}

// ---------------------------------------------------------------- DELETE

export async function DELETE(
  req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  if (!(await checkRateLimit(`split:${clientIp(req.headers)}`, 10, 60_000))) {
    return fail("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
  }

  const supabase = createServerClient();
  const loaded = await loadOrder(supabase, params.orderId);
  if (!loaded.ok) return loaded.response;
  const { order } = loaded;

  const existing = await loadActiveShares(supabase, order.restaurantId, order.id);
  if (!existing.ok) return fail("DB_ERROR", "Couldn't cancel the split. Try again.", 500);
  if (existing.value.some((s) => s.status === "paid")) {
    return fail("SPLIT_LOCKED", "Someone has already paid their share, so this split can't be cancelled.", 409);
  }

  const cancelled = await cancelPendingShares(supabase, getRazorpay(), order.restaurantId, order.id);
  if (!cancelled.ok) return fail("DB_ERROR", "Couldn't cancel the split. Try again.", 500);
  return stateResponse(supabase, order);
}
