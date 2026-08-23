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
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant/30 bg-surface-container-lowest px-md py-sm shadow-level-1">
        <div>
          <h1 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>Table QR Setup</h1>
          <p className="font-body-sm text-on-surface-variant">Manage QR codes and print standees</p>
        </div>
      </header>
      <TablesManager
        initialTables={tables}
        restaurantId={session.restaurantId}
        restaurantSlug={restaurant?.slug ?? ""}
      />
    </div>
  );
}
