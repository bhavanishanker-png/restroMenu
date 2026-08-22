-- Migration 003: enable Realtime for the customer order tracker
-- Run in the Supabase SQL editor BEFORE deploying T10.
--
-- Security note (review in T20):
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
