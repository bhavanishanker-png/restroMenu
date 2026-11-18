import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { toOrder, toOrderItem } from "@/lib/mappers";
import { orderIdSchema } from "@/lib/order-privacy";
import { sendBillEmail } from "@/lib/email";
import type { DbOrder, DbOrderItem } from "@/types/db";

// ---------------------------------------------------------------- POST /api/orders/[orderId]/email-bill
//
// Emails the diner their bill. Like the order tracker, the order's UUID is the
// credential — no staff session is required. The recipient is the email given
// in the body, or the one captured at checkout; one of them must be present.
//
// Abuse control: emailing to an arbitrary address is a spam vector, so this is
// rate limited per IP. The content is only ever this one order's own bill.

const bodySchema = z.object({
  // Optional: lets a diner who skipped the email field at checkout still get
  // the bill. When absent, the address stored on the order is used.
  email: z.string().email("Enter a valid email").max(254).optional(),
});

type RestaurantJoin = {
  name: string;
  gst_number: string | null;
  address: string | null;
  phone: string | null;
  currency: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 5 bill emails per IP per 5 minutes — enough for a real diner, not for spam.
  if (!(await checkRateLimit(`email-bill:${ip}`, 5, 5 * 60_000))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a few minutes." } },
      { status: 429 }
    );
  }

  const parsedId = orderIdSchema.safeParse(params.orderId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }
  const orderId = parsedId.data;

  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, order_items(*), restaurants(name, gst_number, address, phone, currency), restaurant_tables(label)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[email-bill] order load failed", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not load the order. Please try again." } },
      { status: 503 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }

  const order = toOrder(data as DbOrder);
  const items = ((data as { order_items?: DbOrderItem[] }).order_items ?? []).map(toOrderItem);

  const recipient = parsed.data.email ?? order.customerEmail;
  if (!recipient) {
    return NextResponse.json(
      { error: { code: "EMAIL_REQUIRED", message: "Enter an email address to send the bill to." } },
      { status: 400 }
    );
  }

  const rRaw = (data as { restaurants: RestaurantJoin | RestaurantJoin[] | null }).restaurants;
  const r = Array.isArray(rRaw) ? rRaw[0] : rRaw;
  const tRaw = (data as { restaurant_tables: { label: string } | { label: string }[] | null }).restaurant_tables;
  const t = Array.isArray(tRaw) ? tRaw[0] : tRaw;

  const result = await sendBillEmail({
    to: recipient,
    order,
    items,
    restaurant: {
      name: r?.name ?? "Restaurant",
      gstNumber: r?.gst_number ?? null,
      address: r?.address ?? null,
      phone: r?.phone ?? null,
      currency: r?.currency ?? "INR",
    },
    tableLabel: t?.label ?? null,
  });

  if (!result.sent) {
    if (result.reason === "not_configured") {
      return NextResponse.json(
        { error: { code: "EMAIL_NOT_CONFIGURED", message: "Emailing the bill isn't available right now." } },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: { code: "EMAIL_FAILED", message: "We couldn't send the email. Please try again." } },
      { status: 502 }
    );
  }

  // Record the send, and remember the address if the order didn't have one, so
  // a later resend works and the tracker can show "sent".
  const patch: Record<string, unknown> = { bill_emailed_at: new Date().toISOString() };
  if (!order.customerEmail) patch.customer_email = recipient;

  const { error: updateError } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("restaurant_id", order.restaurantId);

  if (updateError) {
    // The email went out; failing the request now would make the diner resend.
    console.error("[email-bill] bill_emailed_at update failed", updateError);
  }

  return NextResponse.json({ ok: true, emailedTo: recipient });
}
