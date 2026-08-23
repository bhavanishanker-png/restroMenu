import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toOrder } from "@/lib/mappers";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
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
  placed: "bg-primary-fixed text-on-primary-fixed-variant",
  accepted: "bg-surface-container-highest text-on-surface-variant",
  preparing: "bg-surface-container-highest text-on-surface-variant",
  ready: "bg-secondary-container text-on-secondary-container",
  served: "bg-surface-container text-on-surface-variant",
  cancelled: "bg-tertiary/10 text-tertiary",
};

const STATUS_ICONS: Record<OrderStatus, string> = {
  placed: "fiber_new",
  accepted: "thumb_up",
  preparing: "skillet",
  ready: "check_circle",
  served: "done_all",
  cancelled: "cancel",
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const [{ data: todayOrders }, { data: recentRows }, restaurantData] = await Promise.all([
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

    supabase
      .from("restaurants")
      .select("name")
      .eq("id", session.restaurantId)
      .single(),
  ]);

  const ordersToday = todayOrders?.length ?? 0;
  const revenueToday = (todayOrders ?? []).reduce((sum, o) => sum + Number(o.total), 0);
  const avgTicket = ordersToday > 0 ? revenueToday / ordersToday : 0;

  const { count: liveOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", session.restaurantId)
    .in("status", ["placed", "accepted", "preparing", "ready"]);

  const hourCounts = new Array(24).fill(0) as number[];
  for (const o of todayOrders ?? []) {
    hourCounts[new Date(o.placed_at).getHours()]++;
  }
  const hourlyData = hourCounts.map((count, hour) => ({ hour, count }));

  const recentOrders = (recentRows ?? []).map((row) => ({
    ...toOrder(row as DbOrder),
    tableLabel: (row as { restaurant_tables: { label: string } | null }).restaurant_tables?.label ?? null,
  }));

  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
        <div>
          <h1 className="font-headline-lg-mobile text-on-surface" style={{ fontSize: 28 }}>
            {restaurantData.data?.name ?? "Dashboard"}
          </h1>
          <p className="font-body-md text-on-surface-variant mt-1">Today&apos;s Overview</p>
        </div>
        {/* Accepting orders status chip */}
        <div className="flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-full shadow-level-1 border border-outline-variant/30 self-start">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3f6653] animate-pulse shadow-[0_0_6px_rgba(63,102,83,0.6)]" />
          <span className="font-label-bold text-label-bold text-on-surface">Accepting Orders</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-sm md:gap-gutter lg:grid-cols-4">
        {/* Orders today */}
        <div className="flex flex-col gap-xs rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-level-1 tactile-hover">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-bold text-label-bold">Orders Today</span>
            <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 20 }}>receipt_long</span>
          </div>
          <div className="font-display text-on-surface leading-none" style={{ fontSize: 40 }}>{ordersToday}</div>
          <div className="font-body-sm text-on-surface-variant mt-1">All time</div>
        </div>

        {/* Revenue */}
        <div className="flex flex-col gap-xs rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-level-1 tactile-hover">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-bold text-label-bold">Revenue Today</span>
            <span className="material-symbols-outlined text-[#3f6653]" style={{ fontSize: 20 }}>payments</span>
          </div>
          <div className="font-display text-on-surface leading-none" style={{ fontSize: 32 }}>₹{fmt(revenueToday)}</div>
          <div className="font-body-sm text-on-surface-variant mt-1">Net sales</div>
        </div>

        {/* Avg ticket */}
        <div className="flex flex-col gap-xs rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-level-1 tactile-hover">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-bold text-label-bold">Avg. Ticket</span>
            <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 20 }}>local_activity</span>
          </div>
          <div className="font-display text-on-surface leading-none" style={{ fontSize: 32 }}>₹{fmt(avgTicket)}</div>
          <div className="font-body-sm text-on-surface-variant mt-1">Per order</div>
        </div>

        {/* Live orders — highlighted card */}
        <div className="relative flex flex-col gap-xs overflow-hidden rounded-xl border border-primary/30 bg-primary-container p-md shadow-level-1 tactile-hover">
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary opacity-20 blur-xl" />
          <div className="flex items-center justify-between text-on-primary-container mb-1 relative z-10">
            <span className="font-label-bold text-label-bold">Live Orders</span>
            <span className="material-symbols-outlined fill" style={{ fontSize: 20 }}>skillet</span>
          </div>
          <div className="font-display text-on-primary-container leading-none relative z-10" style={{ fontSize: 40 }}>
            {liveOrders ?? 0}
          </div>
          <div className="font-body-sm text-primary-fixed-dim mt-1 relative z-10">In kitchen now</div>
        </div>
      </div>

      {/* Bento grid: chart + quick actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-lg">
        {/* Chart + recent orders column */}
        <div className="xl:col-span-2 flex flex-col gap-lg">
          <HourlyChart data={hourlyData} />

          {/* Recent orders table */}
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-level-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-md py-sm">
              <h3 className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Recent Orders</h3>
              <Link href="/dashboard/orders" className="font-label-bold text-label-bold text-primary">
                View All
              </Link>
            </div>

            {recentOrders.length === 0 ? (
              <p className="px-md py-lg text-center font-body-md text-on-surface-variant">
                No orders yet today.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-lowest">
                      <th className="font-label-bold text-label-bold text-on-surface-variant p-sm pl-md whitespace-nowrap">Order #</th>
                      <th className="font-label-bold text-label-bold text-on-surface-variant p-sm whitespace-nowrap">Table</th>
                      <th className="font-label-bold text-label-bold text-on-surface-variant p-sm whitespace-nowrap">Total</th>
                      <th className="font-label-bold text-label-bold text-on-surface-variant p-sm whitespace-nowrap">Time</th>
                      <th className="font-label-bold text-label-bold text-on-surface-variant p-sm pr-md whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order: Order & { tableLabel: string | null }) => (
                      <tr
                        key={order.id}
                        className="border-b border-outline-variant/20 last:border-0 hover:bg-surface-container-highest transition-colors cursor-pointer"
                      >
                        <td className="p-sm pl-md py-4 font-body-md text-on-surface font-semibold">
                          #{order.orderNumber}
                        </td>
                        <td className="p-sm py-4 font-body-md text-on-surface-variant">
                          {order.tableLabel ?? "Takeaway"}
                        </td>
                        <td className="p-sm py-4 font-body-md text-on-surface font-semibold">
                          ₹{fmt(order.total)}
                        </td>
                        <td className="p-sm py-4 font-body-sm text-on-surface-variant">
                          {new Date(order.placedAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-sm pr-md py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-label-bold text-[10px] ${STATUS_COLORS[order.status]}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                              {STATUS_ICONS[order.status]}
                            </span>
                            {STATUS_LABELS[order.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions column */}
        <div className="xl:col-span-1">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-level-1 sticky top-6">
            <h3 className="font-headline-sm text-on-surface mb-sm" style={{ fontSize: 16 }}>Quick Actions</h3>
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/kitchen"
                className="flex w-full items-center justify-between p-4 bg-primary text-on-primary rounded-lg tactile-hover shadow-level-1 font-body-md font-medium"
              >
                <span className="flex items-center gap-sm">
                  <span className="material-symbols-outlined fill" style={{ fontSize: 20 }}>display_settings</span>
                  Open Kitchen Display
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
              </Link>
              <Link
                href="/dashboard/menu"
                className="flex w-full items-center justify-between p-4 bg-surface-container border border-outline-variant text-on-surface rounded-lg tactile-hover hover:bg-surface-container-high font-body-md font-medium transition-colors"
              >
                <span className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>add_circle</span>
                  Add Menu Item
                </span>
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>arrow_forward</span>
              </Link>
              <Link
                href="/dashboard/tables"
                className="flex w-full items-center justify-between p-4 bg-surface-container border border-outline-variant text-on-surface rounded-lg tactile-hover hover:bg-surface-container-high font-body-md font-medium transition-colors"
              >
                <span className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[#3f6653]" style={{ fontSize: 20 }}>qr_code_scanner</span>
                  Print QR Codes
                </span>
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>arrow_forward</span>
              </Link>
            </div>

            {/* Support card */}
            <div className="mt-lg p-sm bg-inverse-surface rounded-xl text-inverse-on-surface flex items-start gap-sm">
              <span className="material-symbols-outlined text-primary-fixed-dim" style={{ fontSize: 22 }}>support_agent</span>
              <div>
                <h4 className="font-label-bold text-label-bold text-primary-fixed">Need Help?</h4>
                <p className="font-body-sm text-body-sm mt-1 opacity-80">Support is available 24/7.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
