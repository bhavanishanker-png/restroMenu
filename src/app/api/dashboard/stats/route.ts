import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const [
    { data: todayOrders },
    { count: liveOrders },
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

  const ordersToday = todayOrders?.length ?? 0;
  const revenueToday = (todayOrders ?? []).reduce(
    (sum, o) => sum + Number(o.total),
    0
  );
  const avgTicket = ordersToday > 0 ? revenueToday / ordersToday : 0;

  // Group by hour for bar chart
  const hourCounts = new Array(24).fill(0) as number[];
  for (const o of todayOrders ?? []) {
    const h = new Date(o.placed_at).getHours();
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
