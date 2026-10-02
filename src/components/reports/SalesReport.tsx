"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/dashboard/home/StatTile";
import {
  averageMoney,
  formatMoney,
  percentChange,
  percentOf,
  sumMoney,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { DailyRevenueChart, type DailyPoint } from "./DailyRevenueChart";

// ---------------------------------------------------------------- types

type DayRow = {
  date: string;
  orders: number;
  revenue: number;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  packingCharge: number;
};

type ApiResponse = {
  days: DayRow[];
  totals: { orders: number; revenue: number };
};

type Range = { from: string; to: string };

// ---------------------------------------------------------------- dates

/** Local calendar date as YYYY-MM-DD. Not `toISOString()`, which is the UTC
 *  date — in IST that is still yesterday until 05:30. */
function isoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

/** Every calendar date from `from` to `to`, inclusive. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

function formatDay(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", opts);
}

/** `days` back from today, today included (7 days = today and the 6 before). */
const PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function presetRange(days: number): Range {
  const to = isoDate(new Date());
  return { from: addDays(to, -(days - 1)), to };
}

/** The same number of days immediately before `range`. */
function previousRange(range: Range): Range {
  const length = datesBetween(range.from, range.to).length;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

async function fetchSales(range: Range): Promise<ApiResponse> {
  const params = new URLSearchParams({
    dateFrom: new Date(`${range.from}T00:00:00`).toISOString(),
    dateTo: new Date(`${range.to}T23:59:59.999`).toISOString(),
  });
  const res = await fetch(`/api/reports/sales?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApiResponse;
}

// ---------------------------------------------------------------- small pieces

function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined shrink-0", className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** "↑ 12.5% vs previous 7 days" — direction carried by icon and sign, not colour alone. */
function Delta({ change, periodLabel }: { change: number | null; periodLabel: string }) {
  if (change === null) {
    return <span>No sales in the {periodLabel} before to compare</span>;
  }
  const flat = change === 0;
  const up = change > 0;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold",
          flat ? "text-on-surface" : up ? "text-success" : "text-error"
        )}
      >
        <Icon name={flat ? "trending_flat" : up ? "trending_up" : "trending_down"} size={16} />
        {up ? "+" : ""}
        {change}%
      </span>
      <span>vs previous {periodLabel}</span>
    </span>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-on-surface">{title}</h2>
          {description && <p className="text-body-sm text-on-surface-variant">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- main

export function SalesReport() {
  const [range, setRange] = useState<Range>(() => presetRange(7));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [previous, setPrevious] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (range.from > range.to) return;
    setLoading(true);
    setFailed(false);
    const [current, prior] = await Promise.allSettled([
      fetchSales(range),
      fetchSales(previousRange(range)),
    ]);
    if (current.status === "fulfilled") {
      setData(current.value);
    } else {
      console.error("[reports] sales load failed", current.reason);
      setFailed(true);
      toast.error("Couldn't load the report. Check your connection and try again.");
    }
    // The comparison is a nice-to-have: without it the tiles just omit the delta.
    if (prior.status === "fulfilled") {
      setPrevious(prior.value);
    } else {
      console.error("[reports] previous-period load failed", prior.reason);
      setPrevious(null);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const dates = useMemo(() => datesBetween(range.from, range.to), [range]);
  const periodDays = dates.length;
  const periodLabel = periodDays === 1 ? "day" : `${periodDays} days`;
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.days);
    return r.from === range.from && r.to === range.to;
  });

  // ---- Derived figures (all money via lib/pricing) ----
  const summary = useMemo(() => {
    if (!data) return null;
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    const chartDays: DailyPoint[] = dates.map((date) => {
      const d = byDate.get(date);
      return { date, revenue: d?.revenue ?? 0, orders: d?.orders ?? 0 };
    });

    const revenue = data.totals.revenue;
    const orders = data.totals.orders;
    const avgOrder = averageMoney(revenue, orders);
    // Per *calendar* day in the range — the old figure divided by days that
    // had sales, which overstated a quiet week.
    const avgPerDay = averageMoney(revenue, periodDays);
    const best = data.days.reduce<DayRow | null>(
      (top, d) => (top === null || d.revenue > top.revenue ? d : top),
      null
    );

    const itemSales = sumMoney(data.days.map((d) => d.subtotal));
    const tax = sumMoney(data.days.map((d) => d.tax));
    const service = sumMoney(data.days.map((d) => d.serviceCharge));
    const packing = sumMoney(data.days.map((d) => d.packingCharge));

    const prevRevenue = previous?.totals.revenue ?? 0;
    const prevOrders = previous?.totals.orders ?? 0;

    return {
      chartDays,
      revenue,
      orders,
      avgOrder,
      avgPerDay,
      best,
      breakdown: [
        { key: "items", label: "Item sales", hint: "Menu prices, before tax", icon: "restaurant_menu", amount: itemSales },
        { key: "tax", label: "Tax (GST)", hint: "Collected on behalf of the government", icon: "account_balance", amount: tax },
        { key: "service", label: "Service charge", hint: "Dine-in orders", icon: "room_service", amount: service },
        { key: "packing", label: "Packing charge", hint: "Takeaway orders", icon: "takeout_dining", amount: packing },
      ],
      revenueChange: previous ? percentChange(revenue, prevRevenue) : undefined,
      ordersChange: previous ? percentChange(orders, prevOrders) : undefined,
      avgOrderChange: previous
        ? percentChange(avgOrder, averageMoney(prevRevenue, prevOrders))
        : undefined,
    };
  }, [data, previous, dates, periodDays]);

  function exportCSV() {
    if (!data) return;
    const header = "Date,Orders,Item sales,Tax,Service charge,Packing charge,Total";
    const rows = data.days.map((d) =>
      [
        d.date,
        d.orders,
        d.subtotal.toFixed(2),
        d.tax.toFixed(2),
        d.serviceCharge.toFixed(2),
        d.packingCharge.toFixed(2),
        d.revenue.toFixed(2),
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${range.from}-to-${range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const rangeLabel =
    range.from === range.to
      ? formatDay(range.from, { weekday: "long", day: "numeric", month: "long" })
      : `${formatDay(range.from, { day: "numeric", month: "short" })} – ${formatDay(range.to, { day: "numeric", month: "short", year: "numeric" })}`;
  const isEmpty = summary !== null && summary.orders === 0;
  const firstLoad = loading && data === null;

  return (
    <div className="flex flex-col gap-4 p-margin-mobile md:p-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Date range presets"
            className="flex w-full items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1 sm:w-auto"
          >
            {PRESETS.map((p) => {
              const active = activePreset?.label === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRange(presetRange(p.days))}
                  className={cn(
                    "h-9 flex-1 whitespace-nowrap rounded-lg px-2 text-sm font-medium transition-colors duration-fast sm:flex-none sm:px-3",
                    active
                      ? "bg-surface-container-lowest text-on-surface shadow-level-1"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Input
              type="date"
              aria-label="From date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="h-11 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            />
            <span className="text-sm text-on-surface-variant">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={range.to}
              min={range.from}
              max={isoDate(new Date())}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="h-11 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            />
          </div>

          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto lg:ml-auto"
            onClick={exportCSV}
            disabled={!data || data.days.length === 0}
          >
            <Icon name="download" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-on-surface-variant">
        <p>
          <span className="font-semibold text-on-surface">{rangeLabel}</span>
          {" · "}
          {periodLabel}, compared with the {periodDays === 1 ? "day" : `${periodDays} days`} before
        </p>
        {loading && !firstLoad && (
          <p className="flex items-center gap-1.5" aria-live="polite">
            <Icon name="sync" size={16} />
            Updating…
          </p>
        )}
      </div>

      {firstLoad ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : failed && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-16 text-center shadow-level-1">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-error/30 bg-error-container text-on-error-container">
            <Icon name="cloud_off" size={28} />
          </span>
          <div className="space-y-1">
            <p className="font-display text-title text-on-surface">Couldn&apos;t load the report</p>
            <p className="text-sm text-on-surface-variant">Your sales data is safe — this is a connection problem.</p>
          </div>
          <Button variant="outline" onClick={() => void load()}>
            <Icon name="refresh" />
            Try again
          </Button>
        </div>
      ) : summary && isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-16 text-center shadow-level-1">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-outline-variant bg-surface-container text-on-surface-variant">
            <Icon name="bar_chart" size={28} />
          </span>
          <div className="space-y-1">
            <p className="font-display text-title text-on-surface">No sales in this range</p>
            <p className="mx-auto max-w-sm text-sm text-on-surface-variant">
              Cancelled orders aren&apos;t counted. Try a longer range to see your trend.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {periodDays < 30 && (
              <Button variant="outline" onClick={() => setRange(presetRange(30))}>
                Last 30 days
              </Button>
            )}
            {periodDays < 90 && (
              <Button variant="outline" onClick={() => setRange(presetRange(90))}>
                Last 90 days
              </Button>
            )}
          </div>
        </div>
      ) : summary ? (
        <div className={cn("flex flex-col gap-4 transition-opacity", loading && "opacity-60")}>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile
              accent
              label="Revenue"
              icon="payments"
              value={formatMoney(summary.revenue)}
              caption={
                summary.revenueChange === undefined
                  ? "Incl. tax and charges"
                  : <Delta change={summary.revenueChange} periodLabel={periodLabel} />
              }
            />
            <StatTile
              label="Orders"
              icon="receipt_long"
              value={summary.orders.toLocaleString("en-IN")}
              caption={
                summary.ordersChange === undefined
                  ? "Excluding cancelled"
                  : <Delta change={summary.ordersChange} periodLabel={periodLabel} />
              }
            />
            <StatTile
              label="Avg. order value"
              icon="shopping_basket"
              value={formatMoney(summary.avgOrder)}
              caption={
                summary.avgOrderChange === undefined
                  ? "Revenue ÷ orders"
                  : <Delta change={summary.avgOrderChange} periodLabel={periodLabel} />
              }
            />
            <StatTile
              label="Best day"
              icon="emoji_events"
              value={summary.best ? formatMoney(summary.best.revenue) : "—"}
              caption={
                summary.best
                  ? `${formatDay(summary.best.date, { weekday: "short", day: "numeric", month: "short" })} · ${summary.best.orders} order${summary.best.orders === 1 ? "" : "s"}`
                  : "—"
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <SectionCard
              title="Revenue by day"
              description="Every day in the range, including days with no sales."
            >
              <DailyRevenueChart days={summary.chartDays} averagePerDay={summary.avgPerDay} />
            </SectionCard>

            <SectionCard
              title="Where the money came from"
              description="What makes up the revenue total."
            >
              <ul className="flex flex-col gap-4">
                {summary.breakdown.map((part) => {
                  const share = percentOf(part.amount, summary.revenue);
                  return (
                    <li key={part.key} className="flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 items-start gap-2">
                          <Icon name={part.icon} size={18} className="mt-0.5 text-on-surface-variant" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-on-surface">{part.label}</span>
                            <span className="block text-body-xs text-on-surface-variant">{part.hint}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-on-surface">
                            {formatMoney(part.amount)}
                          </span>
                          <span className="block text-body-xs tabular-nums text-on-surface-variant">{share}%</span>
                        </span>
                      </div>
                      {/* One hue: bar length is the only encoding, and the
                          amount and share are printed beside it. */}
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-brand/70"
                          style={{ width: `${part.amount > 0 ? Math.max(share, 1) : 0}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex items-center justify-between border-t border-outline-variant pt-3">
                <span className="text-sm font-semibold text-on-surface">Total revenue</span>
                <span className="text-sm font-semibold tabular-nums text-on-surface">{formatMoney(summary.revenue)}</span>
              </div>
            </SectionCard>
          </div>

          {/* Daily breakdown — also the chart's table view. */}
          <SectionCard
            title="Daily breakdown"
            description="Days with at least one order, newest first."
            className="overflow-hidden"
          >
            <div className="-mx-4 -mb-4 overflow-x-auto md:-mx-5 md:-mb-5">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-y border-outline-variant bg-surface-container-low text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    <th scope="col" className="px-4 py-3 md:px-5">Date</th>
                    <th scope="col" className="px-4 py-3 text-right">Orders</th>
                    <th scope="col" className="px-4 py-3 text-right">Item sales</th>
                    <th scope="col" className="px-4 py-3 text-right">Tax</th>
                    <th scope="col" className="px-4 py-3 text-right">Service</th>
                    <th scope="col" className="px-4 py-3 text-right">Packing</th>
                    <th scope="col" className="px-4 py-3 text-right md:px-5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(data?.days ?? [])].reverse().map((d) => {
                    const isBest = summary.best?.date === d.date;
                    return (
                      <tr key={d.date} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-on-surface md:px-5">
                          <span className="flex items-center gap-2">
                            {formatDay(d.date, { weekday: "short", day: "numeric", month: "short" })}
                            {isBest && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-brand-border bg-brand-subtle px-1.5 py-0.5 text-[11px] font-semibold text-brand-text">
                                <Icon name="emoji_events" size={12} />
                                Best
                              </span>
                            )}
                          </span>
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface">{d.orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface">{formatMoney(d.subtotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatMoney(d.tax)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatMoney(d.serviceCharge)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatMoney(d.packingCharge)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-on-surface md:px-5">{formatMoney(d.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-outline-variant bg-surface-container-low font-semibold text-on-surface">
                    <th scope="row" className="px-4 py-3 text-left md:px-5">Total</th>
                    <td className="px-4 py-3 text-right tabular-nums">{summary.orders}</td>
                    {summary.breakdown.map((part) => (
                      <td key={part.key} className="px-4 py-3 text-right tabular-nums">{formatMoney(part.amount)}</td>
                    ))}
                    <td className="px-4 py-3 text-right tabular-nums md:px-5">{formatMoney(summary.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
