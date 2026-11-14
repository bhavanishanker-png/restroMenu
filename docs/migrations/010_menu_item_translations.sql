-- 010 — Dish translations (task T34). Owner's choice: a table, not per-language
-- columns, so a new language needs no migration — only a new `locale` value.
--
-- restaurant_id is stored (not only derived through item_id) so every query
-- can be scoped with .eq('restaurant_id', …) like every other tenant table,
-- and RLS can use is_staff_of(restaurant_id) directly.

create table if not exists menu_item_translations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  item_id       uuid not null references menu_items(id) on delete cascade,
  locale        text not null check (locale in ('hi')),   -- widen the list to add a language
  name          text not null check (char_length(name) between 1 and 200),
  description   text check (char_length(description) <= 500),
  source        text not null default 'ai' check (source in ('ai', 'owner')),
  updated_at    timestamptz not null default now(),
  unique (item_id, locale)
);

create index if not exists idx_menu_item_translations_restaurant
  on menu_item_translations (restaurant_id);

alter table menu_item_translations enable row level security;

-- Same shape as menu_items: diners may read, staff of the restaurant may write.
-- The app reads and writes with the service role and scopes by restaurant_id
-- itself; these policies are the backstop for anon-key access.
create policy "public read translations"
  on menu_item_translations for select using (true);

create policy "staff manage translations"
  on menu_item_translations for all using (is_staff_of(restaurant_id));
