import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import type { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { format, getDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { createServerClient } from "@/lib/supabase/server";
import { toAddonGroup, toMenuItemTranslation, toRestaurant, toRestaurantSettings } from "@/lib/mappers";
import type {
  MenuCategory,
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
  menu_item_translations?: { locale: string; name: string; description: string | null; source: string }[];
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
    translations: (raw.menu_item_translations ?? []).flatMap(toMenuItemTranslation),
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
  cat: Pick<MenuCategory, "activeDays" | "availableFrom" | "availableTo">,
  timezone: string,
  now: Date
): boolean {
  const zonedNow = toZonedTime(now, timezone);
  if (cat.activeDays && cat.activeDays.length > 0) {
    if (!cat.activeDays.includes(getDay(zonedNow))) return false;
  }
  if (cat.availableFrom && cat.availableTo) {
    const currentTime = format(zonedNow, "HH:mm");
    if (currentTime < cat.availableFrom || currentTime >= cat.availableTo) return false;
  }
  return true;
}

// ---------------------------------------------------------------- public menu cache
//
// Every QR scan, cart, checkout and AI chat message reads the full menu, and
// the menu rarely changes, so it is cached in the Next.js Data Cache.
//
//  - Cached: restaurant + settings + categories/items for one restaurant.
//  - NOT cached: the table QR token check, and the breakfast/lunch time-window
//    filter — both run on every request.
//  - Never used for money: POST /api/orders reprices from menu_items directly.
//
// Freshness: every route that writes menu data calls revalidatePublicMenu()
// (or is wrapped in invalidatesPublicMenu()), so owner edits show up on the
// next request. MENU_CACHE_SECONDS only bounds staleness for edits made
// outside the app, e.g. directly in the Supabase dashboard.
//
// Errors are thrown inside the cached loaders, so a failed read is never
// cached — only a successful result or a genuine "not found".

const MENU_CACHE_SECONDS = 60;
/** Part of the cache key; see getMenuData. v2: items carry `translations` (T34). */
const MENU_CACHE_VERSION = "public-menu:v2";
const RESTAURANT_SLUGS_TAG = "restaurant-slugs";

export function menuCacheTag(restaurantId: string): string {
  return `menu:${restaurantId}`;
}

/** Call after any write to a restaurant's menu, settings or profile. */
export function revalidatePublicMenu(restaurantId: string): void {
  revalidateTag(menuCacheTag(restaurantId));
}

/**
 * Wraps a staff route handler that writes menu data. After the handler
 * finishes — success, error response or throw — the signed-in staff member's
 * menu cache is cleared. Clearing on failure too is deliberate: a multi-step
 * write (item, then variants, then add-ons) can fail halfway, and the cache
 * must then show what is actually in the database.
 */
export function invalidatesPublicMenu<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } finally {
      // Unauthenticated requests get no session, wrote nothing, and clear nothing.
      const session = await getStaffSession().catch((err: unknown) => {
        console.error("[invalidatesPublicMenu] session lookup failed; menu cache not cleared", err);
        return null;
      });
      if (session) revalidatePublicMenu(session.restaurantId);
    }
  };
}

/** Call after a restaurant is created, renamed (slug) or (de)activated. */
export function revalidateRestaurantSlugs(): void {
  revalidateTag(RESTAURANT_SLUGS_TAG);
}

type CachedMenuData = {
  restaurant: Restaurant;
  settings: RestaurantSettings;
  /** All active categories; the time-window filter is applied per request. */
  categories: MenuCategoryWithItems[];
};

async function loadRestaurantIdBySlug(slug: string): Promise<{ restaurantId: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`restaurant lookup failed: ${error.message}`);
  // Wrapped in an object: the Data Cache does not store a bare null.
  return { restaurantId: data ? (data.id as string) : null };
}

