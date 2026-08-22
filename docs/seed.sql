-- ============================================================
-- Seed: one realistic restaurant.
-- Run AFTER schema.sql. Uses real-world dish names, prices and
-- awkward edge cases (long names, many variants) on purpose —
-- clean fake data hides layout bugs.
-- ============================================================

do $$
declare
  r_id  uuid;
  c_starters uuid; c_mains uuid; c_breads uuid; c_rice uuid; c_drinks uuid;
  g_extras uuid; g_bread_addons uuid;
  i_id uuid;
begin

-- ---------- Restaurant ----------
insert into restaurants (slug, name, phone, address, gst_number)
values ('tandoori-hut', 'Tandoori Hut', '+919812345678',
        'Sector 15, Model Town, Sonipat, Haryana 131001', '06AABCT1234C1ZX')
returning id into r_id;

insert into restaurant_settings (restaurant_id, service_charge_pct, packing_charge, order_number_prefix, opening_hours)
values (r_id, 5.00, 20.00, 'TH',
        '{"mon":[["11:00","23:00"]],"tue":[["11:00","23:00"]],"wed":[["11:00","23:00"]],
          "thu":[["11:00","23:00"]],"fri":[["11:00","23:30"]],"sat":[["11:00","23:30"]],
          "sun":[["11:00","23:00"]]}'::jsonb);

-- ---------- Tables ----------
insert into restaurant_tables (restaurant_id, label, seats, qr_token)
select r_id, 'T' || g, case when g <= 6 then 4 else 6 end,
       encode(gen_random_bytes(16), 'hex')
from generate_series(1, 10) g;

-- ---------- Categories ----------
insert into menu_categories (restaurant_id, name, sort_order) values (r_id, 'Starters', 1) returning id into c_starters;
insert into menu_categories (restaurant_id, name, sort_order) values (r_id, 'Main Course', 2) returning id into c_mains;
insert into menu_categories (restaurant_id, name, sort_order) values (r_id, 'Breads', 3) returning id into c_breads;
insert into menu_categories (restaurant_id, name, sort_order) values (r_id, 'Rice & Biryani', 4) returning id into c_rice;
insert into menu_categories (restaurant_id, name, sort_order) values (r_id, 'Beverages', 5) returning id into c_drinks;

-- ---------- Add-on groups ----------
insert into addon_groups (restaurant_id, name, min_select, max_select)
values (r_id, 'Extras', 0, 4) returning id into g_extras;
insert into addons (group_id, name, price) values
  (g_extras, 'Extra gravy', 40),
  (g_extras, 'Extra cheese', 50),
  (g_extras, 'Butter topping', 30),
  (g_extras, 'Green salad', 45);

insert into addon_groups (restaurant_id, name, min_select, max_select)
values (r_id, 'Bread options', 0, 2) returning id into g_bread_addons;
insert into addons (group_id, name, price) values
  (g_bread_addons, 'Extra butter', 15),
  (g_bread_addons, 'Garlic topping', 25);

-- ---------- Starters ----------
insert into menu_items (restaurant_id, category_id, name, description, base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate, tags, sort_order)
values
 (r_id, c_starters, 'Paneer Tikka', 'Cottage cheese cubes marinated in yoghurt and spices, char-grilled in the tandoor', 240, 110, 'veg', 2, 18, 5, '{bestseller}', 1),
 (r_id, c_starters, 'Chicken Malai Tikka', 'Creamy, mildly spiced chicken thigh pieces finished with a hint of cardamom', 320, 160, 'non_veg', 1, 20, 5, '{chef_special}', 2),
 (r_id, c_starters, 'Hara Bhara Kebab', 'Spinach, peas and potato patties, pan-seared', 190, 70, 'veg', 1, 15, 5, '{jain}', 3),
 (r_id, c_starters, 'Tandoori Chicken', 'Half or full spring chicken, overnight marinade', 300, 150, 'non_veg', 2, 25, 5, '{bestseller}', 4),
 (r_id, c_starters, 'Crispy Chilli Baby Corn with Burnt Garlic', 'Long name on purpose — tests text wrapping in cards', 210, 80, 'veg', 3, 14, 5, '{}', 5);

-- Variants for Tandoori Chicken
select id into i_id from menu_items where restaurant_id = r_id and name = 'Tandoori Chicken';
insert into item_variants (item_id, name, price_delta, is_default, sort_order) values
  (i_id, 'Half', 0, true, 1),
  (i_id, 'Full', 260, false, 2);

