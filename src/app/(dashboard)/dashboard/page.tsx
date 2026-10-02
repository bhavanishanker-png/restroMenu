import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toOrder } from "@/lib/mappers";
import { averageMoney, formatMoney, sumMoney } from "@/lib/pricing";
import { hourInZone, startOfRestaurantDay } from "@/lib/restaurant-time";
import { getRestaurantTimezone } from "@/lib/queries/restaurant-timezone";
import { ORDER_STATUS_ICONS, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";
import { StatTile } from "@/components/dashboard/home/StatTile";
import { QuickActions } from "@/components/dashboard/home/QuickActions";
import { RecentOrders, type RecentOrder } from "@/components/dashboard/home/RecentOrders";
import type { DbOrder } from "@/types/db";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

/** Statuses still on the pass, in pipeline order. */
const LIVE_STATUSES = ["placed", "accepted", "preparing", "ready"] as const satisfies readonly OrderStatus[];

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Rendered twice: in the side column on wide screens, last on phones. */
function HelpCard({ className }: { className: string }) {
  return (
    <div className={`items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-4 ${className}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
          support_agent
        </span>
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-semibold text-on-surface">Need a hand?</p>
        <p className="mt-0.5 text-body-sm text-on-surface-variant">
          Support is available 24/7.
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const canManage = session.role === "owner" || session.role === "manager";
  const supabase = createServerClient();

  const now = new Date();
  // The restaurant's midnight, not the server's — a UTC host would otherwise
  // start "today" at 05:30 IST.
  const timezone = await getRestaurantTimezone(session.restaurantId);
  const todayStart = startOfRestaurantDay(timezone, now).toISOString();

  // All four reads go out together, each scoped to the session's tenant.
  const [todayRes, recentRes, restaurantRes, liveRes] = await Promise.all([
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

    // Statuses rather than a bare count, so the live tile can break the
    // pipeline down. Only in-flight orders, so the payload stays tiny.
    supabase
      .from("orders")
      .select("status")
      .eq("restaurant_id", session.restaurantId)
      .in("status", [...LIVE_STATUSES]),
  ]);

  // Never swallow a failed read: log it, and tell the user which figures are
  // unreliable instead of showing a confident zero.
  if (todayRes.error) console.error("Dashboard: today's orders query failed", todayRes.error);
  if (recentRes.error) console.error("Dashboard: recent orders query failed", recentRes.error);
  if (restaurantRes.error) console.error("Dashboard: restaurant query failed", restaurantRes.error);
  if (liveRes.error) console.error("Dashboard: live orders query failed", liveRes.error);
  const statsFailed = Boolean(todayRes.error || liveRes.error);

  const todayOrders = todayRes.data ?? [];
  const ordersToday = todayOrders.length;
  const revenueToday = sumMoney(todayOrders.map((o) => Number(o.total)));
  const avgTicket = averageMoney(revenueToday, ordersToday);

  const hourCounts = new Array(24).fill(0) as number[];
  for (const o of todayOrders) {
    hourCounts[hourInZone(o.placed_at, timezone)]++;
  }
  const hourlyData = hourCounts.map((count, hour) => ({ hour, count }));

  const liveByStatus = Object.fromEntries(LIVE_STATUSES.map((s) => [s, 0])) as Record<
    (typeof LIVE_STATUSES)[number],
    number
  >;
  for (const row of liveRes.data ?? []) {
    const status = row.status as (typeof LIVE_STATUSES)[number];
    if (status in liveByStatus) liveByStatus[status]++;
  }
  const liveOrders = (liveRes.data ?? []).length;

  const recentOrders: RecentOrder[] = (recentRes.data ?? []).map((row) => ({
    ...toOrder(row as DbOrder),
    tableLabel:
      (row as { restaurant_tables: { label: string } | null }).restaurant_tables?.label ?? null,
  }));

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });

  return (
    <div className="flex flex-col gap-6 p-margin-mobile md:p-margin-desktop">
      {/* Stats and the recent-orders list re-render as customers order. */}
      <LiveRefresh restaurantId={session.restaurantId} tables={["orders"]} />

      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-label-bold text-label-bold uppercase text-on-surface-variant">
            {dateLabel}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight text-on-surface md:text-[32px]">
            {greeting(hourInZone(now, timezone))}
            {restaurantRes.data?.name ? (
              <span className="text-on-surface-variant">, {restaurantRes.data.name}</span>
            ) : null}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
            {/* The words carry the state; the dot only reinforces it. */}
            Live — updates automatically as orders come in
          </p>
        </div>
        <Link
          href="/dashboard/kitchen"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 font-semibold text-brand-foreground shadow-level-1 transition-shadow hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background md:self-auto"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            display_settings
          </span>
          Open kitchen display
        </Link>
      </header>

      {statsFailed && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container"
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20 }} aria-hidden="true">
            error
          </span>
          Some of today&apos;s figures couldn&apos;t be loaded, so the numbers below may read low.
          The page retries on its own every 15 seconds.
        </div>
      )}

      {/* KPI tiles */}
      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          label="Live orders"
          icon="skillet"
          accent
          value={liveOrders}
          caption={
            liveOrders === 0 ? (
              "Nothing on the pass"
            ) : (
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                {LIVE_STATUSES.filter((s) => liveByStatus[s] > 0).map((s) => (
                  <span key={s} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
                      {ORDER_STATUS_ICONS[s]}
                    </span>
                    <span className="tabular-nums">{liveByStatus[s]}</span> {ORDER_STATUS_LABELS[s].toLowerCase()}
                  </span>
                ))}
              </span>
            )
          }
        />
        <StatTile label="Orders today" icon="receipt_long" value={ordersToday} caption="Since midnight, excl. cancelled" />
        <StatTile label="Revenue today" icon="payments" value={formatMoney(revenueToday)} caption="Order totals incl. tax" />
        <StatTile label="Avg. ticket" icon="local_activity" value={formatMoney(avgTicket)} caption="Per order today" />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <HourlyChart data={hourlyData} />
          <RecentOrders timezone={timezone} orders={recentOrders} canManage={canManage} failed={Boolean(recentRes.error)} />
        </div>

        {/* On phones the shortcuts come straight after the KPIs; on wide
            screens they sit in the right-hand column. */}
        <aside className="order-first flex min-w-0 flex-col gap-6 xl:order-none">
          <QuickActions canManage={canManage} />

          <HelpCard className="hidden xl:flex" />
        </aside>

        <HelpCard className="flex xl:hidden" />
      </div>
    </div>
  );
}
