import { createServerClient } from "@/lib/supabase/server";
import { toOrder, toOrderItem } from "@/lib/mappers";
import type { Order, OrderItem } from "@/types";
import type { DbOrder, DbOrderItem } from "@/types/db";

export type FetchOrderResult =
  | {
      ok: true;
      order: Order;
      items: OrderItem[];
      tableLabel: string | null;
      estimatedReadyAt: string | null;
    }
  | { ok: false; code: "NOT_FOUND" | "DB_ERROR" };

type RawOrderRow = DbOrder & {
  restaurant_tables: { label: string } | null;
  order_items: (DbOrderItem & { menu_items: { prep_minutes: number } | null })[];
};

export async function fetchOrder(orderId: string): Promise<FetchOrderResult> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `*, restaurant_tables(label), order_items(*, menu_items(prep_minutes))`
    )
    .eq("id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return { ok: false, code: "NOT_FOUND" };
    return { ok: false, code: "DB_ERROR" };
  }

  const raw = data as RawOrderRow;

  const tableLabel = raw.restaurant_tables?.label ?? null;
  const order = toOrder(raw);

  // Cast through unknown to drop the joined menu_items field before mapping.
  const items = (raw.order_items ?? []).map((row) =>
    toOrderItem(row as unknown as DbOrderItem)
  );

  // Estimated ready: placed_at + max prep_minutes across all items.
  // Joining menu_items here is for display only — no pricing is derived.
  const maxPrepMinutes = (raw.order_items ?? []).reduce((max, row) => {
    return Math.max(max, row.menu_items?.prep_minutes ?? 15);
  }, 0);

  const estimatedReadyAt =
    order.status === "placed" || order.status === "accepted" || order.status === "preparing"
      ? new Date(
          new Date(order.placedAt).getTime() + maxPrepMinutes * 60_000
        ).toISOString()
      : null;

  return { ok: true, order, items, tableLabel, estimatedReadyAt };
}
