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
    }
  );
}
