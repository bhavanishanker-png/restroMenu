import { format, getDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { createServerClient } from "@/lib/supabase/server";
import { toAddonGroup, toRestaurant, toRestaurantSettings } from "@/lib/mappers";
import type {
  MenuCategoryWithItems,
  MenuItem,
  PublicMenu,
  Restaurant,
  RestaurantSettings,
} from "@/types";
import type { DbAddonGroup, DbItemVariant, DbMenuCategory, DbRestaurantSettings } from "@/types/db";

// ---------------------------------------------------------------- raw shapes

type RawAddonGroup = Omit<DbAddonGroup, "addons"> & {
  addons: { id: string; group_id: string; name: string; price: number }[];
};

type RawItemAddonGroup = {
  addon_groups: RawAddonGroup | RawAddonGroup[] | null;
};

type RawMenuItem = {
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
  item_variants: DbItemVariant[];
  item_addon_groups: RawItemAddonGroup[];
};

type RawCategory = DbMenuCategory & { menu_items: RawMenuItem[] };

// ---------------------------------------------------------------- mappers

function mapMenuItem(raw: RawMenuItem): MenuItem {
  return {
    id: raw.id,
    restaurantId: raw.restaurant_id,
    categoryId: raw.category_id,
    name: raw.name,
    description: raw.description,
    imageUrl: raw.image_url,
    basePrice: Number(raw.base_price),
    costPrice: raw.cost_price !== null ? Number(raw.cost_price) : null,
    foodType: raw.food_type as MenuItem["foodType"],
    spiceLevel: raw.spice_level,
    prepMinutes: raw.prep_minutes,
    taxRate: Number(raw.tax_rate),
    kitchenStation: raw.kitchen_station,
    tags: raw.tags ?? [],
    isAvailable: raw.is_available,
    sortOrder: raw.sort_order,
    isActive: raw.is_active,
    variants: (raw.item_variants ?? []).map((v) => ({
      id: v.id,
      itemId: v.item_id,
      name: v.name,
      priceDelta: Number(v.price_delta),
      isDefault: v.is_default,
      sortOrder: v.sort_order,
    })),
    addonGroups: (raw.item_addon_groups ?? [])
      .flatMap((jt) => {
        if (!jt.addon_groups) return [];
        return Array.isArray(jt.addon_groups) ? jt.addon_groups : [jt.addon_groups];
      })
      .map((g) => toAddonGroup(g as DbAddonGroup)),
  };
}

function mapCategory(raw: RawCategory): MenuCategoryWithItems {
  return {
    id: raw.id,
    restaurantId: raw.restaurant_id,
    name: raw.name,
    sortOrder: raw.sort_order,
    availableFrom: raw.available_from,
    availableTo: raw.available_to,
    activeDays: raw.active_days,
    isActive: raw.is_active,
    items: (raw.menu_items ?? [])
      .filter((item) => item.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapMenuItem),
  };
}

function isCategoryAvailableNow(
  cat: DbMenuCategory,
  timezone: string,
  now: Date
): boolean {
  const zonedNow = toZonedTime(now, timezone);
  if (cat.active_days && cat.active_days.length > 0) {
    if (!cat.active_days.includes(getDay(zonedNow))) return false;
  }
  if (cat.available_from && cat.available_to) {
    const currentTime = format(zonedNow, "HH:mm");
    if (currentTime < cat.available_from || currentTime >= cat.available_to) return false;
  }
  return true;
}

// ---------------------------------------------------------------- public API

export type FetchMenuResult =
  | { ok: true; menu: PublicMenu }
  | { ok: false; code: "RESTAURANT_NOT_FOUND" | "TABLE_NOT_FOUND" | "MENU_ERROR" };

export async function fetchPublicMenu(
  slug: string,
  tableToken: string | null
): Promise<FetchMenuResult> {
  const supabase = createServerClient();

  const { data: rawRestaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("*, restaurant_settings(*)")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (restaurantError || !rawRestaurant) {
    return { ok: false, code: "RESTAURANT_NOT_FOUND" };
  }

  const restaurant: Restaurant = toRestaurant(rawRestaurant);

  const settingsRow = Array.isArray(rawRestaurant.restaurant_settings)
    ? rawRestaurant.restaurant_settings[0]
    : rawRestaurant.restaurant_settings;

  const settings: RestaurantSettings = settingsRow
    ? toRestaurantSettings(settingsRow as DbRestaurantSettings)
    : {
        restaurantId: restaurant.id,
        acceptsCash: true,
        acceptsOnline: true,
        serviceChargePct: 0,
        packingCharge: 0,
        openingHours: null,
        orderNumberPrefix: "ORD",
        autoAcceptOrders: false,
      };

  // Optionally resolve table
  let table: PublicMenu["table"] = null;
  if (tableToken) {
    const { data: rawTable } = await supabase
      .from("restaurant_tables")
      .select("id, label")
      .eq("qr_token", tableToken)
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .single();

    if (!rawTable) {
      return { ok: false, code: "TABLE_NOT_FOUND" };
    }
    table = { id: rawTable.id, label: rawTable.label };
  }

  // Full menu — one nested query
  const { data: rawCategories, error: menuError } = await supabase
    .from("menu_categories")
    .select(
      `
      id, restaurant_id, name, sort_order, available_from, available_to, active_days, is_active, created_at,
      menu_items(
        id, restaurant_id, category_id, name, description, image_url,
        base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate,
        kitchen_station, tags, is_available, sort_order, is_active,
        item_variants(id, item_id, name, price_delta, is_default, sort_order),
        item_addon_groups(
          addon_groups(
            id, restaurant_id, name, min_select, max_select,
            addons(id, group_id, name, price)
          )
        )
      )
    `
    )
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("sort_order");

  if (menuError) {
    console.error("[fetchPublicMenu]", menuError);
    return { ok: false, code: "MENU_ERROR" };
  }

  const now = new Date();
  const categories: MenuCategoryWithItems[] = (rawCategories as RawCategory[])
    .filter((cat) => isCategoryAvailableNow(cat, restaurant.timezone, now))
    .map(mapCategory);

  return {
    ok: true,
    menu: { restaurant: { ...restaurant, settings }, table, categories },
  };
}
