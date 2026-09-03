// Shared domain types. Mirrors docs/schema.sql.
// DB rows are snake_case; these are camelCase. Convert in src/lib/mappers.ts.

export type FoodType = 'veg' | 'non_veg' | 'egg';
export type StaffRole = 'owner' | 'manager' | 'kitchen' | 'waiter';
export type OrderType = 'dine_in' | 'takeaway' | 'pre_order';
export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'razorpay';
export type ServiceRequestType = 'waiter' | 'water' | 'bill';

/** Legal forward transitions. Used by the status API and the kitchen screen. */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  placed: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_FLOW[from].includes(to);
}

// ---------------------------------------------------------------- tenants

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  address: string | null;
  gstNumber: string | null;
  currency: string;
  timezone: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
};

export type RestaurantSettings = {
  restaurantId: string;
  acceptsCash: boolean;
  acceptsOnline: boolean;
  /** Percentage, e.g. 5 means 5%. */
  serviceChargePct: number;
  /** Flat amount added to takeaway orders. */
  packingCharge: number;
  openingHours: OpeningHours | null;
  orderNumberPrefix: string;
  autoAcceptOrders: boolean;
};

/** Keys are lowercase 3-letter day names. Values are [open, close] 24h pairs. */
export type OpeningHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string][]>
>;

// ---------------------------------------------------------------- staff

export type Staff = {
  id: string;
  restaurantId: string;
  authUserId: string | null;
  name: string;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
};

export type StaffSession = {
  staffId: string;
  restaurantId: string;
  role: StaffRole;
};

// ---------------------------------------------------------------- tables

export type RestaurantTable = {
  id: string;
  restaurantId: string;
  label: string;
  seats: number;
  qrToken: string;
  isActive: boolean;
};

export type TableSession = {
  id: string;
  restaurantId: string;
  tableId: string;
  joinCode: string | null;
  status: 'open' | 'billed' | 'closed';
  openedAt: string;
  closedAt: string | null;
};

// ---------------------------------------------------------------- menu

export type MenuCategory = {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  availableFrom: string | null;
  availableTo: string | null;
  /** 0 = Sunday .. 6 = Saturday. null means every day. */
  activeDays: number[] | null;
  isActive: boolean;
};

export type ItemVariant = {
  id: string;
  itemId: string;
  name: string;
  /** Added to basePrice. Can be negative. */
  priceDelta: number;
  isDefault: boolean;
  sortOrder: number;
};

export type Addon = {
  id: string;
  groupId: string;
  name: string;
  price: number;
};

export type AddonGroup = {
  id: string;
  restaurantId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: Addon[];
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  costPrice: number | null;
  foodType: FoodType;
  /** 0 = none, 3 = very hot. */
  spiceLevel: number;
  prepMinutes: number;
  /** GST percentage for this item. Food and beverages differ. */
  taxRate: number;
  kitchenStation: string;
  tags: string[];
  /** The out-of-stock toggle. False items are shown greyed out, not hidden. */
  isAvailable: boolean;
  sortOrder: number;
  isActive: boolean;
  variants: ItemVariant[];
  addonGroups: AddonGroup[];
};

export type MenuCategoryWithItems = MenuCategory & { items: MenuItem[] };

export type PublicMenu = {
  restaurant: Restaurant & { settings: RestaurantSettings };
  table: Pick<RestaurantTable, 'id' | 'label'> | null;
  categories: MenuCategoryWithItems[];
};

// ---------------------------------------------------------------- cart

/** A selected add-on, captured at the moment of selection. */
export type SelectedAddon = { id: string; name: string; price: number };

export type CartLine = {
  /** Stable identity: itemId + variantId + sorted addon ids + notes. */
  lineId: string;
  itemId: string;
  itemName: string;
  imageUrl: string | null;
  foodType: FoodType;
  basePrice: number;
  taxRate: number;
  prepMinutes: number;
  variantId: string | null;
  variantName: string | null;
  variantPriceDelta: number;
  addons: SelectedAddon[];
  quantity: number;
  notes: string | null;
};

export type CartState = {
  restaurantSlug: string | null;
  tableToken: string | null;
  idempotencyKey: string | null;
  lines: CartLine[];
  sessionId: string | null;
  joinCode: string | null;
  personName: string | null;
};

// ---------------------------------------------------------------- pricing

export type PriceBreakdown = {
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  packingCharge: number;
  discount: number;
  total: number;
  lines: PricedLine[];
};

export type PricedLine = {
  lineId: string;
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
  taxRate: number;
  lineTax: number;
  lineTotal: number;
};

// ---------------------------------------------------------------- orders

/** Snapshot line. Never join back to menu_items to price this. */
export type OrderItem = {
  id: string;
  orderId: string;
  itemId: string | null;
  itemName: string;
  imageUrl: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  addons: { name: string; price: number }[];
  taxRate: number;
  lineTotal: number;
  notes: string | null;
  kitchenStation: string;
  status: string;
  orderedBy: string | null;
};

export type Order = {
  id: string;
  restaurantId: string;
  tableId: string | null;
  sessionId: string | null;
  orderNumber: string;
  orderType: OrderType;
  customerName: string | null;
  customerPhone: string | null;
  status: OrderStatus;
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  packingCharge: number;
  discount: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paymentRef: string | null;
  notes: string | null;
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  tableLabel?: string | null;
  estimatedReadyAt?: string | null;
};

export type OrderEvent = {
  id: string;
  orderId: string;
  status: OrderStatus;
  staffId: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------- misc

export type ServiceRequest = {
  id: string;
  restaurantId: string;
  tableId: string;
  tableLabel?: string | null;
  type: ServiceRequestType;
  status: 'open' | 'resolved';
  createdAt: string;
};

export type GroupSession = {
  id: string;
  restaurantId: string;
  tableId: string;
  joinCode: string;
  status: 'open' | 'billed' | 'closed';
  openedAt: string;
};

export type Feedback = {
  id: string;
  restaurantId: string;
  orderId: string | null;
  rating: number;
  comment: string | null;
  isPublic: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------- api

export type ApiError = {
  error: { code: string; message: string };
};

export type CreateOrderRequest = {
  restaurantSlug: string;
  tableToken: string | null;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  notes?: string;
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  sessionId?: string | null;
  orderedBy?: string | null;
  items: {
    itemId: string;
    variantId: string | null;
    addonIds: string[];
    quantity: number;
    notes?: string;
  }[];
};
