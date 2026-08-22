import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { TablesManager } from "@/components/tables/TablesManager";
import { toTable } from "@/lib/mappers";
import type { DbRestaurantTable } from "@/types/db";
import type { RestaurantTable } from "@/types";

export const dynamic = "force-dynamic";

type TableEntry = RestaurantTable & { hasActiveSession: boolean };

export default async function TablesPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  const supabase = createServerClient();

  const [{ data: tableRows }, { data: restaurant }] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("*, table_sessions(status)")
      .eq("restaurant_id", session.restaurantId)
      .eq("is_active", true)
      .order("label", { ascending: true }),
    supabase
      .from("restaurants")
      .select("slug")
      .eq("id", session.restaurantId)
      .single(),
  ]);

  const tables: TableEntry[] = (tableRows ?? []).map((row) => ({
    ...toTable(row as DbRestaurantTable),
    hasActiveSession:
      (row as { table_sessions: { status: string }[] }).table_sessions?.some(
        (s) => s.status === "open"
      ) ?? false,
  }));

  return (
    <div className="flex flex-col">
      <header className="flex items-center border-b border-stone-200 bg-white px-5 py-3 shadow-sm">
        <h1 className="text-base font-semibold text-stone-900">Tables & QR codes</h1>
      </header>
      <TablesManager
        initialTables={tables}
        restaurantId={session.restaurantId}
        restaurantSlug={restaurant?.slug ?? ""}
      />
    </div>
  );
}
