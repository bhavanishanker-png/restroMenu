"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function SalesReport() {
  const today = new Date();
  const sevenAgo = new Date(today);
  sevenAgo.setDate(sevenAgo.getDate() - 6);

  const [dateFrom, setDateFrom] = useState(isoDate(sevenAgo));
  const [dateTo, setDateTo] = useState(isoDate(today));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom: new Date(dateFrom + "T00:00:00").toISOString(),
        dateTo: new Date(dateTo + "T23:59:59").toISOString(),
      });
      const res = await fetch(`/api/reports/sales?${params.toString()}`);
      if (!res.ok) {
        toast.error("Failed to load report.");
        return;
      }
      setData((await res.json()) as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCSV() {
    if (!data) return;
    const header = "Date,Orders,Revenue,Subtotal,Tax,Service charge,Packing charge";
    const rows = data.days.map((d) =>
      [
        d.date,
        d.orders,
        d.revenue.toFixed(2),
        d.subtotal.toFixed(2),
        d.tax.toFixed(2),
        d.serviceCharge.toFixed(2),
        d.packingCharge.toFixed(2),
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${dateFrom}-to-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const maxRevenue = Math.max(...(data?.days.map((d) => d.revenue) ?? [0]), 1);
  const avgRevenue =
    data && data.days.length > 0 ? data.totals.revenue / data.days.length : 0;

  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-headline-lg-mobile text-on-surface" style={{ fontSize: 28 }}>
            Sales Reports
          </h1>
          <p className="font-body-md text-on-surface-variant mt-1">
            Review your daily performance and revenue trends.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 h-12 min-w-0">
            <span
              className="material-symbols-outlined text-on-surface-variant shrink-0"
              style={{ fontSize: 20 }}
            >
              calendar_month
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent font-body-sm text-body-sm text-on-surface outline-none w-28 min-w-0"
            />
            <span className="text-on-surface-variant font-body-sm shrink-0">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent font-body-sm text-body-sm text-on-surface outline-none w-28 min-w-0"
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={!data || data.days.length === 0}
            className="flex items-center gap-2 px-4 h-12 bg-primary text-on-primary rounded-lg font-label-bold text-label-bold hover:bg-primary-container active:translate-y-[2px] transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1 h-32 animate-pulse"
              />
            ))}
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1 h-64 animate-pulse" />
          <div className="bg-surface-container-lowest rounded-xl shadow-level-1 h-48 animate-pulse" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          {data && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow">
                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                  <span className="material-symbols-outlined">payments</span>
                  <h3 className="font-label-bold text-label-bold">Total Revenue</h3>
                </div>
                <div
                  className="font-display text-primary"
                  style={{ fontSize: 40, lineHeight: "48px" }}
                >
                  ₹{fmt(data.totals.revenue)}
                </div>
                <div className="flex items-center gap-1 mt-2 text-secondary font-body-sm text-body-sm">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    trending_up
                  </span>
                  <span>Period total</span>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow">
                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                  <span className="material-symbols-outlined">receipt_long</span>
                  <h3 className="font-label-bold text-label-bold">Total Orders</h3>
                </div>
                <div
                  className="font-display text-on-surface"
                  style={{ fontSize: 40, lineHeight: "48px" }}
                >
                  {data.totals.orders}
                </div>
                <div className="flex items-center gap-1 mt-2 text-secondary font-body-sm text-body-sm">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    trending_up
                  </span>
                  <span>Period total</span>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow">
                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                  <span className="material-symbols-outlined">shopping_basket</span>
                  <h3 className="font-label-bold text-label-bold">Avg Daily Revenue</h3>
                </div>
                <div
                  className="font-display text-on-surface"
                  style={{ fontSize: 40, lineHeight: "48px" }}
                >
                  ₹{fmt(avgRevenue)}
                </div>
                <div className="flex items-center gap-1 mt-2 text-on-surface-variant font-body-sm text-body-sm">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    trending_flat
                  </span>
                  <span>Per day</span>
                </div>
              </div>
            </div>
          )}

          {/* Revenue bar chart */}
          {data && data.days.length > 0 && (
            <section className="bg-surface-container-lowest p-6 rounded-xl shadow-level-1">
              <h2 className="font-headline-sm text-on-surface mb-6">Daily Revenue Trend</h2>
              <div className="w-full h-48 flex items-end justify-between gap-1 border-b border-outline-variant">
                {data.days.map((d) => {
                  const pct = Math.max(2, (d.revenue / maxRevenue) * 100);
                  const isPeak = d.revenue === maxRevenue;
                  return (
                    <div
                      key={d.date}
                      title={`${fmtDate(d.date)}: ₹${fmt(d.revenue)}`}
                      className="flex-1 rounded-t-sm transition-opacity hover:opacity-80 cursor-pointer"
                      style={{
                        height: `${pct}%`,
                        backgroundColor: isPeak ? "#a73400" : "rgba(167,52,0,0.4)",
                        minWidth: 4,
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-on-surface-variant overflow-hidden">
                {data.days.map((d, i) => (
                  <span
                    key={d.date}
                    className={`flex-1 text-center font-body-sm ${
                      data.days.length > 14 && i % 2 !== 0 ? "invisible" : ""
                    }`}
                    style={{ fontSize: 11 }}
                  >
                    {fmtDate(d.date).split(" ")[0]}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Daily breakdown table */}
          {data && data.days.length > 0 && (
            <section className="bg-surface-container-lowest rounded-xl shadow-level-1 overflow-hidden">
              <div className="p-6 border-b border-surface-variant">
                <h2 className="font-headline-sm text-on-surface">Daily Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-container-low font-label-bold text-label-bold text-on-surface-variant">
                      <th className="p-4 font-normal">Date</th>
                      <th className="p-4 font-normal">Orders</th>
                      <th className="p-4 font-normal">Gross Revenue</th>
                      <th className="p-4 font-normal">Tax</th>
                      <th className="p-4 font-normal">Service Charge</th>
                      <th className="p-4 font-normal text-right">Net Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {data.days.map((d) => (
                      <tr
                        key={d.date}
                        className="border-b border-surface-variant hover:bg-surface-container-highest transition-colors"
                      >
                        <td className="p-4">{fmtDate(d.date)}</td>
                        <td className="p-4">{d.orders}</td>
                        <td className="p-4">₹{fmt(d.revenue)}</td>
                        <td className="p-4 text-on-surface-variant">₹{fmt(d.tax)}</td>
                        <td className="p-4 text-on-surface-variant">₹{fmt(d.serviceCharge)}</td>
                        <td className="p-4 text-right font-bold text-primary">₹{fmt(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Empty state */}
          {data && data.days.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-outline-variant py-24 text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: 48 }}>
                receipt_long
              </span>
              <p className="font-body-md">No completed orders in this date range.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
