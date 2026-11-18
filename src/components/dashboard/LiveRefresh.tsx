"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a `force-dynamic` Server Component page in sync with what customers
 * are doing, without the staff member reloading the tab.
 *
 * `router.refresh()` re-runs the RSC render in place: no full document load,
 * no lost scroll position, no client state reset.
 *
 * Primary path: a Supabase Realtime broadcast. The server pushes "board_changed"
 * to kitchen:<restaurantId> on every order and service-request change (see
 * src/lib/realtime.ts), so a new order or a "Call waiter" tap refreshes this
 * page in about a second. Broadcast is used instead of postgres_changes because
 * the browser holds the anon key and the `orders` RLS policy resolves staff
 * through `auth.uid()`, which a cookie session never sets — so row-change events
 * are filtered out and never arrive. A broadcast channel isn't row-RLS filtered.
 *
 * Safety net: a slow poll still runs, so a dropped broadcast can never leave the
 * page stale for long.
 */

const DEBOUNCE_MS = 400;
const POLL_MS = 30_000;

type Props = {
  restaurantId: string;
};

export function LiveRefresh({ restaurantId }: Props) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // One order write fires several events server-side; the debounce collapses
    // a burst of nudges into a single re-render.
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`kitchen:${restaurantId}`)
      .on("broadcast", { event: "board_changed" }, scheduleRefresh)
      .subscribe();

    // Don't burn queries re-rendering a page nobody is looking at.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh();
    }, POLL_MS);

    // A backgrounded tab skips its polls, so catch up on the way back.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  return null;
}
