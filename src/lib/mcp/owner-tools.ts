/**
 * The four read-only owner tools, defined ONCE (T35, T36). SERVER-ONLY.
 *
 * Two ways in, one source of truth:
 *  - the MCP server (owner-server.ts) for owners using Claude Desktop / Code
 *  - the dashboard "Ask AI" chat (ai/owner-assistant.ts) for everyone else
 *
 * A tool's `run` receives an OwnerData that is already bound to one
 * restaurant (from the access token or the staff session). No input schema
 * has a restaurant field, so tool input can never select another restaurant.
 * Nothing here can write; OwnerData has no write methods.
 */
import * as z from "zod/v4";
import { formatMoney } from "@/lib/pricing";
import { startOfRestaurantDay } from "@/lib/restaurant-time";
import { findDeadItems, rankTopItems, summarizeSales } from "@/lib/mcp/owner-stats";
import type { OwnerData } from "@/lib/mcp/owner-data";
import type { OrderStatus } from "@/types";

export type OwnerToolContext = { data: OwnerData; now: () => Date };

export type OwnerTool<S extends z.ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  input: S;
  // Method syntax on purpose: lets a specific tool be passed where any OwnerTool is expected.
  run(ctx: OwnerToolContext, args: z.infer<z.ZodObject<S>>): Promise<unknown>;
};

function defineTool<S extends z.ZodRawShape>(tool: OwnerTool<S>): OwnerTool<S> {
  return tool;
}

const ACTIVE_STATUSES: OrderStatus[] = ["placed", "accepted", "preparing", "ready"];

export const getTodaySales = defineTool({
  name: "get_today_sales",
  title: "Sales for a day",
  description:
    "Orders, revenue and average order value for one business day. daysAgo 0 = today so far, 1 = yesterday, up to 90.",
  input: { daysAgo: z.number().int().min(0).max(90).optional().describe("0 = today (default), 1 = yesterday") },
  run: async ({ data, now }, { daysAgo = 0 }) => {
    const tz = await data.timezone();
    const at = now();
    const from = startOfRestaurantDay(tz, at, daysAgo);
    const to = daysAgo === 0 ? at : startOfRestaurantDay(tz, at, daysAgo - 1);
    const s = summarizeSales(await data.ordersBetween(from.toISOString(), to.toISOString()));
    return {
      restaurant: await data.restaurantName(),
      day: daysAgo === 0 ? "today (so far)" : `${daysAgo} day(s) ago`,
      timezone: tz,
      orders: s.orders,
      revenue: s.revenue,
      revenueFormatted: formatMoney(s.revenue),
      averageOrderValue: s.averageOrderValue,
      averageOrderValueFormatted: formatMoney(s.averageOrderValue),
      cancelledOrders: s.cancelledOrders,
    };
  },
});

export const listOrders = defineTool({
  name: "list_orders",
  title: "Recent orders",
  description:
    "The most recent orders, newest first, with table, status, total and items. " +
    "status: 'active' (not yet served), a specific status, or 'all'. Customer names and phone numbers are not included.",
  input: {
    status: z
      .enum(["active", "all", "placed", "accepted", "preparing", "ready", "served", "cancelled"])
      .optional()
      .describe("Default 'all'"),
    limit: z.number().int().min(1).max(50).optional().describe("Default 20, max 50"),
  },
  run: async ({ data }, { status = "all", limit = 20 }) => {
    const statuses: OrderStatus[] | null = status === "all" ? null : status === "active" ? ACTIVE_STATUSES : [status];
    const orders = await data.recentOrders(statuses, limit);
    return { count: orders.length, orders: orders.map((o) => ({ ...o, totalFormatted: formatMoney(o.total) })) };
  },
});

export const getTopItems = defineTool({
  name: "get_top_items",
  title: "Best-selling dishes",
  description: "Dishes ranked by quantity sold over the last N days (cancelled orders excluded).",
  input: {
    days: z.number().int().min(1).max(90).optional().describe("Default 7"),
    limit: z.number().int().min(1).max(20).optional().describe("Default 10"),
  },
  run: async ({ data, now }, { days = 7, limit = 10 }) => {
    const tz = await data.timezone();
    const from = startOfRestaurantDay(tz, now(), days - 1);
    const { lines, truncated } = await data.soldLinesSince(from.toISOString());
    return {
      days,
      truncated,
      items: rankTopItems(lines, limit).map((i) => ({ ...i, revenueFormatted: formatMoney(i.revenue) })),
    };
  },
});

export const getDeadItems = defineTool({
  name: "get_dead_items",
  title: "Dishes that didn't sell",
  description: "Dishes on the current menu that sold nothing in the last N days.",
  input: { days: z.number().int().min(1).max(90).optional().describe("Default 14") },
  run: async ({ data, now }, { days = 14 }) => {
    const tz = await data.timezone();
    const from = startOfRestaurantDay(tz, now(), days - 1);
    const [items, sold] = await Promise.all([data.activeItems(), data.soldLinesSince(from.toISOString())]);
    const dead = findDeadItems(items, sold.lines);
    return { days, menuSize: items.length, count: dead.length, truncated: sold.truncated, items: dead };
  },
});

/** Every owner tool's name, for tests and logs. */
export const OWNER_TOOL_NAMES = [getTodaySales.name, listOrders.name, getTopItems.name, getDeadItems.name] as const;

/** Shown when a tool's data can't be loaded. Internal error text never reaches a model or app. */
export const OWNER_TOOL_ERROR = "QBite couldn't load that data just now. Try again in a moment.";
