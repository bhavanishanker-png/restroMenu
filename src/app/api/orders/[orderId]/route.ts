import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth";
import { toOrder, toOrderItem } from "@/lib/mappers";
import { orderIdSchema, toGuestOrder } from "@/lib/order-privacy";
import type { DbOrder, DbOrderItem } from "@/types/db";

// ---------------------------------------------------------------- GET /api/orders/[orderId]
// Two audiences:
//
// - Guest (default): the order tracker's 15s poll. No session exists, so the
//   order's UUID is the credential, and the response is redacted to what the
//   tracker shows — see toGuestOrder.
// - Staff (`?view=staff`): the Orders page detail sheet. Requires a staff
//   session and is scoped to that session's restaurant, so one restaurant's
//   staff can never read another's orders. Returns the full order.
//
// Staff mode is opt-in rather than inferred from the cookie: a staff member
// tracking their own meal at another restaurant must still get the guest view
// rather than a 404 from their own restaurant's scope.

export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
): Promise<NextResponse> {
  const parsedId = orderIdSchema.safeParse(params.orderId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }
  const orderId = parsedId.data;
  const staffView = req.nextUrl.searchParams.get("view") === "staff";

  let restaurantId: string | null = null;
  if (staffView) {
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
        { status: 401 }
      );
    }
    restaurantId = session.restaurantId;
  }

  const supabase = createServerClient();

  let query = supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId);
  if (restaurantId) query = query.eq("restaurant_id", restaurantId);

  const { data, error } = await query.maybeSingle();

  // A database failure used to be reported as 404, telling a guest who had
  // just paid that their order did not exist.
  if (error) {
    console.error("[orders/:id GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load the order. Try again." } },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Order not found." } },
      { status: 404 }
    );
  }

  const order = toOrder(data as DbOrder);
  return NextResponse.json({
    order: staffView ? order : toGuestOrder(order),
    items: ((data.order_items ?? []) as DbOrderItem[]).map(toOrderItem),
  });
}
