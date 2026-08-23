import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toRestaurantSettings } from "@/lib/mappers";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { DbRestaurantSettings } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  const supabase = createServerClient();
  const [{ data, error }, restaurantData] = await Promise.all([
    supabase
      .from("restaurant_settings")
      .select("*")
      .eq("restaurant_id", session.restaurantId)
      .single(),
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", session.restaurantId)
      .single(),
  ]);

  if (error || !data) redirect("/dashboard");

  const settings = toRestaurantSettings(data as DbRestaurantSettings);
  const restaurantName = restaurantData.data?.name ?? undefined;

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md border-b border-outline-variant/30 bg-surface-container-lowest px-md py-sm shadow-level-1 shrink-0">
        <div>
          <h1 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>
            {restaurantName ? `${restaurantName} Settings` : "Restaurant Settings"}
          </h1>
          <p className="font-body-sm text-on-surface-variant">
            Configure billing rules, payment methods, and operations.
          </p>
        </div>
      </header>
      <SettingsForm settings={settings} restaurantName={restaurantName} />
    </div>
  );
}
