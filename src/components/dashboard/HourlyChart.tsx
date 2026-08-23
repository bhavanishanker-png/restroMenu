"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type HourlyPoint = { hour: number; count: number };

type Props = { data: HourlyPoint[] };

function formatHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

export function HourlyChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const labelled = data.map((d) => ({ ...d, label: formatHour(d.hour) }));

  if (!mounted) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 h-4 w-48 animate-pulse rounded bg-stone-100" />
        <div className="h-[180px] animate-pulse rounded bg-stone-50" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-stone-700">Orders by hour — today</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={labelled} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#fef3c7" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e7e5e4" }}
            formatter={(v: number) => [v, "orders"]}
            labelFormatter={(l: string) => `Hour: ${l}`}
          />
          <Bar dataKey="count" fill="#C2410C" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
