type HourlyPoint = { hour: number; count: number };

type Props = { data: HourlyPoint[] };

function formatHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Pure CSS bar chart — no recharts dependency, no hydration mismatch.
// Shows hours 10am–10pm (the restaurant window). Bars scale to the max count.
export function HourlyChart({ data }: Props) {
  const window = data.filter((d) => d.hour >= 10 && d.hour <= 22);
  const maxCount = Math.max(...window.map((d) => d.count), 1);
  const peakHour = window.reduce((a, b) => (b.count > a.count ? b : a), window[0]);

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-level-1">
      <div className="flex items-center justify-between mb-md">
        <h3 className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Order Distribution</h3>
        <span className="font-label-bold text-label-bold text-on-surface-variant">Today</span>
      </div>

      <div className="relative h-[200px] flex items-end gap-1 md:gap-2 pb-6 border-b border-outline-variant/30">
        {/* Dashed guide lines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-full border-t border-dashed border-outline-variant/40" />
          ))}
        </div>

        {window.map((d) => {
          const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const isPeak = peakHour && d.hour === peakHour.hour && d.count > 0;
          return (
            <div
              key={d.hour}
              className="relative z-10 flex flex-1 flex-col items-center justify-end h-full"
              title={`${d.count} orders`}
            >
              <div
                className={`w-full max-w-[28px] rounded-t-md transition-all ${
                  isPeak
                    ? "bg-primary"
                    : d.count > 0
                    ? "bg-secondary-container"
                    : "bg-surface-container-highest"
                }`}
                style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 2)}%` }}
              />
              <span
                className={`absolute -bottom-5 font-label-bold text-[9px] ${
                  isPeak ? "text-primary font-bold" : "text-on-surface-variant"
                }`}
              >
                {formatHour(d.hour)}
              </span>
            </div>
          );
        })}
      </div>

      {window.every((d) => d.count === 0) && (
        <p className="mt-3 text-center font-body-sm text-on-surface-variant">No orders yet today</p>
      )}
    </div>
  );
}
