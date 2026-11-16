/**
 * Split bill (T38): server helpers shared by the split routes, the cash route
 * and the Razorpay webhook. SERVER-ONLY — it uses the service-role client and
 * the Razorpay secret.
 *
 * Every query that touches order_payment_shares or orders is scoped by
 * restaurant_id. Callers derive restaurantId from the order row (guest routes),
 * the staff session (cash route) or the share row (webhook), never from input.
 *
 * All money goes to the platform's Razorpay account for now (owner's decision,
 * 2026-11-16). Routing it to each restaurant is a later change to getRazorpay.
 */
import Razorpay from "razorpay";
import { createServerClient } from "@/lib/supabase/server";
import { toPaymentShare } from "@/lib/mappers";
import { sharePaidPercent, shareProgress, toPaise } from "@/lib/pricing";
import type { PaymentShare, PaymentStatus, SplitBillState } from "@/types";
import type { DbPaymentShare } from "@/types/db";

type Db = ReturnType<typeof createServerClient>;

/** How long a share's QR stays payable. Razorpay needs at least 2 minutes. */
export const SHARE_QR_LIFETIME_MS = 60 * 60_000;

/** null when Razorpay isn't configured — split bills are then unavailable. */
export function getRazorpay(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export type ShareQr = {
  razorpayQrId: string;
  qrImageUrl: string;
  qrExpiresAt: string;
};

/**
 * A fixed-amount, single-use UPI QR for one share. Single use means Razorpay
 * closes it after the first payment, so a share can't be paid twice by the
 * same QR. Throws when the gateway call fails; callers decide what to do.
 */
export async function createShareQr(
  rzp: Razorpay,
  share: Pick<PaymentShare, "id" | "orderId" | "restaurantId" | "position" | "label" | "amount">,
  orderNumber: string,
  shareCount: number
): Promise<ShareQr> {
  const expiresAt = new Date(Date.now() + SHARE_QR_LIFETIME_MS);
  const qr = await rzp.qrCode.create({
    type: "upi_qr",
    name: `Order ${orderNumber}`.slice(0, 40),
    usage: "single_use",
    fixed_amount: true,
    payment_amount: toPaise(share.amount),
    description: `${share.label} · share ${share.position} of ${shareCount}`.slice(0, 100),
    close_by: Math.floor(expiresAt.getTime() / 1000),
    notes: {
      order_id: share.orderId,
      share_id: share.id,
      restaurant_id: share.restaurantId,
    },
  });
  return { razorpayQrId: qr.id, qrImageUrl: qr.image_url, qrExpiresAt: expiresAt.toISOString() };
}

/**
 * Close a QR so it can't take a payment. Best effort: a QR that is already
 * closed (paid or expired) makes Razorpay return an error, which is fine. The
 * failure is logged, never thrown — the share row is the source of truth.
 */
export async function closeQrQuietly(rzp: Razorpay | null, qrId: string | null): Promise<void> {
  if (!rzp || !qrId) return;
  try {
    await rzp.qrCode.close(qrId);
  } catch (err) {
    console.warn("[payment-shares] closing QR failed (may already be closed)", qrId, err);
  }
}

type DbResult<T> = { ok: true; value: T } | { ok: false };

/** Active (non-cancelled) shares of an order, by position. */
export async function loadActiveShares(
  supabase: Db,
  restaurantId: string,
  orderId: string
): Promise<DbResult<PaymentShare[]>> {
  const { data, error } = await supabase
    .from("order_payment_shares")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .order("position", { ascending: true });
  if (error) {
    console.error("[payment-shares] load shares failed", error);
    return { ok: false };
  }
  return { ok: true, value: ((data ?? []) as DbPaymentShare[]).map(toPaymentShare) };
}

/** Shape the split state from an order and its active shares. */
export function buildSplitState(
  order: { total: number; paymentStatus: PaymentStatus },
  shares: PaymentShare[],
  redact: (s: PaymentShare) => PaymentShare
): SplitBillState {
  const paidAmounts = shares.filter((s) => s.status === "paid").map((s) => s.amount);
  const progress = shareProgress(order.total, paidAmounts);
  return {
    orderTotal: order.total,
    paymentStatus: order.paymentStatus,
    shares: shares.map(redact),
    paid: progress.paid,
    remaining: progress.remaining,
    paidPercent: sharePaidPercent(order.total, paidAmounts),
    onlineAvailable: getRazorpay() !== null,
  };
}

/**
 * Mark the order paid once its paid shares cover the total. Idempotent: two
 * webhooks settling the last two shares at once both write the same values.
 * Each share update commits before this read, so at least the later of two
 * concurrent callers sees both shares paid.
 */
export async function settleOrderFromShares(
  supabase: Db,
  restaurantId: string,
  orderId: string
): Promise<DbResult<{ fullyPaid: boolean }>> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("total, payment_status")
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("[payment-shares] settle: order lookup failed", orderError ?? "not found", orderId);
    return { ok: false };
  }

  const { data: paidRows, error: sharesError } = await supabase
    .from("order_payment_shares")
    .select("amount, method")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "paid");
  if (sharesError) {
    console.error("[payment-shares] settle: share lookup failed", sharesError);
    return { ok: false };
  }

  const rows = (paidRows ?? []) as Pick<DbPaymentShare, "amount" | "method">[];
  const { fullyPaid } = shareProgress(Number(order.total), rows.map((r) => Number(r.amount)));
  if (!fullyPaid || order.payment_status === "paid") return { ok: true, value: { fullyPaid } };

  // payment_method records how most of the money arrived: online if any share
  // came by UPI, otherwise cash. The per-share detail stays on the shares.
  const anyOnline = rows.some((r) => r.method === "upi");
  const { error: updateError } = await supabase
    .from("orders")
    .update({ payment_status: "paid", payment_method: anyOnline ? "razorpay" : "cash" })
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .neq("payment_status", "paid");
  if (updateError) {
    console.error("[payment-shares] settle: order update failed", updateError);
    return { ok: false };
  }
  return { ok: true, value: { fullyPaid: true } };
}

