import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { createServerClient } from "@/lib/supabase/server";
import { toRestaurant } from "@/lib/mappers";
import { AdminRestaurantsClient } from "@/components/admin/AdminRestaurantsClient";
import type { DbRestaurant } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantsPage() {
  const ok = await getAdminSession();
  if (!ok) redirect("/admin/login");

  const supabase = createServerClient();
  const { data } = await supabase
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  const restaurants = (data ?? []).map((r) => toRestaurant(r as DbRestaurant));

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant/30 bg-surface-container-lowest px-md py-sm shadow-level-1 shrink-0">
        <div>
          <div className="flex items-center gap-sm">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container font-headline-sm">
              Q
            </div>
            <h1 className="font-headline-md text-primary" style={{ fontSize: 20 }}>
              QBite Admin
            </h1>
          </div>
          <p className="font-body-sm text-on-surface-variant mt-xs">
            Manage all registered dining locations.
          </p>
        </div>
        <form action="/api/admin/auth" method="DELETE">
          <button
            type="submit"
            className="flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant text-on-surface-variant font-label-bold text-label-bold hover:bg-surface-container-low transition-colors h-10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Sign out
          </button>
        </form>
      </header>
      <AdminRestaurantsClient initialRestaurants={restaurants} />
    </div>
  );
}
