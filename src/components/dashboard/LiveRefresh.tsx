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
 * The poll — not the subscription — is what guarantees freshness. The browser
 * holds the anon key and the `orders` RLS policy resolves staff through
 * `auth.uid()`, which a signed-cookie session never sets, so postgres_changes
 * delivers nothing to a staff screen today. The subscription is kept purely as
 * a latency win, and it only nudges the same refresh the timer would do.
 */

const DEBOUNCE_MS = 400;
const POLL_MS = 15_000;

type Props = {
  restaurantId: string;
  /** Tenant tables whose changes should trigger a refresh. */
  tables?: readonly string[];
};

export function LiveRefresh({
  restaurantId,
  tables = ["orders", "service_requests"],
}: Props) {
  const router = useRouter();
  // A fresh array literal on every parent render would otherwise tear down and
  // rebuild the socket each time. Compare by value instead.
  const tableKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // One order write fires several events (the order row, then each item).
    // Collapse the burst into a single re-render.
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = supabase.channel(`dashboard:${restaurantId}:${tableKey}`);

    for (const table of tableKey.split(",")) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        scheduleRefresh
      );
    }

    channel.subscribe();

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
  }, [restaurantId, tableKey, router]);

  return null;
}
