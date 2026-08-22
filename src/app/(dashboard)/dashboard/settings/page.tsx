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
  const { data, error } = await supabase
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .single();

  if (error || !data) redirect("/dashboard");

  const settings = toRestaurantSettings(data as DbRestaurantSettings);

  return (
    <div className="flex flex-col gap-0">
      <div className="border-b border-stone-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-stone-900">Settings</h1>
        <p className="text-sm text-stone-500">Configure billing, payments, and operations.</p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
