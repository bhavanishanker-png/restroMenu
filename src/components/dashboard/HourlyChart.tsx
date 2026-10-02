import { cn } from "@/lib/utils";

type HourlyPoint = { hour: number; count: number };

type Props = { data: HourlyPoint[] };

/** The default window — a typical lunch-to-dinner service. */
const DEFAULT_FIRST_HOUR = 10;
const DEFAULT_LAST_HOUR = 22;

function formatHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function formatHourRange(h: number): string {
  const fmt = (x: number) => {
    const h12 = x % 12 || 12;
    return `${h12}${x < 12 || x === 24 ? "am" : "pm"}`;
  };
  return `${fmt(h)}–${fmt(h + 1)}`;
}

/**
 * Round the y-axis top up so the four gridlines land on whole order counts.
 * Counts, not money — no pricing involved.
 */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  return Math.ceil(max / 4) * 4;
}

/**
 * Orders per hour today, as a single-series column chart.
 *
 * Pure CSS/HTML and a Server Component: no chart library, no hydration. Hover
 * readouts are CSS-only, and an sr-only table carries every value for screen
 * readers, so the tooltip enhances rather than gates.
 *
 * Shows 10am–10pm by default but widens to include any hour that actually has
 * orders — previously a breakfast or late-night order was silently dropped
 * from the chart.
 */
export function HourlyChart({ data }: Props) {
  const active = data.filter((d) => d.count > 0);
  const first = Math.min(DEFAULT_FIRST_HOUR, ...active.map((d) => d.hour));
  const last = Math.max(DEFAULT_LAST_HOUR, ...active.map((d) => d.hour));
  const window = data.filter((d) => d.hour >= first && d.hour <= last);

  const total = active.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(0, ...window.map((d) => d.count));
  const top = niceMax(maxCount);
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0];
  const peak = maxCount > 0 ? window.find((d) => d.count === maxCount) : undefined;
  const isEmpty = total === 0;

  return (
    <section
      aria-labelledby="hourly-chart-heading"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1 md:p-5"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="hourly-chart-heading" className="font-display text-[16px] font-semibold text-on-surface">
            Orders by hour
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Today, excluding cancelled orders
          </p>
        </div>
        {peak && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-body-sm font-medium text-on-surface">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 16 }} aria-hidden="true">
              trending_up
            </span>
            Peak {formatHourRange(peak.hour)}
          </span>
        )}
      </div>

      <div className="flex gap-2" aria-hidden="true">
        {/* Y axis */}
        <div className="relative h-[180px] w-6 shrink-0 md:h-[200px]">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums leading-none text-on-surface-variant"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Plot */}
          <div className="relative h-[180px] md:h-[200px]">
            {/* Recessive gridlines; the baseline is solid. */}
            {ticks.map((t, i) => (
              <div
                key={t}
                className={cn(
                  "absolute inset-x-0 border-t",
                  // Solid hairlines: dashed reads as a threshold, not a grid.
                  t === 0 ? "border-outline-variant" : "border-outline-variant/40"
                )}
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-0.5 sm:gap-1">
              {window.map((d, i) => {
                const pct = (d.count / top) * 100;
                const isPeak = peak?.hour === d.hour;
                // Edge columns anchor their tooltip inward so it never pokes
                // past the card (and never widens the page on a phone).
                const align =
                  i < 2 ? "left-0" : i > window.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={d.hour}
                    className="group/bar relative flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    {/* Hover band — a hit target much larger than the mark. */}
                    <div className="absolute inset-0 rounded-md bg-on-surface/0 transition-colors duration-fast group-hover/bar:bg-on-surface/[0.04]" />

                    {d.count > 0 && (
                      <div
                        className={cn(
                          "relative w-full max-w-[24px] rounded-t-[4px] transition-opacity duration-fast",
                          isPeak ? "bg-brand" : "bg-brand/55 group-hover/bar:bg-brand/75"
                        )}
                        style={{ height: `${pct}%` }}
                      >
                        {/* Direct label on the peak only. */}
                        {isPeak && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-on-surface group-hover/bar:opacity-0">
                            {d.count}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tooltip */}
                    <div
                      className={cn(
                        "pointer-events-none absolute z-20 mb-2 whitespace-nowrap",
                        align,
                        " rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 opacity-0 shadow-level-2 transition-opacity duration-fast group-hover/bar:opacity-100"
                      )}
                      style={{ bottom: `${pct}%` }}
                    >
                      <p className="text-[13px] font-semibold tabular-nums text-on-surface">
                        {d.count} {d.count === 1 ? "order" : "orders"}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">{formatHourRange(d.hour)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {isEmpty && (
              <div className="absolute inset-0 grid place-items-center">
                <p className="rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm text-on-surface-variant shadow-level-1">
                  No orders yet today
                </p>
              </div>
            )}
          </div>

          {/* X axis — every other label on phones so they never collide. */}
          <div className="mt-2 flex gap-0.5 sm:gap-1">
            {window.map((d, i) => (
              <span
                key={d.hour}
                className={cn(
                  "min-w-0 flex-1 text-center text-[11px] tabular-nums text-on-surface-variant",
                  i % 2 === 1 && "invisible sm:visible"
                )}
              >
                {formatHour(d.hour)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Table view — every value reachable without hover. */}
      <table className="sr-only">
        <caption>Orders per hour today</caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {window.map((d) => (
            <tr key={d.hour}>
              <th scope="row">{formatHourRange(d.hour)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
