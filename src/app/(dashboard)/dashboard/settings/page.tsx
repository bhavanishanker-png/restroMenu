import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toRestaurantSettings } from "@/lib/mappers";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
      .select("name, logo_url")
      .eq("id", session.restaurantId)
      .single(),
  ]);

  // Used to redirect to /dashboard silently, which looked like the Settings
  // link was broken. Log it and show the route's error boundary instead.
  if (error || !data) {
    console.error("[settings page]", error ?? "no restaurant_settings row");
    throw new Error("Failed to load settings.");
  }
  if (restaurantData.error) console.error("[settings page] restaurant", restaurantData.error);

  const settings = toRestaurantSettings(data as DbRestaurantSettings);
  const restaurantName = restaurantData.data?.name ?? undefined;
  const logoUrl = restaurantData.data?.logo_url ?? null;

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Settings"
        description={
          restaurantName
            ? `Profile, ordering rules, charges and payment methods for ${restaurantName}.`
            : "Profile, ordering rules, charges and payment methods."
        }
      />
      <SettingsForm settings={settings} restaurantName={restaurantName} logoUrl={logoUrl} />
    </div>
  );
}
