import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { TablesManager } from "@/components/tables/TablesManager";
import { PageHeader } from "@/components/dashboard/PageHeader";
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

  const [{ data: tableRows, error: tablesError }, { data: restaurant, error: restaurantError }] = await Promise.all([
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

  // An error used to render as "no tables yet", inviting the owner to
  // recreate tables that already exist. Surface it via error.tsx instead.
  if (tablesError || restaurantError) {
    console.error("[tables page]", tablesError ?? restaurantError);
    throw new Error("Failed to load tables.");
  }

  const tables: TableEntry[] = (tableRows ?? []).map((row) => ({
    ...toTable(row as DbRestaurantTable),
    hasActiveSession:
      (row as { table_sessions: { status: string }[] }).table_sessions?.some(
        (s) => s.status === "open"
      ) ?? false,
  }));

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Tables & QR"
        description="Every table gets its own QR code. Download one, or print standees for the whole floor."
      />
      <TablesManager
        initialTables={tables}
        restaurantId={session.restaurantId}
        restaurantSlug={restaurant?.slug ?? ""}
      />
    </div>
  );
}
