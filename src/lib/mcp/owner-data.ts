/**
 * Read-only data behind the owner MCP tools (T35). SERVER-ONLY.
 *
 * Tenant rule: an OwnerData is created for ONE restaurant, from the access
 * token's restaurant_id (`supabaseOwnerData(principal.restaurantId)`). No
 * function here takes a restaurant id, so no tool input can ever reach
 * another restaurant. Every query below is scoped by it.
 *
 * Money: sums and averages go through pricing.ts. Historic sales use the
 * order_items snapshots (item_name, line_total), never menu_items prices.
 *
 * Privacy: customer names and phone numbers are never selected, because tool
 * results leave QBite and go to a third-party AI app.
 */
import { createServerClient } from "@/lib/supabase/server";
import { getRestaurantTimezone } from "@/lib/queries/restaurant-timezone";
import type { OrderStatus } from "@/types";

/** Rows fetched for top-dish math; beyond this the result says it was truncated. */
export const MAX_SALES_LINES = 10_000;

export type SalesOrderRow = { total: number; status: string };

export type RecentOrderRow = {
  orderNumber: string;
  table: string | null;
  status: string;
  paymentStatus: string;
  total: number;
  placedAt: string;
  items: { name: string; quantity: number }[];
};

export type SoldLineRow = { itemId: string | null; name: string; quantity: number; lineTotal: number };

export type ActiveItemRow = { id: string; name: string; category: string | null; isAvailable: boolean };

export type OwnerData = {
  restaurantName(): Promise<string>;
  timezone(): Promise<string>;
  ordersBetween(fromIso: string, toIso: string): Promise<SalesOrderRow[]>;
  recentOrders(statuses: OrderStatus[] | null, limit: number): Promise<RecentOrderRow[]>;
  soldLinesSince(fromIso: string): Promise<{ lines: SoldLineRow[]; truncated: boolean }>;
  activeItems(): Promise<ActiveItemRow[]>;
};

// ---------------------------------------------------------------- Supabase implementation

type RawRecentOrder = {
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  placed_at: string;
  restaurant_tables: { label: string } | { label: string }[] | null;
  order_items: { item_name: string; quantity: number }[] | null;
};

type RawSoldLine = { item_id: string | null; item_name: string; quantity: number; line_total: number };

type RawItem = {
  id: string;
  name: string;
  is_available: boolean;
  menu_categories: { name: string } | { name: string }[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fail(what: string, error: unknown): never {
  console.error(`[mcp] ${what} failed`, error);
  throw new Error(`${what} failed`);
}

export function supabaseOwnerData(restaurantId: string): OwnerData {
  const supabase = createServerClient();
  return {
    async restaurantName() {
      const { data, error } = await supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
      if (error) fail("restaurant lookup", error);
      return (data as { name: string } | null)?.name ?? "your restaurant";
    },

    timezone: () => getRestaurantTimezone(restaurantId),

    async ordersBetween(fromIso, toIso) {
      const { data, error } = await supabase
        .from("orders")
        .select("total, status")
        .eq("restaurant_id", restaurantId)
        .gte("placed_at", fromIso)
        .lt("placed_at", toIso);
      if (error) fail("orders query", error);
      return (data ?? []) as SalesOrderRow[];
    },

    async recentOrders(statuses, limit) {
      let query = supabase
        .from("orders")
        .select("order_number, status, payment_status, total, placed_at, restaurant_tables(label), order_items(item_name, quantity)")
        .eq("restaurant_id", restaurantId)
        .order("placed_at", { ascending: false })
        .limit(limit);
      if (statuses) query = query.in("status", statuses);
      const { data, error } = await query;
      if (error) fail("recent orders query", error);
      return ((data ?? []) as RawRecentOrder[]).map((o) => ({
        orderNumber: o.order_number,
        table: one(o.restaurant_tables)?.label ?? null,
        status: o.status,
        paymentStatus: o.payment_status,
        total: Number(o.total),
        placedAt: o.placed_at,
        items: (o.order_items ?? []).map((i) => ({ name: i.item_name, quantity: i.quantity })),
      }));
    },

    async soldLinesSince(fromIso) {
      // order_items has no restaurant_id: scope through an inner join on orders.
      const { data, error } = await supabase
        .from("order_items")
        .select("item_id, item_name, quantity, line_total, orders!inner(restaurant_id, status, placed_at)")
        .eq("orders.restaurant_id", restaurantId)
        .neq("orders.status", "cancelled")
        .gte("orders.placed_at", fromIso)
        .limit(MAX_SALES_LINES + 1);
      if (error) fail("sold lines query", error);
      const rows = (data ?? []) as RawSoldLine[];
      return {
        truncated: rows.length > MAX_SALES_LINES,
        lines: rows.slice(0, MAX_SALES_LINES).map((r) => ({
          itemId: r.item_id,
          name: r.item_name,
          quantity: r.quantity,
          lineTotal: Number(r.line_total),
        })),
      };
    },

    async activeItems() {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, is_available, menu_categories(name)")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) fail("menu items query", error);
      return ((data ?? []) as RawItem[]).map((i) => ({
        id: i.id,
        name: i.name,
        category: one(i.menu_categories)?.name ?? null,
        isAvailable: i.is_available,
      }));
    },
  };
}