/**
 * Cancel an order's unpaid shares and close their QRs. Used when a split is
 * redone or cancelled, and when the whole bill is paid some other way.
 */
export async function cancelPendingShares(
  supabase: Db,
  rzp: Razorpay | null,
  restaurantId: string,
  orderId: string
): Promise<DbResult<null>> {
  const { data, error } = await supabase
    .from("order_payment_shares")
    .update({ status: "cancelled" })
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "pending")
    .select("razorpay_qr_id");
  if (error) {
    console.error("[payment-shares] cancel pending shares failed", error);
    return { ok: false };
  }
  const qrIds = ((data ?? []) as Pick<DbPaymentShare, "razorpay_qr_id">[]).map((r) => r.razorpay_qr_id);
  await Promise.all(qrIds.map((id) => closeQrQuietly(rzp, id)));
  return { ok: true, value: null };
}

export type SplitOrder = {
  id: string;
  restaurantId: string;
  orderNumber: string;
  total: number;
  status: string;
  paymentStatus: PaymentStatus;
};

/**
 * The order a split route acts on. Guests have no session: holding the order's
 * random UUID is the credential, as on the tracker. Pass restaurantId for staff
 * routes so one restaurant's staff can't touch another's orders.
 */
export async function loadSplitOrder(
  supabase: Db,
  orderId: string,
  restaurantId?: string
): Promise<DbResult<SplitOrder | null>> {
  let query = supabase
    .from("orders")
    .select("id, restaurant_id, order_number, total, status, payment_status")
    .eq("id", orderId);
  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[payment-shares] order lookup failed", error);
    return { ok: false };
  }
  if (!data) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      id: data.id as string,
      restaurantId: data.restaurant_id as string,
      orderNumber: data.order_number as string,
      total: Number(data.total),
      status: data.status as string,
      paymentStatus: data.payment_status as PaymentStatus,
    },
  };
}

/** True when the QR can still be shown: it exists and has a minute or more left. */
export function qrStillUsable(share: Pick<PaymentShare, "razorpayQrId" | "qrExpiresAt">): boolean {
  if (!share.razorpayQrId || !share.qrExpiresAt) return false;
  return new Date(share.qrExpiresAt).getTime() - Date.now() > 60_000;
}
