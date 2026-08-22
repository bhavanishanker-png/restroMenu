import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toOrder } from "@/lib/mappers";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { ChefHat, Plus, TrendingUp, ShoppingBag, Activity, BarChart3 } from "lucide-react";
import type { DbOrder } from "@/types/db";
import type { Order, OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: "bg-blue-100 text-blue-700",
  accepted: "bg-yellow-100 text-yellow-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  served: "bg-stone-100 text-stone-600",
  cancelled: "bg-red-100 text-red-600",
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  // Fetch today's orders + last 10 for recent list
  const [{ data: todayOrders }, { data: recentRows }] = await Promise.all([
    supabase
      .from("orders")
      .select("total, placed_at")
      .eq("restaurant_id", session.restaurantId)
      .neq("status", "cancelled")
      .gte("placed_at", todayStart),

    supabase
      .from("orders")
      .select("*, restaurant_tables(label)")
      .eq("restaurant_id", session.restaurantId)
      .order("placed_at", { ascending: false })
      .limit(10),
  ]);

  // Stats
  const ordersToday = todayOrders?.length ?? 0;
  const revenueToday = (todayOrders ?? []).reduce(
    (sum, o) => sum + Number(o.total),
    0
  );
  const avgTicket = ordersToday > 0 ? revenueToday / ordersToday : 0;

  // Live orders count (all non-terminal statuses)
  const { count: liveOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", session.restaurantId)
    .in("status", ["placed", "accepted", "preparing", "ready"]);

  // Hourly distribution
  const hourCounts = new Array(24).fill(0) as number[];
  for (const o of todayOrders ?? []) {
    const h = new Date(o.placed_at).getHours();
    hourCounts[h]++;
  }
  const hourlyData = hourCounts.map((count, hour) => ({ hour, count }));

  const recentOrders = (recentRows ?? []).map((row) => ({
    ...toOrder(row as DbOrder),
    tableLabel:
      (row as { restaurant_tables: { label: string } | null })
        .restaurant_tables?.label ?? null,
  }));

  const stats = [
    {
      label: "Orders today",
      value: ordersToday,
      icon: ShoppingBag,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Revenue today",
      value: `₹${fmt(revenueToday)}`,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Avg. ticket",
      value: `₹${fmt(avgTicket)}`,
      icon: BarChart3,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Live orders",
      value: liveOrders ?? 0,
      icon: Activity,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-900">{s.value}</p>
              <p className="text-xs text-stone-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Hourly chart */}
      <HourlyChart data={hourlyData} />

      {/* Quick actions */}
      <div className="flex gap-2">
        <Link
          href="/dashboard/kitchen"
          className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
        >
          <ChefHat className="h-4 w-4" /> Open kitchen screen
        </Link>
        <Link
          href="/dashboard/menu"
          className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
        >
          <Plus className="h-4 w-4" /> Add menu item
        </Link>
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-700">Recent orders</h3>
          <Link href="/dashboard/orders" className="text-xs text-[#C2410C] hover:underline">
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-400">
            No orders yet today.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order: Order & { tableLabel: string | null }) => (
                <tr key={order.id} className="border-b border-stone-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-stone-800">
                    #{order.orderNumber}
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">
                    {order.tableLabel ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[order.status]
                      }`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-stone-700">
                    ₹{fmt(order.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-stone-400">
                    {new Date(order.placedAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
