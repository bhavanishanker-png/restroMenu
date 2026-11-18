/**
 * realtime.ts — server-side push to the kitchen display.
 *
 * The kitchen board is read through /api/kitchen/board with the service role
 * (staff auth is a signed cookie, so RLS gives the browser's anon client zero
 * rows and `postgres_changes` delivers nothing — see ADR 0007). This helper
 * closes that gap: whenever an order or service request changes, the server
 * sends a tiny Supabase Realtime **broadcast** to the restaurant's channel.
 * The browser subscribes to that broadcast and refetches the board.
 *
 * Why broadcast and not postgres_changes: a broadcast channel is not row-RLS
 * filtered, so the cookie-authenticated anon client can receive it. The message
 * carries NO order data — only a "something changed" nudge — so nothing
 * sensitive leaves over a public channel; the real data still comes back
 * through the authorized server route.
 *
 * Why HTTP and not a websocket: this runs in serverless functions. The Realtime
 * REST broadcast endpoint is a single stateless POST, with no socket to open,
 * hold or tear down per request.
 *
 * This is a LATENCY optimisation, never a correctness dependency. It is
 * best-effort: any failure is logged and swallowed, because the kitchen display
 * still has its slow safety-net poll. A broadcast must never fail an order write.
 */

import { guardServerOnly } from "@/lib/supabase/server";

guardServerOnly();

export type KitchenBroadcastKind = "order" | "service_request";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The channel name the kitchen display subscribes to for one restaurant. */
export function kitchenChannel(restaurantId: string): string {
  return `kitchen:${restaurantId}`;
}

/** The channel a single diner's order tracker subscribes to. */
export function orderChannel(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * Nudge one diner's order tracker to refetch — on a status change or a payment
 * update. Same best-effort semantics as the kitchen broadcast: never throws,
 * the tracker's slow poll is the safety net. The message carries no order data;
 * the tracker refetches through the authorized route, keyed by the order UUID
 * it already holds, so nothing sensitive crosses the channel.
 */
export async function broadcastOrderUpdate(orderId: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        messages: [
          {
            topic: orderChannel(orderId),
            event: "order_changed",
            payload: {},
            private: false,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[realtime] order broadcast returned ${res.status} for ${orderId}`);
    }
  } catch (err) {
    console.error("[realtime] order broadcast failed", err);
  }
}

/**
 * Nudge a restaurant's kitchen display to refetch its board. Fire-and-forget
 * from the caller's point of view: it never throws and never rejects.
 */
export async function broadcastKitchenUpdate(
  restaurantId: string,
  kind: KitchenBroadcastKind
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      // Not part of Next's Data Cache — this is a side effect, not a read.
      cache: "no-store",
      body: JSON.stringify({
        messages: [
          {
            topic: kitchenChannel(restaurantId),
            event: "board_changed",
            payload: { kind },
            private: false,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error(
        `[realtime] kitchen broadcast returned ${res.status} for ${restaurantId}`
      );
    }
  } catch (err) {
    // Swallowed on purpose: the poll is the safety net.
    console.error("[realtime] kitchen broadcast failed", err);
  }
}
