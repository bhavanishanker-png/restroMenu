"use client";

import { formatMoney, percentOf } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type DailyPoint = {
  /** YYYY-MM-DD */
  date: string;
  revenue: number;
  orders: number;
};

type Props = {
  days: DailyPoint[];
  /** Average revenue per calendar day in the range, drawn as a reference line. */
  averagePerDay: number;
};

const compactMoney = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Axis top: the next round number above the peak whose quarters are round
 * too (4,000 → 1,000 / 2,000 / 3,000), so every gridline label is readable.
 * 5 × 10ⁿ is left out on purpose: its quarters are 1.25, 2.5, 3.75.
 * Chart scale only — no amount shown to anyone is derived from it.
 */
function niceTop(max: number): number {
  if (max <= 0) return 1000;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 4, 6, 8, 10]) {
    if (m * exp >= max) return m * exp;
  }
  return 10 * exp;
}

function formatDay(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", opts);
}

/**
 * Revenue per day as a single-series column chart.
 *
 * Every calendar day in the range gets a column, including days with no
 * sales — skipping them (as before) made a quiet week look like steady trade.
 *
 * Single hue, so no legend; the peak day is the only direct label, an average
 * line gives the baseline, and each column has a hover/focus tooltip. The
 * daily table below the chart is the table view, so no value is hover-only.
 */
export function DailyRevenueChart({ days, averagePerDay }: Props) {
  const max = Math.max(0, ...days.map((d) => d.revenue));
  const top = niceTop(max);
  const ticks = [top, top * 0.75, top * 0.5, top * 0.25, 0];
  const peak = max > 0 ? days.find((d) => d.revenue === max) : undefined;
  const avgPct = percentOf(averagePerDay, top);

  // About 4 labels on phones ("26 Sept" is ~45px; a 250px plot fits four
  // without touching), 14 from md up, always including the first day.
  const n = days.length;
  const stepSm = Math.max(1, Math.ceil(n / 4));
  const stepMd = Math.max(1, Math.ceil(n / 14));

  return (
    <div className="flex flex-col gap-3">
      {/* Key for the one non-data line, so it can't be read as a gridline —
          kept off the plot, where it collided with columns. */}
      {averagePerDay > 0 && (
        <p className="flex items-center justify-end gap-2 text-body-xs text-on-surface-variant">
          <span
            className="h-0 w-5 border-t-2 border-on-surface/50"
            aria-hidden="true"
          />
          Average {formatMoney(averagePerDay)} a day
        </p>
      )}
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative h-[260px] w-12 shrink-0" aria-hidden="true">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums leading-none text-on-surface-variant"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {compactMoney.format(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative h-[260px]">
            {/* Recessive solid hairlines; the baseline is one step stronger. */}
            {ticks.map((t, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 border-t",
                  t === 0
                    ? "border-outline-variant"
                    : "border-outline-variant/40",
                )}
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}

            {/* Average reference line — identified by the key above. */}
            {averagePerDay > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-on-surface/50"
                style={{ bottom: `${avgPct}%` }}
              />
            )}

            <div className="absolute inset-0 flex items-end gap-0.5">
              {days.map((d, i) => {
                const pct = percentOf(d.revenue, top);
                const isPeak = peak?.date === d.date;
                // Edge columns anchor their tooltip inward so it never pokes
                // past the card or widens the page on a phone.
                const align =
                  i < 3
                    ? "left-0"
                    : i > n - 4
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2";
                const label = `${formatDay(d.date, { weekday: "short", day: "numeric", month: "short" })}: ${
                  d.orders === 0
                    ? "no sales"
                    : `${formatMoney(d.revenue)} from ${d.orders} order${d.orders === 1 ? "" : "s"}`
                }`;
                return (
                  <div
                    key={d.date}
                    tabIndex={0}
                    aria-label={label}
                    className="group/bar relative flex h-full min-w-0 flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {/* Hover band — a hit target much larger than the mark. */}
                    <div className="absolute inset-0 rounded-md transition-colors duration-fast group-hover/bar:bg-on-surface/[0.04] group-focus-visible/bar:bg-on-surface/[0.04]" />

                    {d.revenue > 0 && (
                      <div
                        className={cn(
                          "relative w-full max-w-[24px] rounded-t-[4px] transition-colors duration-fast",
                          isPeak
                            ? "bg-brand"
                            : "bg-brand/50 group-hover/bar:bg-brand/75",
                        )}
                        style={{ height: `${Math.max(pct, 1)}%` }}
                      >
                        {isPeak && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-on-surface group-hover/bar:opacity-0">
                            {compactMoney.format(d.revenue)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tooltip — same content on hover and keyboard focus. */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute z-20 mb-2 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 opacity-0 shadow-level-2 transition-opacity duration-fast group-hover/bar:opacity-100 group-focus-visible/bar:opacity-100",
                        align,
                      )}
                      style={{ bottom: `${Math.max(pct, 1)}%` }}
                    >
                      <p className="text-[11px] text-on-surface-variant">
                        {formatDay(d.date, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <p className="text-[13px] font-semibold tabular-nums text-on-surface">
                        {d.orders === 0 ? "No sales" : formatMoney(d.revenue)}
                      </p>
                      {d.orders > 0 && (
                        <p className="text-[11px] tabular-nums text-on-surface-variant">
                          {d.orders} order{d.orders === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis */}
          <div className="mt-2 flex gap-0.5" aria-hidden="true">
            {days.map((d, i) => (
              <span
                key={d.date}
                className={cn(
                  "min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] tabular-nums text-on-surface-variant",
                  i % stepMd !== 0 && "invisible",
                  i % stepMd === 0 && i % stepSm !== 0 && "max-md:invisible",
                )}
              >
                {formatDay(d.date, {
                  day: "numeric",
                  month: n > 31 ? "short" : undefined,
                })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
