import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildOwnerAssistantTools, buildSources, type OwnerToolCall } from "./owner-assistant";
import { sanitizeChatHistory } from "./guardrails";
import { buildOwnerMcpServer } from "@/lib/mcp/owner-server";
import { OWNER_TOOL_ERROR, OWNER_TOOL_NAMES } from "@/lib/mcp/owner-tools";
import type { OwnerData } from "@/lib/mcp/owner-data";
import type { AccessTokenPrincipal } from "@/types";

function fakeData(overrides: Partial<OwnerData> = {}): OwnerData {
  return {
    restaurantName: async () => "Test Kitchen",
    timezone: async () => "Asia/Kolkata",
    ordersBetween: async () => [{ total: 200, status: "served" }, { total: 50, status: "cancelled" }],
    recentOrders: async () => [],
    soldLinesSince: async () => ({ truncated: false, lines: [] }),
    activeItems: async () => [{ id: "i1", name: "Dal", category: "Mains", isAvailable: true }],
    ...overrides,
  };
}

const ctx = (data: OwnerData) => ({ data, now: () => new Date("2026-11-15T10:00:00Z") });

describe("assistant tools", () => {
  it("are the same four read-only tools the MCP server exposes", async () => {
    const assistant = buildOwnerAssistantTools(ctx(fakeData()), []);
    const principal: AccessTokenPrincipal = { tokenId: "t", staffId: "s", restaurantId: "r", role: "owner", scopes: ["read"] };
    const server = buildOwnerMcpServer(principal, fakeData());
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(a);
    const { tools: mcp } = await client.listTools();

    expect(assistant.map((t) => t.name).sort()).toEqual([...OWNER_TOOL_NAMES].sort());
    expect(mcp.map((t) => t.name).sort()).toEqual([...OWNER_TOOL_NAMES].sort());
    for (const tool of assistant) {
      const twin = mcp.find((m) => m.name === tool.name);
      const description = "description" in tool ? tool.description : undefined;
      expect(description, tool.name).toBe(twin?.description); // one definition, two ways in
    }
  });

  it("run against the data they were bound to, fenced as data, and record each call", async () => {
    const calls: OwnerToolCall[] = [];
    const tools = buildOwnerAssistantTools(ctx(fakeData()), calls);
    const sales = tools.find((t) => t.name === "get_today_sales");
    if (!sales) throw new Error("missing tool");

    const out = await sales.run(sales.parse({}));
    expect(typeof out).toBe("string");
    const text = out as string;
    expect(text.startsWith("<restaurant_data>")).toBe(true);
    const payload = JSON.parse(text.replace(/^<restaurant_data>\n/, "").replace(/\n<\/restaurant_data>$/, ""));
    expect(payload).toMatchObject({ restaurant: "Test Kitchen", orders: 1, revenue: 200, cancelledOrders: 1 });
    expect(calls.map((c) => c.name)).toEqual(["get_today_sales"]);
    expect(calls[0].value).toMatchObject({ orders: 1, revenue: 200 }); // kept for the grounding check
  });

  it("strip a restaurant id smuggled into the arguments", () => {
    const tools = buildOwnerAssistantTools(ctx(fakeData()), []);
    const orders = tools.find((t) => t.name === "list_orders");
    expect(orders?.parse({ restaurantId: "rest-b", limit: 5 })).toEqual({ limit: 5 });
  });

  it("reject out-of-range arguments before any data is read", () => {
    const tools = buildOwnerAssistantTools(ctx(fakeData()), []);
    const top = tools.find((t) => t.name === "get_top_items");
    expect(() => top?.parse({ days: 500 })).toThrow();
  });

  it("hide internal errors from the model", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tools = buildOwnerAssistantTools(
      ctx(fakeData({ activeItems: async () => { throw new Error("relation menu_items: connection reset"); } })),
      []
    );
    const dead = tools.find((t) => t.name === "get_dead_items");
    if (!dead) throw new Error("missing tool");
    expect(await dead.run(dead.parse({}))).toBe(OWNER_TOOL_ERROR);
  });
});

describe("sanitizeChatHistory (shared by the diner and owner chats)", () => {
  it("keeps the last turns, strips control characters and starts and ends on a user turn", () => {
    const history = sanitizeChatHistory([
      { role: "assistant", content: "Hi! Ask me anything." },
      { role: "user", content: "How were sales\u0007 today?" },
    ]);
    expect(history).toEqual([{ role: "user", content: "How were sales today?" }]);
  });

  it("returns null when there is no question to answer", () => {
    expect(sanitizeChatHistory([{ role: "assistant", content: "Hello" }])).toBeNull();
    expect(sanitizeChatHistory([{ role: "user", content: "\u0000\u0001" }])).toBeNull();
  });

  it("caps very long messages", () => {
    const history = sanitizeChatHistory([{ role: "user", content: "x".repeat(5000) }]);
    expect(history?.[0].content.length).toBeLessThanOrEqual(500);
  });
});

describe("buildSources (the 'based on' line, built in code)", () => {
  it("labels each call with a checkable fact and the page to check it on", () => {
    const sources = buildSources([
      { name: "get_today_sales", args: {}, value: { orders: 4 } },
      { name: "get_today_sales", args: { daysAgo: 1 }, value: { orders: 1 } },
      { name: "list_orders", args: { status: "active" }, value: { count: 3 } },
      { name: "get_top_items", args: { days: 30 }, value: { days: 30 } },
      { name: "get_dead_items", args: {}, value: { days: 14, count: 35 } },
    ]);
    expect(sources).toEqual([
      { label: "Today's sales", detail: "4 orders", href: "/dashboard/reports" },
      { label: "Yesterday's sales", detail: "1 order", href: "/dashboard/reports" },
      { label: "Recent orders", detail: "3 shown", href: "/dashboard/orders" },
      { label: "Best sellers · last 30 days", detail: null, href: "/dashboard/reports" },
      { label: "Unsold dishes · last 14 days", detail: "35 found", href: "/dashboard/menu" },
    ]);
  });

  it("lists a repeated call once, and nothing when no tool ran", () => {
    const call = { name: "list_orders", args: {}, value: { count: 2 } };
    expect(buildSources([call, call])).toHaveLength(1);
    expect(buildSources([])).toEqual([]);
  });
});
