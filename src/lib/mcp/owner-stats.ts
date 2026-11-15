/**
 * Pure aggregation for the owner MCP tools (T35): no I/O, so it is unit-tested
 * directly. Money goes through pricing.ts.
 */
import { averageMoney, sumMoney } from "@/lib/pricing";
import type { ActiveItemRow, SalesOrderRow, SoldLineRow } from "@/lib/mcp/owner-data";

export function summarizeSales(rows: SalesOrderRow[]) {
  const counted = rows.filter((r) => r.status !== "cancelled");
  const revenue = sumMoney(counted.map((r) => Number(r.total)));
  return {
    orders: counted.length,
    revenue,
    averageOrderValue: averageMoney(revenue, counted.length),
    cancelledOrders: rows.length - counted.length,
  };
}

/** Best sellers by quantity. Grouped by menu item when known, else by the snapshot name. */
export function rankTopItems(lines: SoldLineRow[], limit: number) {
  const groups = new Map<string, { name: string; quantity: number; totals: number[] }>();
  for (const line of lines) {
    const key = line.itemId ?? `name:${line.name.toLowerCase()}`;
    const g = groups.get(key) ?? { name: line.name, quantity: 0, totals: [] };
    g.quantity += line.quantity;
    g.totals.push(Number(line.lineTotal));
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g) => ({ name: g.name, quantity: g.quantity, revenue: sumMoney(g.totals) }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, limit);
}

/** Dishes on the menu today that sold nothing in the period. */
export function findDeadItems(items: ActiveItemRow[], lines: SoldLineRow[]) {
  const sold = new Set(lines.map((l) => l.itemId).filter((id): id is string => Boolean(id)));
  return items
    .filter((i) => !sold.has(i.id))
    .map((i) => ({ name: i.name, category: i.category, isAvailable: i.isAvailable }));
}

