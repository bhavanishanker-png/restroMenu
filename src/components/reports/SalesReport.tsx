"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
    day: "2-digit", month: "short",
  });
}

export function SalesReport() {
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 29);

  const [dateFrom, setDateFrom] = useState(isoDate(thirtyAgo));
  const [dateTo, setDateTo] = useState(isoDate(today));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom: new Date(dateFrom + "T00:00:00").toISOString(),
        dateTo: new Date(dateTo + "T23:59:59").toISOString(),
      });
      const res = await fetch(`/api/reports/sales?${params.toString()}`);
      if (!res.ok) { toast.error("Failed to load report."); return; }
      setData(await res.json() as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  function exportCSV() {
    if (!data) return;
    const header = "Date,Orders,Revenue,Subtotal,Tax,Service charge,Packing charge";
    const rows = data.days.map((d) =>
      [d.date, d.orders, d.revenue.toFixed(2), d.subtotal.toFixed(2),
       d.tax.toFixed(2), d.serviceCharge.toFixed(2), d.packingCharge.toFixed(2)]
        .map((v) => `"${v}"`).join(",")
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

  const chartData = data?.days.map((d) => ({ ...d, label: fmtDate(d.date) })) ?? [];

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        <span className="text-stone-400 text-sm">to</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data || data.days.length === 0}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-stone-400 uppercase tracking-wide">Total orders</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">{data.totals.orders}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-stone-400 uppercase tracking-wide">Total revenue</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">₹{fmt(data.totals.revenue)}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-xs text-stone-400 uppercase tracking-wide">Avg daily revenue</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  ₹{fmt(data.days.length > 0 ? data.totals.revenue / data.days.length : 0)}
                </p>
              </div>
            </div>
          )}

          {/* Revenue chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-stone-700">Daily revenue</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C2410C" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#C2410C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a8a29e" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#a8a29e" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e7e5e4" }}
                    formatter={(v: number) => [`₹${fmt(v)}`, "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#C2410C" strokeWidth={2} fill="url(#rev-grad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily breakdown table */}
          {data && data.days.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">Tax</th>
                    <th className="px-4 py-2.5 text-right hidden md:table-cell">Svc charge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.date} className="border-b border-stone-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-stone-700">{fmtDate(d.date)}</td>
                      <td className="px-4 py-2.5 text-right text-stone-500">{d.orders}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-stone-800">₹{fmt(d.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-stone-400 hidden sm:table-cell">₹{fmt(d.tax)}</td>
                      <td className="px-4 py-2.5 text-right text-stone-400 hidden md:table-cell">₹{fmt(d.serviceCharge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.days.length === 0 && (
            <p className="rounded-xl border border-dashed border-stone-200 py-16 text-center text-sm text-stone-400">
              No completed orders in this date range.
            </p>
          )}
        </>
      )}
    </div>
  );
}