-- Variants for Paneer Tikka
select id into i_id from menu_items where restaurant_id = r_id and name = 'Paneer Tikka';
insert into item_variants (item_id, name, price_delta, is_default, sort_order) values
  (i_id, 'Regular (6 pc)', 0, true, 1),
  (i_id, 'Large (10 pc)', 150, false, 2);

-- ---------- Main Course ----------
insert into menu_items (restaurant_id, category_id, name, description, base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate, tags, sort_order, is_available)
values
 (r_id, c_mains, 'Dal Makhani', 'Black lentils simmered overnight with butter and cream', 260, 90, 'veg', 1, 12, 5, '{bestseller}', 1, true),
 (r_id, c_mains, 'Shahi Paneer', 'Paneer in a rich cashew and tomato gravy', 290, 120, 'veg', 1, 15, 5, '{}', 2, true),
 (r_id, c_mains, 'Butter Chicken', 'The house classic, tomato-forward and lightly sweet', 380, 180, 'non_veg', 1, 18, 5, '{bestseller}', 3, true),
 (r_id, c_mains, 'Kadai Mutton', 'Slow-cooked mutton with bell pepper and crushed coriander', 460, 240, 'non_veg', 3, 30, 5, '{}', 4, false),
 (r_id, c_mains, 'Palak Paneer', 'Spinach gravy, soft paneer', 270, 100, 'veg', 1, 14, 5, '{jain}', 5, true),
 (r_id, c_mains, 'Egg Curry', 'Two boiled eggs in an onion-tomato masala', 220, 80, 'egg', 2, 12, 5, '{}', 6, true);

-- Attach the Extras add-on group to all main course items
insert into item_addon_groups (item_id, group_id)
select id, g_extras from menu_items where restaurant_id = r_id and category_id = c_mains;

-- ---------- Breads ----------
insert into menu_items (restaurant_id, category_id, name, description, base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate, sort_order)
values
 (r_id, c_breads, 'Tandoori Roti', 'Whole wheat, fresh from the tandoor', 30, 8, 'veg', 0, 6, 5, 1),
 (r_id, c_breads, 'Butter Naan', 'Refined flour naan brushed with butter', 60, 18, 'veg', 0, 7, 5, 2),
 (r_id, c_breads, 'Garlic Naan', 'Naan with garlic and coriander', 80, 24, 'veg', 0, 7, 5, 3),
 (r_id, c_breads, 'Laccha Paratha', 'Layered, flaky', 70, 22, 'veg', 0, 8, 5, 4);

insert into item_addon_groups (item_id, group_id)
select id, g_bread_addons from menu_items where restaurant_id = r_id and category_id = c_breads;

-- ---------- Rice & Biryani ----------
insert into menu_items (restaurant_id, category_id, name, description, base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate, sort_order)
values
 (r_id, c_rice, 'Jeera Rice', 'Basmati tempered with cumin', 180, 55, 'veg', 0, 10, 5, 1),
 (r_id, c_rice, 'Veg Biryani', 'Layered with fried onion and mint, served with raita', 280, 110, 'veg', 2, 22, 5, 2),
 (r_id, c_rice, 'Chicken Dum Biryani', 'Sealed-pot biryani with bone-in chicken', 380, 175, 'non_veg', 2, 28, 5, 3);

select id into i_id from menu_items where restaurant_id = r_id and name = 'Chicken Dum Biryani';
insert into item_variants (item_id, name, price_delta, is_default, sort_order) values
  (i_id, 'Single', 0, true, 1),
  (i_id, 'Family (serves 3-4)', 420, false, 2);

-- ---------- Beverages ----------
insert into menu_items (restaurant_id, category_id, name, description, base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate, sort_order)
values
 (r_id, c_drinks, 'Sweet Lassi', 'Thick, chilled, topped with malai', 90, 25, 'veg', 0, 5, 12, 1),
 (r_id, c_drinks, 'Masala Chaas', 'Spiced buttermilk with roasted cumin', 70, 18, 'veg', 1, 4, 12, 2),
 (r_id, c_drinks, 'Fresh Lime Soda', 'Sweet, salted or mixed', 80, 20, 'veg', 0, 3, 12, 3),
 (r_id, c_drinks, 'Masala Chai', 'Cutting chai, ginger and cardamom', 40, 10, 'veg', 0, 5, 12, 4);

-- Note: beverages carry 12% GST vs 5% on food, on purpose.
-- Your pricing function must apply tax PER ITEM, not one flat rate on the subtotal.

end $$;

-- Show the QR tokens so you can build test URLs
select t.label, t.qr_token, r.slug
  from restaurant_tables t
  join restaurants r on r.id = t.restaurant_id
 where r.slug = 'tandoori-hut'
 order by t.label;
