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
    <div className="flex flex-col gap-0">
      <div className="border-b border-stone-200 bg-white px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Restaurants</h1>
          <p className="text-sm text-stone-500">All tenants on this QBite instance.</p>
        </div>
        <form action="/api/admin/auth" method="DELETE">
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
          >
            Sign out
          </button>
        </form>
      </div>
      <AdminRestaurantsClient initialRestaurants={restaurants} />
    </div>
  );
}
