/**
 * Raw snake_case row shapes returned by Supabase queries.
 * Used exclusively in mappers.ts — never leak these into components.
 */

export type DbRestaurant = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  currency: string;
  timezone: string;
  plan: string;
  is_active: boolean;
  created_at: string;
};

export type DbRestaurantSettings = {
  restaurant_id: string;
  accepts_cash: boolean;
  accepts_online: boolean;
  service_charge_pct: number;
  packing_charge: number;
  opening_hours: Record<string, string[][]> | null;
  order_number_prefix: string;
  auto_accept_orders: boolean;
};

export type DbStaff = {
  id: string;
  restaurant_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string | null;
  role: string;
  pin_hash: string | null;
  is_active: boolean;
  created_at: string;
};

export type DbRestaurantTable = {
  id: string;
  restaurant_id: string;
  label: string;
  seats: number;
  qr_token: string;
  is_active: boolean;
  created_at: string;
};

export type DbTableSession = {
  id: string;
  restaurant_id: string;
  table_id: string;
  join_code: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

export type DbMenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  available_from: string | null;
  available_to: string | null;
  active_days: number[] | null;
  is_active: boolean;
  created_at: string;
};

export type DbItemVariant = {
  id: string;
  item_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
};

export type DbAddon = {
  id: string;
  group_id: string;
  name: string;
  price: number;
};

export type DbAddonGroup = {
  id: string;
  restaurant_id: string;
  name: string;
  min_select: number;
  max_select: number;
  addons: DbAddon[];
};

export type DbMenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  cost_price: number | null;
  food_type: string;
  spice_level: number;
  prep_minutes: number;
  tax_rate: number;
  kitchen_station: string;
  tags: string[];
  is_available: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  item_variants: DbItemVariant[];
  // Rows of the item_addon_groups join table, aliased to `addon_groups` by the
  // select in /api/menu/items. Each element wraps the group — it is NOT a
  // DbAddonGroup itself. PostgREST returns the embedded to-one as an object,
  // but has historically returned an array, so both are accepted.
  addon_groups: DbItemAddonGroupJoin[];
};

export type DbItemAddonGroupJoin = {
  group_id: string;
  addon_groups: DbAddonGroup | DbAddonGroup[] | null;
};

export type DbOrder = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  session_id: string | null;
  order_number: string;
  order_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  subtotal: number;
  tax_total: number;
  service_charge: number;
  packing_charge: number;
  discount: number;
  total: number;
  payment_status: string;
  payment_method: string | null;
  payment_ref: string | null;
  notes: string | null;
  idempotency_key: string;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  served_at: string | null;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  item_id: string | null;
  item_name: string;
  image_url: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  addons: { name: string; price: number }[];
  tax_rate: number;
  line_total: number;
  notes: string | null;
  kitchen_station: string;
  status: string;
  ordered_by: string | null;
};
