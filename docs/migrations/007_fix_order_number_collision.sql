-- ============================================================
-- Fix: order creation breaks permanently the day after any
-- order is placed.
--
-- `next_order_number()` resets the counter daily:
--     select count(*) + 1 ... where placed_at >= date_trunc('day', now())
-- but the uniqueness constraint spanned all time:
--     unique (restaurant_id, order_number)
--
-- So the first order on day 2 regenerates ORD-0001, collides with
-- day 1's ORD-0001, and raises
--     23505 orders_restaurant_id_order_number_key
-- Every subsequent order that day fails the same way. The API
-- reports this as CREATE_FAILED, so it reads as a transient glitch
-- rather than a hard outage.
--
-- Daily-resetting numbers are the desired behaviour (staff call out
-- "order 42", not "order 118431"), so the constraint is scoped to
-- the business day instead of the number being made global.
--
-- Also fixes two lesser faults in the same function:
--   * count(*) is racy — two concurrent orders read the same count
--     and generate the same number. Now serialised per restaurant
--     with a transaction-scoped advisory lock.
--   * count(*) reuses numbers after a row is deleted. Now derived
--     from the highest number actually issued today.
-- ============================================================

-- ---------- 1. Business-day column ----------
-- Immutable expression, so it is valid in a stored generated column.
-- UTC matches what date_trunc('day', now()) already did on Supabase.

alter table orders
  add column if not exists order_day date
  generated always as (((placed_at at time zone 'UTC')::date)) stored;

-- ---------- 2. Re-scope the uniqueness constraint ----------

alter table orders
  drop constraint if exists orders_restaurant_id_order_number_key;

-- Partial-free plain unique: one ORD-0001 per restaurant per day.
alter table orders
  add constraint orders_restaurant_day_number_key
  unique (restaurant_id, order_day, order_number);

-- ---------- 3. Collision-free, race-free generator ----------

create or replace function next_order_number(p_restaurant_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_next   int;
  v_today  date := (now() at time zone 'UTC')::date;
begin
  -- Serialise number allocation for this restaurant until the
  -- transaction ends. Two concurrent orders can no longer read the
  -- same highest number and both claim it.
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text));

  select coalesce(order_number_prefix, 'ORD') into v_prefix
    from restaurant_settings
   where restaurant_id = p_restaurant_id;

  -- Highest number issued today, not a row count — deleting or
  -- cancelling an order must never cause a number to be reused.
  select coalesce(max((substring(order_number from '(\d+)$'))::int), 0) + 1
    into v_next
    from orders
   where restaurant_id = p_restaurant_id
     and order_day = v_today;

  return coalesce(v_prefix, 'ORD') || '-' || lpad(v_next::text, 4, '0');
end;
$$;
