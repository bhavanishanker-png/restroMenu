-- ============================================================
-- 013 — Tip and emailed bill support on orders.
--
-- Two product additions land on the same table, so they share one
-- migration and one create_order rewrite:
--
--   * tip            — an optional gratuity the diner adds at checkout.
--                      Stored as its own column (never folded into
--                      service_charge) so reports can separate staff
--                      gratuity from the restaurant's service charge,
--                      and so it is excluded from the GST base. Tip is
--                      NOT taxed: it is added after tax in pricing.ts.
--   * customer_email — optional, captured at checkout only to email the
--                      bill. No account, no marketing.
--   * bill_emailed_at— set when a bill has been sent, so the UI can show
--                      "sent" and a resend doesn't look like a failure.
--
-- All three are nullable / defaulted, so existing rows are unaffected.
-- ============================================================

alter table orders
  add column if not exists tip numeric(10,2) not null default 0,
  add column if not exists customer_email text,
  add column if not exists bill_emailed_at timestamptz;

-- Recreate create_order to persist `tip` and `customer_email`.
-- Everything else is unchanged from 008_order_item_image_snapshot.sql.
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
    customer_name, customer_phone, customer_email, notes, idempotency_key,
    payment_method, subtotal, tax_total, service_charge, packing_charge,
    discount, tip, total
  ) values (
    (p_data->>'restaurant_id')::uuid,
    nullif(p_data->>'table_id',   '')::uuid,
    nullif(p_data->>'session_id', '')::uuid,
    v_order_number,
    p_data->>'order_type',
    p_data->>'customer_name',
    p_data->>'customer_phone',
    nullif(p_data->>'customer_email', ''),
    nullif(p_data->>'notes', ''),
    p_data->>'idempotency_key',
    p_data->>'payment_method',
    (p_data->>'subtotal')::numeric,
    (p_data->>'tax_total')::numeric,
    (p_data->>'service_charge')::numeric,
    (p_data->>'packing_charge')::numeric,
    (p_data->>'discount')::numeric,
    coalesce((p_data->>'tip')::numeric, 0),
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
