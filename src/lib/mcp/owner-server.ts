/**
 * The owner Q&A MCP server (T35): four read-only tools over one restaurant's
 * data. SERVER-ONLY.
 *
 * Built fresh for every HTTP request (stateless Streamable HTTP), for the
 * principal resolved from that request's access token. The tools close over
 * `data`, which is already bound to principal.restaurantId; none of their
 * input schemas has a restaurant field, and the SDK strips unknown arguments,
 * so tool input can't select another restaurant.
 *
 * Read-only by design (owner's choice, ADR 0009): every tool is marked
 * readOnlyHint, and OwnerData has no write methods at all.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatMoney } from "@/lib/pricing";
import { startOfRestaurantDay } from "@/lib/restaurant-time";
import { findDeadItems, rankTopItems, summarizeSales } from "@/lib/mcp/owner-stats";
import type { OwnerData } from "@/lib/mcp/owner-data";
import type { AccessTokenPrincipal, OrderStatus } from "@/types";

const ACTIVE_STATUSES: OrderStatus[] = ["placed", "accepted", "preparing", "ready"];

function result(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Runs one tool: logs counts and timing (never the data), turns failures into a tool error. */
async function run(
  principal: AccessTokenPrincipal,
  tool: string,
  fn: () => Promise<unknown>
): Promise<CallToolResult> {
  const started = Date.now();
  try {
    const value = await fn();
    console.info("[mcp]", { restaurantId: principal.restaurantId, tokenId: principal.tokenId, tool, ok: true, ms: Date.now() - started });
    return result(value);
  } catch (err) {
    console.error("[mcp]", { restaurantId: principal.restaurantId, tokenId: principal.tokenId, tool, ok: false }, err);
    return {
      isError: true,
      content: [{ type: "text", text: "QBite couldn't load that data just now. Try again in a moment." }],
    };
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export function buildOwnerMcpServer(
  principal: AccessTokenPrincipal,
  data: OwnerData,
  now: () => Date = () => new Date()
): McpServer {
  const server = new McpServer(
    { name: "qbite-owner", version: "1.0.0" },
    {
      instructions:
        "Read-only data for one QBite restaurant: sales, orders, best sellers and dishes that don't sell. " +
        "Money is in the restaurant's currency and includes tax. Days follow the restaurant's own timezone. " +
        "These tools cannot change anything; to change the menu or orders, use the QBite dashboard.",
    }
  );

  server.registerTool(
    "get_today_sales",
    {
      title: "Sales for a day",
      description:
        "Orders, revenue and average order value for one business day. daysAgo 0 = today so far, 1 = yesterday, up to 90.",
      inputSchema: { daysAgo: z.number().int().min(0).max(90).optional().describe("0 = today (default), 1 = yesterday") },
      annotations: READ_ONLY,
    },
    async ({ daysAgo = 0 }) =>
      run(principal, "get_today_sales", async () => {
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
      })
  );

  server.registerTool(
    "list_orders",
    {
      title: "Recent orders",
      description:
        "The most recent orders, newest first, with table, status, total and items. " +
        "status: 'active' (not yet served), a specific status, or 'all'. Customer names and phone numbers are not included.",
      inputSchema: {
        status: z
          .enum(["active", "all", "placed", "accepted", "preparing", "ready", "served", "cancelled"])
          .optional()
          .describe("Default 'all'"),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20, max 50"),
      },
      annotations: READ_ONLY,
    },
    async ({ status = "all", limit = 20 }) =>
      run(principal, "list_orders", async () => {
        const statuses: OrderStatus[] | null =
          status === "all" ? null : status === "active" ? ACTIVE_STATUSES : [status];
        const orders = await data.recentOrders(statuses, limit);
        return {
          count: orders.length,
          orders: orders.map((o) => ({ ...o, totalFormatted: formatMoney(o.total) })),
        };
      })
  );

  server.registerTool(
    "get_top_items",
    {
      title: "Best-selling dishes",
      description: "Dishes ranked by quantity sold over the last N days (cancelled orders excluded).",
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().describe("Default 7"),
        limit: z.number().int().min(1).max(20).optional().describe("Default 10"),
      },
      annotations: READ_ONLY,
    },
    async ({ days = 7, limit = 10 }) =>
      run(principal, "get_top_items", async () => {
        const tz = await data.timezone();
        const from = startOfRestaurantDay(tz, now(), days - 1);
        const { lines, truncated } = await data.soldLinesSince(from.toISOString());
        return {
          days,
          truncated,
          items: rankTopItems(lines, limit).map((i) => ({ ...i, revenueFormatted: formatMoney(i.revenue) })),
        };
      })
  );

  server.registerTool(
    "get_dead_items",
    {
      title: "Dishes that didn't sell",
      description: "Dishes on the current menu that sold nothing in the last N days.",
      inputSchema: { days: z.number().int().min(1).max(90).optional().describe("Default 14") },
      annotations: READ_ONLY,
    },
    async ({ days = 14 }) =>
      run(principal, "get_dead_items", async () => {
        const tz = await data.timezone();
        const from = startOfRestaurantDay(tz, now(), days - 1);
        const [items, sold] = await Promise.all([data.activeItems(), data.soldLinesSince(from.toISOString())]);
        const dead = findDeadItems(items, sold.lines);
        return { days, menuSize: items.length, count: dead.length, truncated: sold.truncated, items: dead };
      })
  );

  return server;
}

/**
 * The one place a request's token is turned into a server: the data source is
 * created from principal.restaurantId, nothing else. Exported so the tenant
 * binding is unit-tested, and used by /api/mcp.
 */
export function ownerServerFor(
  principal: AccessTokenPrincipal,
  dataFor: (restaurantId: string) => OwnerData
): McpServer {
  return buildOwnerMcpServer(principal, dataFor(principal.restaurantId));
}
