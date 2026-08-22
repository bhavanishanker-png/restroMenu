import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { KitchenDisplay } from "@/components/kitchen/KitchenDisplay";
import type { KitchenOrder, KitchenItem } from "@/components/kitchen/types";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", session.restaurantId)
    .single();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: rawOrders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, placed_at, restaurant_tables(label), order_items(id, item_name, variant_name, quantity, addons, notes)"
    )
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "cancelled")
    .gte("placed_at", today.toISOString())
    .order("placed_at", { ascending: false });

  if (error) {
    console.error("[kitchen] initial fetch failed:", error);
  }

  const orders: KitchenOrder[] = (rawOrders ?? []).map((row) => {
    const tableRow = row.restaurant_tables as unknown as { label: string } | null;

    const items: KitchenItem[] = (
      (row.order_items ?? []) as {
        id: string;
        item_name: string;
        variant_name: string | null;
        quantity: number;
        addons: { name: string; price: number }[] | null;
        notes: string | null;
      }[]
    ).map((i) => ({
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
      tableLabel: tableRow?.label ?? null,
      items,
    };
  });

  return (
    <KitchenDisplay
      restaurantId={session.restaurantId}
      restaurantName={restaurant?.name ?? "Kitchen"}
      initialOrders={orders}
    />
  );
}
