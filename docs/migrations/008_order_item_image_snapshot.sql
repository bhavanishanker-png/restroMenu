-- ============================================================
-- Add an image snapshot to order_items.
--
-- Order history, the order tracker and the receipt had no way to
-- show a dish photo: order_items carried no image column, and
-- POST /api/orders hardcoded `imageUrl: null`.
--
-- Reading the picture back off menu_items is not an option — the
-- project rule is that a historic order never joins to menu_items
-- (an item can be renamed, repriced, re-photographed or soft
-- deleted, and a past order must keep showing what was actually
-- bought). So the image is snapshotted alongside item_name and
-- unit_price, exactly like every other line-item field.
--
-- Nullable on purpose: existing rows have no snapshot to backfill,
-- and items legitimately may have no photo. The UI already handles
-- a missing image with a placeholder.
-- ============================================================

alter table order_items
  add column if not exists image_url text;   -- SNAPSHOT

-- Persist it from the create_order payload. Everything else in this
-- function is unchanged from 002_create_order_fn.sql.
create or replace function create_order(p_data jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_item         jsonb;
begin
  v_order_number := next_order_number((p_data->>'restaurant_id')::uuid);

  insert into orders (
    restaurant_id, table_id, session_id, order_number, order_type,
    customer_name, customer_phone, notes, idempotency_key, payment_method,
    subtotal, tax_total, service_charge, packing_charge, discount, total
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

  for v_item in select * from jsonb_array_elements(p_data->'items')
  loop
    insert into order_items (
      order_id, item_id, item_name, variant_name, unit_price, quantity,
      addons, tax_rate, line_total, notes, kitchen_station, ordered_by,
      image_url
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
      coalesce(nullif(v_item->>'kitchen_station', ''), 'main'),
      nullif(v_item->>'ordered_by', ''),
      nullif(v_item->>'image_url', '')
    );
  end loop;

  insert into order_events (order_id, status)
  values (v_order_id, 'placed');

  return jsonb_build_object(
    'order_id',     v_order_id::text,
    'order_number', v_order_number
  );
end;
$$;
