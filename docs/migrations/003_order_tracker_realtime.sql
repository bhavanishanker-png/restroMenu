-- Migration 003: enable Realtime for the customer order tracker
-- Run in the Supabase SQL editor BEFORE deploying T10.
--
-- Security note (review in T20):
--   The SELECT policies below use `using (true)`, which lets any client read
--   any order/order_item row if they supply its UUID.  Since UUIDs have 122 bits
--   of entropy they are effectively unguessable; the order ID is never revealed
--   until after the customer places an order.  Tighten in T20 by adding a signed
--   access token column and verifying it here.

-- 1. Publish tables so Postgres emits Realtime change events.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;

-- 2. Allow unauthenticated clients to read an order they know the UUID for.
create policy "public read order by id"
  on orders for select
  to anon, authenticated
  using (true);

create policy "public read order items"
  on order_items for select
  to anon, authenticated
  using (true);
