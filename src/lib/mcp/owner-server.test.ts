import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildOwnerMcpServer, ownerServerFor } from "./owner-server";
import { findDeadItems, rankTopItems, summarizeSales } from "./owner-stats";
import type { OwnerData } from "./owner-data";
import type { AccessTokenPrincipal } from "@/types";

const PRINCIPAL: AccessTokenPrincipal = {
  tokenId: "tok-1",
  staffId: "staff-1",
  restaurantId: "rest-a",
  role: "owner",
  scopes: ["read"],
};

/** A fake data source that records every call, bound to one restaurant like the real one. */
function fakeData(overrides: Partial<OwnerData> = {}) {
  const calls: string[] = [];
  const data: OwnerData = {
    restaurantName: async () => "Test Kitchen",
    timezone: async () => "Asia/Kolkata",
    ordersBetween: async (from, to) => {
      calls.push(`ordersBetween ${from} ${to}`);
      return [
        { total: 250.5, status: "served" },
        { total: 100, status: "placed" },
        { total: 999, status: "cancelled" },
      ];
    },
    recentOrders: async (statuses, limit) => {
      calls.push(`recentOrders ${statuses?.join(",") ?? "all"} ${limit}`);
      return [{ orderNumber: "ORD-0001", table: "T1", status: "preparing", paymentStatus: "pending", total: 320, placedAt: "2026-11-14T08:00:00Z", items: [{ name: "Dal", quantity: 2 }] }];
    },
    soldLinesSince: async (from) => {
      calls.push(`soldLinesSince ${from}`);
      return {
        truncated: false,
        lines: [
          { itemId: "i1", name: "Paneer Tikka", quantity: 2, lineTotal: 440 },
          { itemId: "i2", name: "Dal", quantity: 5, lineTotal: 800 },
          { itemId: "i1", name: "Paneer Tikka", quantity: 4, lineTotal: 880 },
        ],
      };
    },
    activeItems: async () => [
      { id: "i1", name: "Paneer Tikka", category: "Starters", isAvailable: true },
      { id: "i2", name: "Dal", category: "Mains", isAvailable: true },
      { id: "i3", name: "Mystery Soup", category: "Soups", isAvailable: false },
    ],
    ...overrides,
  };
  return { data, calls };
}

async function connect(data: OwnerData, now = () => new Date("2026-11-14T12:00:00Z")) {
  const server = buildOwnerMcpServer(PRINCIPAL, data, now);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as { type: string; text: string }[];
  return { isError: Boolean(res.isError), json: res.isError ? null : JSON.parse(content[0].text), text: content[0].text };
}

describe("tenant binding", () => {
  it("builds the data source from the token's restaurant, nothing else", () => {
    const dataFor = vi.fn<(restaurantId: string) => OwnerData>(() => fakeData().data);
    ownerServerFor(PRINCIPAL, dataFor);
    expect(dataFor).toHaveBeenCalledWith("rest-a");
  });

  it("exposes four read-only tools, none of which accepts a restaurant", async () => {
    const client = await connect(fakeData().data);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_dead_items", "get_today_sales", "get_top_items", "list_orders"]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      const props = Object.keys((tool.inputSchema as { properties?: object }).properties ?? {});
      expect(props.some((p) => /restaurant/i.test(p)), tool.name).toBe(false);
    }
  });

  it("ignores a restaurantId smuggled into tool arguments", async () => {
    const { data, calls } = fakeData();
    const client = await connect(data);
    const r = await call(client, "list_orders", { restaurantId: "rest-b", status: "active", limit: 5 });
    expect(r.isError).toBe(false);
    expect(calls).toEqual(["recentOrders placed,accepted,preparing,ready 5"]);
  });
});

describe("tools", () => {
  it("get_today_sales: excludes cancelled orders and uses the restaurant's day", async () => {
    const { data, calls } = fakeData();
    const client = await connect(data);
    const today = await call(client, "get_today_sales");
    expect(today.json).toMatchObject({ orders: 2, revenue: 350.5, averageOrderValue: 175.25, cancelledOrders: 1 });
    // Today in IST starts at 18:30 UTC the day before, and runs until "now".
    expect(calls[0]).toBe("ordersBetween 2026-11-13T18:30:00.000Z 2026-11-14T12:00:00.000Z");

    await call(client, "get_today_sales", { daysAgo: 1 });
    expect(calls[1]).toBe("ordersBetween 2026-11-12T18:30:00.000Z 2026-11-13T18:30:00.000Z");
  });

  it("get_top_items: ranks by quantity and sums revenue per dish", async () => {
    const client = await connect(fakeData().data);
    const r = await call(client, "get_top_items", { days: 7 });
    expect(r.json.items.map((i: { name: string; quantity: number; revenue: number }) => [i.name, i.quantity, i.revenue])).toEqual([
      ["Paneer Tikka", 6, 1320],
      ["Dal", 5, 800],
    ]);
  });

  it("get_dead_items: dishes on the menu with no sales in the period", async () => {
    const client = await connect(fakeData().data);
    const r = await call(client, "get_dead_items", { days: 14 });
    expect(r.json).toMatchObject({ menuSize: 3, count: 1, items: [{ name: "Mystery Soup", category: "Soups" }] });
  });

  it("rejects out-of-range arguments", async () => {
    const client = await connect(fakeData().data);
    const r = await call(client, "list_orders", { limit: 500 });
    expect(r.isError).toBe(true);
  });

  it("turns a data failure into a friendly tool error, not a crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await connect(fakeData({ recentOrders: async () => { throw new Error("db down"); } }).data);
    const r = await call(client, "list_orders");
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/couldn't load/i);
    expect(r.text).not.toMatch(/db down/); // internals never leak to the AI app
  });
});

describe("aggregation helpers", () => {
  it("summarizeSales handles an empty day", () => {
    expect(summarizeSales([])).toEqual({ orders: 0, revenue: 0, averageOrderValue: 0, cancelledOrders: 0 });
  });

  it("rankTopItems groups lines without an item id by name", () => {
    const top = rankTopItems(
      [
        { itemId: null, name: "Old Dish", quantity: 1, lineTotal: 100 },
        { itemId: null, name: "old dish", quantity: 2, lineTotal: 200 },
      ],
      5
    );
    expect(top).toEqual([{ name: "Old Dish", quantity: 3, revenue: 300 }]);
  });

  it("findDeadItems returns everything when nothing sold", () => {
    expect(findDeadItems([{ id: "a", name: "A", category: null, isAvailable: true }], [])).toHaveLength(1);
  });
});
