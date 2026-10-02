-- Migration 003: enable Realtime for the customer order tracker
-- Run in the Supabase SQL editor BEFORE deploying T10.
--
-- !! DO NOT RUN AS WRITTEN — the policies below leak every order. !!
--
-- `using (true)` does NOT mean "readable if you know the UUID". It makes every
-- row readable to the anon key, which ships in every browser bundle, so
-- `GET /rest/v1/orders?select=*` would list all orders for all restaurants,
-- customer phone numbers included. A filter is something the *client* chooses
-- to send; RLS cannot require one.
--
-- The tracker does not need this: it polls GET /api/orders/[orderId], which
-- reads with the service role and returns a redacted guest view
-- (src/lib/order-privacy.ts). Realtime is only a latency nudge on top of that
-- poll. If Realtime is wanted for guests, gate the policy on a per-order
-- secret the client must present (e.g. a signed token claim), not `true`.
--
-- Original note (review in T20), kept for history — its premise is wrong:
--   The SELECT policies below use `using (true)`, which lets any client read
--   any order/order_item row if they supply its UUID.  Since UUIDs have 122 bits
--   of entropy they are effectively unguessable; the order ID is never revealed
--   until after the customer places an order.  Tighten in T20 by adding a signed
--   access token column and verifying it here.

-- 1. Publish tables so Postgres emits Realtime change events (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table order_items;
  end if;
end $$;

-- 2. Allow unauthenticated clients to read an order they know the UUID for.
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'orders' and policyname = 'public read order by id'
  ) then
    execute 'create policy "public read order by id" on orders for select to anon, authenticated using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'order_items' and policyname = 'public read order items'
  ) then
    execute 'create policy "public read order items" on order_items for select to anon, authenticated using (true)';
  end if;
end $$;