async function loadMenuData(restaurantId: string): Promise<CachedMenuData | null> {
  const supabase = createServerClient();

  const [restaurantResult, menuResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("*, restaurant_settings(*)")
      .eq("id", restaurantId)
      .eq("is_active", true)
      .maybeSingle(),
    // Full menu — one nested query
    supabase
      .from("menu_categories")
      .select(
        `
      id, restaurant_id, name, sort_order, available_from, available_to, active_days, is_active, created_at,
      menu_items(
        id, restaurant_id, category_id, name, description, image_url,
        base_price, cost_price, food_type, spice_level, prep_minutes, tax_rate,
        kitchen_station, tags, is_available, sort_order, is_active,
        item_variants(id, item_id, name, price_delta, is_default, sort_order),
        menu_item_translations(locale, name, description, source),
        item_addon_groups(
          addon_groups(
            id, restaurant_id, name, min_select, max_select,
            addons(id, group_id, name, price)
          )
        )
      )
    `
      )
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (restaurantResult.error) {
    throw new Error(`restaurant load failed: ${restaurantResult.error.message}`);
  }
  if (menuResult.error) {
    throw new Error(`menu load failed: ${menuResult.error.message}`);
  }

  const rawRestaurant = restaurantResult.data;
  if (!rawRestaurant) return null;

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

  return {
    restaurant,
    settings,
    categories: ((menuResult.data ?? []) as RawCategory[]).map(mapCategory),
  };
}

/*
 * Two layers:
 *  - unstable_cache (Data Cache): shared across requests and customers.
 *  - React cache(): within one render, generateMetadata and the page share a
 *    single load instead of each calling the loaders.
 * The unstable_cache wrapper is built per call so its tag can carry the id.
 */
const getRestaurantIdBySlug = cache((slug: string) =>
  unstable_cache(() => loadRestaurantIdBySlug(slug), ["public-menu-slug", slug], {
    revalidate: MENU_CACHE_SECONDS,
    tags: [RESTAURANT_SLUGS_TAG],
  })()
);

const getMenuData = cache((restaurantId: string) =>
  // Bump the version when CachedMenuData changes shape: Next's Data Cache
  // outlives deploys, and an entry written by older code (e.g. before
  // `translations` existed) would otherwise be served to new code.
  unstable_cache(() => loadMenuData(restaurantId), [MENU_CACHE_VERSION, restaurantId], {
    revalidate: MENU_CACHE_SECONDS,
    tags: [menuCacheTag(restaurantId)],
  })()
);

// ---------------------------------------------------------------- public API

export type FetchMenuResult =
  | { ok: true; menu: PublicMenu }
  | { ok: false; code: "RESTAURANT_NOT_FOUND" | "TABLE_NOT_FOUND" | "MENU_ERROR" };

/** Not cached: a deactivated table must stop working on the next scan. */
async function resolveTable(
  restaurantId: string,
  tableToken: string
): Promise<PublicMenu["table"] | "not_found" | "error"> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("id, label")
    .eq("qr_token", tableToken)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[fetchPublicMenu] table lookup", error);
    return "error";
  }
  return data ? { id: data.id as string, label: data.label as string } : "not_found";
}

export async function fetchPublicMenu(
  slug: string,
  tableToken: string | null
): Promise<FetchMenuResult> {
  let restaurantId: string | null;
  try {
    ({ restaurantId } = await getRestaurantIdBySlug(slug));
  } catch (err) {
    console.error("[fetchPublicMenu] restaurant lookup", err);
    return { ok: false, code: "MENU_ERROR" };
  }
  if (!restaurantId) return { ok: false, code: "RESTAURANT_NOT_FOUND" };

  // The table check and the (usually cached) menu load are independent.
  const [tableResult, menuResult] = await Promise.all([
    tableToken ? resolveTable(restaurantId, tableToken) : Promise.resolve(null),
    getMenuData(restaurantId).then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({ ok: false as const, err })
    ),
  ]);

  if (!menuResult.ok) {
    console.error("[fetchPublicMenu] menu load", menuResult.err);
    return { ok: false, code: "MENU_ERROR" };
  }
  if (!menuResult.data) return { ok: false, code: "RESTAURANT_NOT_FOUND" };
  if (tableResult === "error") return { ok: false, code: "MENU_ERROR" };
  if (tableResult === "not_found") return { ok: false, code: "TABLE_NOT_FOUND" };

  const { restaurant, settings, categories: allCategories } = menuResult.data;

  // Time windows depend on the current time, so they are applied after the cache.
  const now = new Date();
  const categories = allCategories.filter((cat) =>
    isCategoryAvailableNow(cat, restaurant.timezone, now)
  );

  return {
    ok: true,
    menu: { restaurant: { ...restaurant, settings }, table: tableResult, categories },
  };
}

// ---------------------------------------------------------------- admin helpers

/**
 * Whether a category is an active one owned by this restaurant. Item writes
 * call this before setting category_id, so an item can never be filed under
 * another restaurant's category.
 */
export async function categoryBelongsTo(
  categoryId: string,
  restaurantId: string
): Promise<"ok" | "missing" | "error"> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[categoryBelongsTo]", error);
    return "error";
  }
  return data ? "ok" : "missing";
}

/** Names already on a restaurant's menu, for reconciling an AI import against. */
export type MenuCatalog = {
  categories: { id: string; name: string }[];
  items: { id: string; name: string; categoryId: string | null }[];
};

export async function fetchMenuCatalog(restaurantId: string): Promise<MenuCatalog | null> {
  const supabase = createServerClient();

  const [catResult, itemResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),
    supabase
      .from("menu_items")
      .select("id, name, category_id")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),
  ]);

  if (catResult.error || itemResult.error) {
    console.error("[fetchMenuCatalog]", catResult.error ?? itemResult.error);
    return null;
  }

  return {
    categories: (catResult.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    items: (itemResult.data ?? []).map((i) => ({
      id: i.id as string,
      name: i.name as string,
      categoryId: (i.category_id as string | null) ?? null,
    })),
  };
}
