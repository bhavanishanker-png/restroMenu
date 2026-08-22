-- Migration 002: atomic order-creation function
-- Run in the Supabase SQL editor BEFORE deploying T09.
--
-- This function inserts orders + order_items + order_events in a single
-- transaction so a partial order can never exist.  Called from
-- src/app/api/orders/route.ts via supabase.rpc('create_order', {p_data}).

create or replace function create_order(p_data jsonb)
returns jsonb
language plpgsql
security invoker  -- runs with caller's role (service role bypasses RLS)
as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_item         jsonb;
begin
  -- Step 7: generate order number using existing function
  v_order_number := next_order_number((p_data->>'restaurant_id')::uuid);

  -- Step 8a: insert the order row
  insert into orders (
    restaurant_id,
    table_id,
    session_id,
    order_number,
    order_type,
    customer_name,
    customer_phone,
    notes,
    idempotency_key,
    payment_method,
    subtotal,
    tax_total,
    service_charge,
    packing_charge,
    discount,
    total
  ) values (
    (p_data->>'restaurant_id')::uuid,
    nullif(p_data->>'table_id',   '')::uuid,
    nullif(p_data->>'session_id', '')::uuid,
    v_order_number,
    p_data->>'order_type',
    p_data->>'customer_name',
    p_data->>'customer_phone',
    nullif(p_data->>'notes', ''),
    p_data->>'idempotency_key',
    p_data->>'payment_method',
    (p_data->>'subtotal')::numeric,
    (p_data->>'tax_total')::numeric,
    (p_data->>'service_charge')::numeric,
    (p_data->>'packing_charge')::numeric,
    (p_data->>'discount')::numeric,
    (p_data->>'total')::numeric
  )
  returning id into v_order_id;

  -- Step 8b: insert snapshot order_items
  for v_item in select * from jsonb_array_elements(p_data->'items')
  loop
    insert into order_items (
      order_id,
      item_id,
      item_name,
      variant_name,
      unit_price,
      quantity,
      addons,
      tax_rate,
      line_total,
      notes,
      kitchen_station
    ) values (
      v_order_id,
      nullif(v_item->>'item_id', '')::uuid,
      v_item->>'item_name',
      nullif(v_item->>'variant_name', ''),
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      coalesce((v_item->'addons'), '[]'::jsonb),
      (v_item->>'tax_rate')::numeric,
      (v_item->>'line_total')::numeric,
      nullif(v_item->>'notes', ''),
      coalesce(nullif(v_item->>'kitchen_station', ''), 'main')
    );
  end loop;

  -- Step 8c: initial status event
  insert into order_events (order_id, status)
  values (v_order_id, 'placed');

  return jsonb_build_object(
    'order_id',     v_order_id::text,
    'order_number', v_order_number
  );
end;
$$;

-- Grant to the service role (already has full access, but explicit is better)
-- grant execute on function create_order(jsonb) to service_role;
