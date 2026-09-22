import { createServerClient } from "@/lib/supabase/server";
import type { ServiceRequest, ServiceRequestType } from "@/types";
import type { KitchenItem, KitchenOrder } from "@/components/kitchen/types";

/**
 * The kitchen board, read with the service role and scoped to one tenant.
 *
 * This lives server-side on purpose. The browser holds the anon key, and the
 * `orders` RLS policy only grants access to `is_staff_of(restaurant_id)` —
 * which checks `auth.uid()`. Staff authenticate with a signed cookie, not
 * Supabase Auth, so an anon client reads zero rows from `orders`. Every
 * kitchen read has to come back through here.
 */

const ORDER_SELECT =
  "id, order_number, status, placed_at, restaurant_tables(label), " +
  "order_items(id, item_name, variant_name, quantity, addons, notes)";

const REQUEST_SELECT =
  "id, restaurant_id, table_id, type, status, created_at, restaurant_tables(label)";

type RawOrderRow = {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  restaurant_tables: { label: string } | { label: string }[] | null;
  order_items:
    | {
        id: string;
        item_name: string;
        variant_name: string | null;
        quantity: number;
        addons: { name: string; price: number }[] | null;
        notes: string | null;
      }[]
    | null;
};

type RawRequestRow = {
  id: string;
  restaurant_id: string;
  table_id: string;
  type: string;
  status: string;
  created_at: string;
  restaurant_tables: { label: string } | { label: string }[] | null;
};

/** PostgREST returns an embedded one-to-one as an object or a single-element array. */
function tableLabelOf(
  rel: { label: string } | { label: string }[] | null
): string | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.label ?? null : rel.label;
}

function toKitchenOrder(row: RawOrderRow): KitchenOrder {
  const items: KitchenItem[] = (row.order_items ?? []).map((i) => ({
    id: i.id,
    itemName: i.item_name,
    variantName: i.variant_name,
    quantity: i.quantity,
    addons: i.addons ?? [],
    notes: i.notes,
  }));

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status as KitchenOrder["status"],
    placedAt: row.placed_at,
    tableLabel: tableLabelOf(row.restaurant_tables),
    items,
  };
}

function toServiceRequest(row: RawRequestRow): ServiceRequest {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id,
    tableLabel: tableLabelOf(row.restaurant_tables),
    type: row.type as ServiceRequestType,
    status: row.status as ServiceRequest["status"],
    createdAt: row.created_at,
  };
}

export type KitchenBoard = {
  orders: KitchenOrder[];
  serviceRequests: ServiceRequest[];
};

export async function fetchKitchenBoard(restaurantId: string): Promise<KitchenBoard> {
  const supabase = createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [ordersResult, requestsResult] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled")
      .gte("placed_at", today.toISOString())
      .order("placed_at", { ascending: false }),

    supabase
      .from("service_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ]);

  if (ordersResult.error) {
    console.error("[kitchen] order fetch failed:", ordersResult.error);
  }
  if (requestsResult.error) {
    console.error("[kitchen] service request fetch failed:", requestsResult.error);
  }

  return {
    orders: ((ordersResult.data ?? []) as unknown as RawOrderRow[]).map(toKitchenOrder),
    serviceRequests: ((requestsResult.data ?? []) as unknown as RawRequestRow[]).map(
      toServiceRequest
    ),
  };
}
