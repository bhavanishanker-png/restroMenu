import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Throws at module evaluation time if this file is ever loaded in a browser
 * context. The service role key must never reach the client bundle.
 */
export function guardServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabase/server must never be imported in a client component. " +
        "Move this call to a Server Component or an API route."
    );
  }
}

guardServerOnly();

/**
 * Server-only Supabase client with the service role key.
 * Bypasses RLS — use only in API routes and Server Components.
 * Never import this file from any 'use client' module.
 */
export function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        // Next 14's App Router caches GET fetch() responses by default, and
        // supabase-js reads go out as GETs. Without this the Data Cache pins
        // the first response forever: an owner changes a price or marks an
        // item out of stock, and the customer menu keeps serving the old row
        // until the server restarts. Orders are still priced from the
        // database, so the visible effect is a menu that disagrees with the
        // bill. Every read through this client must hit Postgres.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
