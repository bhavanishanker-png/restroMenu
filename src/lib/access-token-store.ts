/**
 * Supabase implementation of TokenStore (see access-tokens.ts). SERVER-ONLY.
 * Every query is scoped by restaurant_id where one is known.
 */
import { createServerClient } from "@/lib/supabase/server";
import type { TokenRow, TokenStore } from "@/lib/access-tokens";

export function supabaseTokenStore(): TokenStore {
  const supabase = createServerClient();
  return {
    async findActiveByHash(hash) {
      // Lookup by the unique hash; the restaurant is unknown until this row is found.
      const { data, error } = await supabase
        .from("staff_access_tokens")
        .select("id, restaurant_id, staff_id, scopes, last_used_at")
        .eq("token_hash", hash)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) {
        console.error("[access-tokens] token lookup failed", error);
        throw new Error("token lookup failed");
      }
      return (data as TokenRow | null) ?? null;
    },

    async findActiveStaffRole(staffId, restaurantId) {
      const { data, error } = await supabase
        .from("staff")
        .select("role")
        .eq("id", staffId)
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        console.error("[access-tokens] staff lookup failed", error);
        throw new Error("staff lookup failed");
      }
      return (data as { role: string } | null)?.role ?? null;
    },

    async touch(tokenId, restaurantId, at) {
      const { error } = await supabase
        .from("staff_access_tokens")
        .update({ last_used_at: at.toISOString() })
        .eq("id", tokenId)
        .eq("restaurant_id", restaurantId);
      if (error) throw new Error(`touch failed: ${error.message}`);
    },
  };
}
