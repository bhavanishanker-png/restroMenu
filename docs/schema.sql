-- ============================================================
-- QR Restaurant Ordering Platform — Schema
-- Run this once in the Supabase SQL editor before writing code.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================

create table restaurants (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  logo_url          text,
  cover_url         text,
  phone             text,
  address           text,
  gst_number        text,
  currency          text not null default 'INR',
  timezone          text not null default 'Asia/Kolkata',
  plan              text not null default 'free',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table restaurant_settings (
  restaurant_id       uuid primary key references restaurants(id) on delete cascade,
  accepts_cash        boolean not null default true,
  accepts_online      boolean not null default true,
  service_charge_pct  numeric(5,2) not null default 0,
  packing_charge      numeric(10,2) not null default 0,
  opening_hours       jsonb,          -- { "mon": [["09:00","23:00"]], ... }
  order_number_prefix text not null default 'ORD',
  auto_accept_orders  boolean not null default false,
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- STAFF
-- ============================================================

create table staff (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  auth_user_id  uuid,                                   -- Supabase auth.users.id
  name          text not null,
  phone         text,
  role          text not null check (role in ('owner','manager','kitchen','waiter')),
  pin_hash      text,                                   -- bcrypt, floor staff only
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table platform_admins (
  auth_user_id uuid primary key,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- TABLES & SESSIONS
-- ============================================================

create table restaurant_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label         text not null,                          -- "T7", "Rooftop 3"
  seats         int not null default 4,
  qr_token      text unique not null,                   -- random; printed on standee
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id      uuid not null references restaurant_tables(id) on delete cascade,
  join_code     text,                                   -- 4-digit, group ordering (R2)
  status        text not null default 'open' check (status in ('open','billed','closed')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz
);

-- ============================================================
-- MENU
-- ============================================================

create table menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  name           text not null,
  sort_order     int not null default 0,
  available_from time,                                  -- null = always available
  available_to   time,
  active_days    int[],                                 -- 0=Sun .. 6=Sat; null = all days
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table menu_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  category_id     uuid references menu_categories(id) on delete set null,
  name            text not null,
  description     text,
  image_url       text,
  base_price      numeric(10,2) not null check (base_price >= 0),
  cost_price      numeric(10,2),                        -- margin reports (R3)
  food_type       text not null default 'veg' check (food_type in ('veg','non_veg','egg')),
  spice_level     int not null default 0 check (spice_level between 0 and 3),
  prep_minutes    int not null default 15,
  tax_rate        numeric(5,2) not null default 5,      -- GST %
  kitchen_station text not null default 'main',         -- tandoor / chinese / bar (R3)
  tags            text[] default '{}',                  -- jain, bestseller, chef_special
  is_available    boolean not null default true,        -- the out-of-stock toggle
  sort_order      int not null default 0,
  is_active       boolean not null default true,        -- soft delete
  created_at      timestamptz not null default now()
);

create table item_variants (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references menu_items(id) on delete cascade,
  name        text not null,                            -- Half / Full
  price_delta numeric(10,2) not null default 0,
  is_default  boolean not null default false,
  sort_order  int not null default 0
);

create table addon_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,                          -- "Extra toppings"
  min_select    int not null default 0,
  max_select    int not null default 5
);

create table addons (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid not null references addon_groups(id) on delete cascade,
  name     text not null,
  price    numeric(10,2) not null default 0
);

create table item_addon_groups (
  item_id  uuid not null references menu_items(id) on delete cascade,
  group_id uuid not null references addon_groups(id) on delete cascade,
  primary key (item_id, group_id)
);

-- ============================================================
-- ORDERS
-- ============================================================

create table orders (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  table_id        uuid references restaurant_tables(id),
  session_id      uuid references table_sessions(id),
  order_number    text not null,                        -- ORD-0042
  order_type      text not null default 'dine_in'
                    check (order_type in ('dine_in','takeaway','pre_order')),
  customer_name   text,
  customer_phone  text,
  status          text not null default 'placed'
                    check (status in ('placed','accepted','preparing','ready','served','cancelled')),
  subtotal        numeric(10,2) not null,
  tax_total       numeric(10,2) not null default 0,
  service_charge  numeric(10,2) not null default 0,
  packing_charge  numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null,
  payment_status  text not null default 'pending'
                    check (payment_status in ('pending','paid','failed','refunded')),
  payment_method  text,                                 -- cash / razorpay
  payment_ref     text,
  notes           text,
  idempotency_key text unique not null,
  placed_at       timestamptz not null default now(),
  accepted_at     timestamptz,
  ready_at        timestamptz,
  served_at       timestamptz,
  -- Business day, derived from placed_at. Order numbers reset daily, so
  -- uniqueness must be scoped to the day — a plain
  -- unique (restaurant_id, order_number) collides on day 2. See
  -- migrations/007_fix_order_number_collision.sql.
  order_day       date generated always as (((placed_at at time zone 'UTC')::date)) stored,
  constraint orders_restaurant_day_number_key unique (restaurant_id, order_day, order_number)
);

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  item_id         uuid references menu_items(id),       -- reference only, never priced from
  item_name       text not null,                        -- SNAPSHOT
  variant_name    text,                                 -- SNAPSHOT
  unit_price      numeric(10,2) not null,               -- SNAPSHOT (base + variant + addons)
  quantity        int not null check (quantity > 0),
  addons          jsonb not null default '[]',          -- SNAPSHOT [{name, price}]
  tax_rate        numeric(5,2) not null default 5,      -- SNAPSHOT
  line_total      numeric(10,2) not null,
  notes           text,
  kitchen_station text not null default 'main',
  status          text not null default 'pending',
  ordered_by      text                                  -- person name, group ordering (R2)
);

create table order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  status     text not null,
  staff_id   uuid references staff(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- EXTRAS (Release 2)
-- ============================================================

create table service_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id      uuid not null references restaurant_tables(id) on delete cascade,
  type          text not null check (type in ('waiter','water','bill')),
  status        text not null default 'open' check (status in ('open','resolved')),
  created_at    timestamptz not null default now()
);

create table feedback (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  rating        int not null check (rating between 1 and 5),
  comment       text,
  is_public     boolean not null default false,         -- ratings < 3 stay private
  created_at    timestamptz not null default now()
);

create table loyalty (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  phone         text not null,
  visits        int not null default 0,
  points        int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (restaurant_id, phone)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_orders_restaurant_status on orders (restaurant_id, status, placed_at desc);
create index idx_orders_session           on orders (session_id);
create index idx_order_items_order        on order_items (order_id);
create index idx_menu_items_lookup        on menu_items (restaurant_id, category_id, is_active);
create index idx_menu_categories_lookup   on menu_categories (restaurant_id, sort_order);
create index idx_tables_token             on restaurant_tables (qr_token);
create index idx_staff_restaurant         on staff (restaurant_id, is_active);
create index idx_order_events_order       on order_events (order_id, created_at);

-- ============================================================
-- ORDER NUMBER GENERATOR
-- Per-restaurant sequential numbers, safe under concurrency.
-- ============================================================

create or replace function next_order_number(p_restaurant_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_next   int;
  v_today  date := (now() at time zone 'UTC')::date;
begin
  -- Serialise allocation per restaurant so two concurrent orders cannot
  -- read the same highest number and both claim it.
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text));

  select coalesce(order_number_prefix, 'ORD') into v_prefix
    from restaurant_settings where restaurant_id = p_restaurant_id;

  -- Highest number issued today, not a row count — deleting or cancelling
  -- an order must never cause a number to be reused.
  select coalesce(max((substring(order_number from '(\d+)$'))::int), 0) + 1
    into v_next
    from orders
   where restaurant_id = p_restaurant_id
     and order_day = v_today;

  return coalesce(v_prefix, 'ORD') || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Backstop only. Application code MUST still filter by restaurant_id.
-- ============================================================

alter table restaurants        enable row level security;
alter table menu_categories    enable row level security;
alter table menu_items         enable row level security;
alter table item_variants      enable row level security;
alter table addon_groups       enable row level security;
alter table addons             enable row level security;
alter table restaurant_tables  enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table staff              enable row level security;

-- Helper: is the current auth user staff at this restaurant?
create or replace function is_staff_of(p_restaurant_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from staff
     where restaurant_id = p_restaurant_id
       and auth_user_id = auth.uid()
       and is_active = true
  );
$$;

-- Public read of active menu data (the customer app uses the anon key)
create policy "public read restaurants"
  on restaurants for select using (is_active = true);

create policy "public read categories"
  on menu_categories for select using (is_active = true);

create policy "public read items"
  on menu_items for select using (is_active = true);

create policy "public read variants"
  on item_variants for select using (true);

create policy "public read addon groups"
  on addon_groups for select using (true);

create policy "public read addons"
  on addons for select using (true);

create policy "public read tables"
  on restaurant_tables for select using (is_active = true);

-- Staff full access to their own restaurant
create policy "staff manage categories"
  on menu_categories for all using (is_staff_of(restaurant_id));

create policy "staff manage items"
  on menu_items for all using (is_staff_of(restaurant_id));

create policy "staff manage tables"
  on restaurant_tables for all using (is_staff_of(restaurant_id));

create policy "staff read orders"
  on orders for select using (is_staff_of(restaurant_id));

create policy "staff update orders"
  on orders for update using (is_staff_of(restaurant_id));

create policy "staff read order items"
  on order_items for select using (
    exists (select 1 from orders o where o.id = order_id and is_staff_of(o.restaurant_id))
  );

create policy "staff read own record"
  on staff for select using (auth_user_id = auth.uid() or is_staff_of(restaurant_id));

-- Order creation goes through the server with the service role key,
-- which bypasses RLS. No public insert policy on orders by design.

-- ============================================================
-- REALTIME
-- ============================================================

alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table service_requests;
