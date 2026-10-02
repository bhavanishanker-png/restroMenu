import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { averageMoney, sumMoney } from "@/lib/pricing";
import { hourInZone, startOfRestaurantDay } from "@/lib/restaurant-time";
import { getRestaurantTimezone } from "@/lib/queries/restaurant-timezone";

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  // The restaurant's midnight, not the server's.
  const timezone = await getRestaurantTimezone(session!.restaurantId);
  const todayStart = startOfRestaurantDay(timezone).toISOString();

  const [
    { data: todayOrders, error: todayError },
    { count: liveOrders, error: liveError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total, placed_at")
      .eq("restaurant_id", session!.restaurantId)
      .neq("status", "cancelled")
      .gte("placed_at", todayStart),

    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", session!.restaurantId)
      .in("status", ["placed", "accepted", "preparing", "ready"]),
  ]);

  // A failed read used to come back as confident zeros.
  if (todayError || liveError) {
    console.error("[dashboard/stats GET]", todayError ?? liveError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load dashboard stats." } },
      { status: 500 }
    );
  }

  const ordersToday = todayOrders?.length ?? 0;
  const revenueToday = sumMoney((todayOrders ?? []).map((o) => Number(o.total)));
  const avgTicket = averageMoney(revenueToday, ordersToday);

  // Group by hour for bar chart
  const hourCounts = new Array(24).fill(0) as number[];
  for (const o of todayOrders ?? []) {
    const h = hourInZone(o.placed_at, timezone);
    hourCounts[h]++;
  }
  const hourlyData = hourCounts.map((count, hour) => ({ hour, count }));

  return NextResponse.json({
    ordersToday,
    revenueToday,
    avgTicket,
    liveOrders: liveOrders ?? 0,
    hourlyData,
  });
}
