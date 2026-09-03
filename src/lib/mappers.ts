/**
 * mappers.ts — one snake_case→camelCase mapper per entity.
 *
 * Rules:
 *  - Every Supabase row passes through one of these before leaving this file.
 *  - No component or route handler should ever read a snake_case property.
 *  - Input types live in src/types/db.ts; output types live in src/types/index.ts.
 */

import type {
  Addon,
  AddonGroup,
  FoodType,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Restaurant,
  RestaurantSettings,
  RestaurantTable,
  ServiceRequest,
  ServiceRequestType,
  Staff,
  StaffRole,
  TableSession,
} from "@/types";

import type {
  DbAddon,
  DbAddonGroup,
  DbMenuItem,
  DbMenuCategory,
  DbOrder,
  DbOrderItem,
  DbRestaurant,
  DbRestaurantSettings,
  DbRestaurantTable,
  DbStaff,
  DbTableSession,
} from "@/types/db";

// ---------------------------------------------------------------- tenants

export function toRestaurant(r: DbRestaurant): Restaurant {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url,
    coverUrl: r.cover_url,
    phone: r.phone,
    address: r.address,
    gstNumber: r.gst_number,
    currency: r.currency,
    timezone: r.timezone,
    plan: r.plan,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export function toRestaurantSettings(r: DbRestaurantSettings): RestaurantSettings {
  return {
    restaurantId: r.restaurant_id,
    acceptsCash: r.accepts_cash,
    acceptsOnline: r.accepts_online,
    serviceChargePct: Number(r.service_charge_pct),
    packingCharge: Number(r.packing_charge),
    openingHours: r.opening_hours as RestaurantSettings["openingHours"],
    orderNumberPrefix: r.order_number_prefix,
    autoAcceptOrders: r.auto_accept_orders,
  };
}

// ---------------------------------------------------------------- staff

export function toStaff(r: DbStaff): Staff {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    authUserId: r.auth_user_id,
    name: r.name,
    phone: r.phone,
    role: r.role as StaffRole,
    isActive: r.is_active,
  };
}

// ---------------------------------------------------------------- tables

export function toTable(r: DbRestaurantTable): RestaurantTable {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    label: r.label,
    seats: r.seats,
    qrToken: r.qr_token,
    isActive: r.is_active,
  };
}

export function toTableSession(r: DbTableSession): TableSession {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    tableId: r.table_id,
    joinCode: r.join_code,
    status: r.status as TableSession["status"],
    openedAt: r.opened_at,
    closedAt: r.closed_at,
  };
}

// ---------------------------------------------------------------- menu

export function toAddon(r: DbAddon): Addon {
  return {
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    price: Number(r.price),
  };
}

export function toAddonGroup(r: DbAddonGroup): AddonGroup {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    name: r.name,
    minSelect: r.min_select,
    maxSelect: r.max_select,
    addons: r.addons.map(toAddon),
  };
}

export function toMenuItem(r: DbMenuItem): MenuItem {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    imageUrl: r.image_url,
    basePrice: Number(r.base_price),
    costPrice: r.cost_price !== null ? Number(r.cost_price) : null,
    foodType: r.food_type as FoodType,
    spiceLevel: r.spice_level,
    prepMinutes: r.prep_minutes,
    taxRate: Number(r.tax_rate),
    kitchenStation: r.kitchen_station,
    tags: r.tags ?? [],
    isAvailable: r.is_available,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    variants: (r.item_variants ?? []).map((v) => ({
      id: v.id,
      itemId: v.item_id,
      name: v.name,
      priceDelta: Number(v.price_delta),
      isDefault: v.is_default,
      sortOrder: v.sort_order,
    })),
    addonGroups: (r.addon_groups ?? []).map(toAddonGroup),
  };
}

export function toMenuCategory(r: DbMenuCategory): MenuCategory {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    name: r.name,
    sortOrder: r.sort_order,
    availableFrom: r.available_from,
    availableTo: r.available_to,
    activeDays: r.active_days,
    isActive: r.is_active,
  };
}

export function toMenuCategoryWithItems(
  r: DbMenuCategory & { menu_items: DbMenuItem[] }
): MenuCategoryWithItems {
  return {
    ...toMenuCategory(r),
    items: (r.menu_items ?? []).map(toMenuItem),
  };
}

// ---------------------------------------------------------------- orders

export function toOrder(r: DbOrder): Order {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    tableId: r.table_id,
    sessionId: r.session_id,
    orderNumber: r.order_number,
    orderType: r.order_type as OrderType,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    status: r.status as OrderStatus,
    subtotal: Number(r.subtotal),
    taxTotal: Number(r.tax_total),
    serviceCharge: Number(r.service_charge),
    packingCharge: Number(r.packing_charge),
    discount: Number(r.discount),
    total: Number(r.total),
    paymentStatus: r.payment_status as PaymentStatus,
    paymentMethod: r.payment_method as PaymentMethod | null,
    paymentRef: r.payment_ref,
    notes: r.notes,
    placedAt: r.placed_at,
    acceptedAt: r.accepted_at,
    readyAt: r.ready_at,
    servedAt: r.served_at,
  };
}

export function toOrderItem(r: DbOrderItem): OrderItem {
  return {
    id: r.id,
    orderId: r.order_id,
    itemId: r.item_id,
    itemName: r.item_name,
    imageUrl: r.image_url,
    variantName: r.variant_name,
    unitPrice: Number(r.unit_price),
    quantity: r.quantity,
    addons: r.addons ?? [],
    taxRate: Number(r.tax_rate),
    lineTotal: Number(r.line_total),
    notes: r.notes,
    kitchenStation: r.kitchen_station,
    status: r.status,
    orderedBy: r.ordered_by,
  };
}

// ---------------------------------------------------------------- misc

export function toServiceRequest(r: {
  id: string;
  restaurant_id: string;
  table_id: string;
  type: string;
  status: string;
  created_at: string;
}): ServiceRequest {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    tableId: r.table_id,
    type: r.type as ServiceRequestType,
    status: r.status as ServiceRequest["status"],
    createdAt: r.created_at,
  };
}
