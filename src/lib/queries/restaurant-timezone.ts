import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/restaurant-time";

/**
 * The restaurant's configured timezone. Falls back to IST — the schema
 * default — if the lookup fails, which is logged; a failed lookup should not
 * blank the dashboard.
 */
export const getRestaurantTimezone = cache(async (restaurantId: string): Promise<string> => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("timezone")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) {
    console.error("[restaurant-time] timezone lookup failed; using default", error);
    return DEFAULT_TIMEZONE;
  }
  return data?.timezone ?? DEFAULT_TIMEZONE;
});
