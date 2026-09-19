import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { MenuManager } from "@/components/menu-manager/MenuManager";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toMenuCategory, toAddonGroup } from "@/lib/mappers";
import type { DbMenuCategory, DbAddonGroup } from "@/types/db";
import type { MenuCategory, AddonGroup } from "@/types";

export const dynamic = "force-dynamic";

type CategoryWithCount = MenuCategory & { itemCount: number };

export default async function MenuPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const guard =
    session.role === "owner" || session.role === "manager" ? null : "forbidden";
  if (guard) redirect("/dashboard");

  const supabase = createServerClient();

  const [{ data: catRows }, { data: groupRows }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*, menu_items(count)")
      .eq("restaurant_id", session.restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("addon_groups")
      .select("*, addons(*)")
      .eq("restaurant_id", session.restaurantId)
      .order("name", { ascending: true }),
  ]);

  const categories: CategoryWithCount[] = (catRows ?? []).map((row) => ({
    ...toMenuCategory(row as DbMenuCategory),
    itemCount:
      (row as { menu_items: { count: number }[] }).menu_items?.[0]?.count ?? 0,
  }));

  const addonGroups: AddonGroup[] = (groupRows ?? []).map((row) =>
    toAddonGroup(row as DbAddonGroup)
  );

  return (
    <div className="flex h-screen flex-col bg-surface">
      <div className="shrink-0">
        <PageHeader
          title="Menu"
          description="Categories, dishes, pricing and availability. Changes go live immediately."
        />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MenuManager initialCategories={categories} addonGroups={addonGroups} />
      </div>
    </div>
  );
}
