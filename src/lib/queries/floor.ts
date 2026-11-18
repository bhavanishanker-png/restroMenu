import { createServerClient } from "@/lib/supabase/server";
import type { ServiceRequest, ServiceRequestType } from "@/types";
import { startOfRestaurantDay } from "@/lib/restaurant-time";
import { getRestaurantTimezone } from "@/lib/queries/restaurant-timezone";

/**
 * The floor board: every active table, its current in-flight order (if any),
 * and its open service requests. Read with the service role and scoped to one
 * tenant, for the same reason as the kitchen board (staff use a cookie session,
 * so the anon client reads zero rows under RLS — see ADR 0007).
 *
 * "Active order" means an order that still needs floor attention: placed →
 * ready. Served and cancelled orders drop off the tile; an open "bill" request
 * is what keeps a finished table visible.
 */

const ACTIVE_STATUSES = ["placed", "accepted", "preparing", "ready"] as const;

export type FloorOrder = {
  id: string;
  orderNumber: string;
  status: (typeof ACTIVE_STATUSES)[number];
  placedAt: string;
  tableId: string | null;
};

export type FloorTable = {
  id: string;
  label: string;
  seats: number;
};

export type FloorBoard = {
  tables: FloorTable[];
  orders: FloorOrder[];
  serviceRequests: ServiceRequest[];
};

type RawTableRow = { id: string; label: string; seats: number | null };
type RawOrderRow = { id: string; order_number: string; status: string; placed_at: string; table_id: string | null };
type RawRequestRow = {
  id: string;
  restaurant_id: string;
  table_id: string;
  type: string;
  status: string;
  created_at: string;
  restaurant_tables: { label: string } | { label: string }[] | null;
};

function tableLabelOf(rel: { label: string } | { label: string }[] | null): string | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.label ?? null : rel.label;
}

export async function fetchFloorBoard(restaurantId: string): Promise<FloorBoard> {
  const supabase = createServerClient();

  const timezone = await getRestaurantTimezone(restaurantId);
  const today = startOfRestaurantDay(timezone);

  const [tablesResult, ordersResult, requestsResult] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("id, label, seats")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("label", { ascending: true }),

    supabase
      .from("orders")
      .select("id, order_number, status, placed_at, table_id")
      .eq("restaurant_id", restaurantId)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .gte("placed_at", today.toISOString())
      .order("placed_at", { ascending: false }),

    supabase
      .from("service_requests")
      .select("id, restaurant_id, table_id, type, status, created_at, restaurant_tables(label)")
      .eq("restaurant_id", restaurantId)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ]);

  if (tablesResult.error) console.error("[floor] tables fetch failed:", tablesResult.error);
  if (ordersResult.error) console.error("[floor] orders fetch failed:", ordersResult.error);
  if (requestsResult.error) console.error("[floor] requests fetch failed:", requestsResult.error);

  const tables: FloorTable[] = ((tablesResult.data ?? []) as RawTableRow[]).map((t) => ({
    id: t.id,
    label: t.label,
    seats: t.seats ?? 0,
  }));

  const orders: FloorOrder[] = ((ordersResult.data ?? []) as RawOrderRow[]).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    status: o.status as FloorOrder["status"],
    placedAt: o.placed_at,
    tableId: o.table_id,
  }));

  const serviceRequests: ServiceRequest[] = ((requestsResult.data ?? []) as RawRequestRow[]).map((r) => ({
    id: r.id,
    restaurantId: r.restaurant_id,
    tableId: r.table_id,
    tableLabel: tableLabelOf(r.restaurant_tables),
    type: r.type as ServiceRequestType,
    status: r.status as ServiceRequest["status"],
    createdAt: r.created_at,
  }));

  return { tables, orders, serviceRequests };
}
