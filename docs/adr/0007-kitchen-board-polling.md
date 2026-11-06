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

## Where it lives

- `src/app/api/kitchen/board/route.ts`
- `src/lib/queries/kitchen.ts` — `fetchKitchenBoard`
- `src/components/kitchen/KitchenDisplay.tsx` — polling, Realtime nudge, stale-response guard
