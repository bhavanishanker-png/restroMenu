# 0007 — Kitchen board: polling over realtime

**Status:** Accepted (supersedes the original "Supabase Realtime for the kitchen" plan)

## Context

The kitchen display must show new orders within seconds. The original design subscribed the browser to Supabase Realtime (`postgres_changes` on `orders`).

In practice the board **silently froze** on whatever the server first rendered. The cause: Realtime delivers rows only if the subscriber passes the table's RLS policy, and the `orders` policy identifies staff with `auth.uid()`. Staff authenticate with a signed cookie ([0006](0006-staff-sessions.md)), not Supabase Auth, so to the database the browser is anonymous and sees zero rows. No error is raised; events just never arrive.

## Options considered

1. **Move staff onto Supabase Auth** so `auth.uid()` works. Doesn't fit PIN login on shared tablets, and is a large migration.
2. **Mint Supabase-compatible JWTs** from the custom session so Realtime can apply RLS. Workable, but couples the session format to Supabase internals and adds key-management surface.
3. **Loosen RLS** so the anon key can read orders. Leaks customer names and phone numbers across tenants. Rejected outright.
4. **Poll a server route** that reads with the service role, scoped to the caller's restaurant.

## Decision

Option 4, keeping Realtime as an accelerator:

- `GET /api/kitchen/board` checks the staff session and role, then returns that restaurant's active orders and service requests. The same `fetchKitchenBoard()` query also renders the first page load on the server, so there is one read path.
- The kitchen screen polls it every **8 seconds**.
- The Realtime subscription is kept, but an event only **nudges** an immediate poll (debounced). If Realtime ever delivers, latency drops; if it doesn't, nothing breaks. It is never the only path to fresh data.
- A poll response that lands after a local tap is discarded (a mutation sequence counter), so polling never rolls back an optimistic change.

## Consequences

- ✅ Works with the existing auth model and keeps tenant isolation in one server-side place.
- ✅ Simple to reason about and debug: plain HTTP, visible in the network tab.
- ⚠️ Up to 8 s latency for a new order (usually less, thanks to the nudge).
- ⚠️ **Load grows with open screens, not with orders.** Each screen makes 7.5 requests a minute. 1,000 restaurants with one kitchen screen each is about **125 requests/second** of steady database reads before any customer traffic. This is the first thing to fix at scale. Options, in order: skip the query when nothing changed (an `updated_at` or version check), cache the board for a second or two per restaurant, then push changes over Server-Sent Events from a server that holds the service role.
- 📌 Lesson: an auth design decision (custom cookie sessions) had a non-obvious effect on a different subsystem (Realtime + RLS). The failure was silent, so it's documented here and in the code next to the poll.

## Update (2026-11-17) — server-pushed broadcast replaces the dead subscription

The `postgres_changes` subscription in Option 4 never fired (same RLS reason as above), so the 8 s poll was doing all the work. We replaced it with a working push without touching the auth model, moving a step toward the SSE plan:

- The server sends a Supabase Realtime **broadcast** to `kitchen:<restaurantId>` whenever an order is created, an order's status changes, or a service request is created or resolved. It is one stateless HTTP POST to the Realtime broadcast endpoint — no websocket to hold open in a serverless function. See `src/lib/realtime.ts` (`broadcastKitchenUpdate`).
- A **broadcast** channel is **not** row-RLS filtered, so the cookie-authenticated anon client receives it — which is exactly what `postgres_changes` could not do. The message carries **no order data**, only a `board_changed` nudge; the board itself is still refetched through the authorized service-role route, so nothing sensitive crosses a public channel.
- The poll is **demoted to a 60 s safety net** for a dropped broadcast or a tablet waking from sleep. It is no longer the primary path.

Consequence changes:
- ✅ New orders now appear in **well under a second** on a healthy connection, not up to 8 s.
- ✅ Steady-state read load drops sharply: screens refetch on *change*, not on a timer. The ~125 reads/s figure below now applies only to the slow safety-net poll (1 req/min/screen ≈ **~17 reads/s** at 1,000 screens), plus one broadcast POST per order/status change.
- ⚠️ Broadcast is best-effort by design: it never throws and never blocks an order write. Correctness still rests on the server route + safety-net poll, not on the broadcast arriving.

This is the honest basis for describing the kitchen display as **real-time using Supabase Realtime**: the transport is Supabase Realtime (broadcast), with secure server-side reads.

## Where it lives

- `src/app/api/kitchen/board/route.ts`
- `src/lib/queries/kitchen.ts` — `fetchKitchenBoard`
- `src/lib/realtime.ts` — `broadcastKitchenUpdate`, the server push
- `src/app/api/orders/route.ts`, `src/app/api/orders/[orderId]/status/route.ts`, `src/app/api/service-requests/route.ts` — broadcast emitters
- `src/components/kitchen/KitchenDisplay.tsx` — broadcast subscription, safety-net poll, stale-response guard
