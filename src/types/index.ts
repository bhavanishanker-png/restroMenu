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

/**
 * A staff row as the Staff page shows it. Not a table: `loginEmail` lives in
 * Supabase Auth (auth.users), and `hasPin` only says whether `pin_hash` is set
 * — the hash itself never leaves the server.
 */
export type StaffMember = Staff & {
  loginEmail: string | null;
  hasPin: boolean;
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
  /** Name and description in other languages. Empty when none exist. */
  translations: MenuItemTranslation[];
};

/** Languages a dish can be translated into. Widen together with the DB check constraint. */
export type MenuLocale = 'hi';

export type MenuItemTranslation = {
  locale: MenuLocale;
  name: string;
  description: string | null;
  /** Who wrote it. AI text was approved by the owner before it was saved. */
  source: 'ai' | 'owner';
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

// ---------------------------------------------------------------- ai
// Not database rows: these are the shapes the AI routes return. Nothing here
// is persisted until a human approves it through the regular menu APIs.

/** Why an imported dish needs the owner's attention before it can be saved. */
export type DraftIssue =
  | 'missing_price'       // blocking: no price was readable
  | 'unknown_food_type'   // blocking: veg / non-veg / egg not certain
  | 'possible_duplicate'  // already on the menu (or twice in the upload)
  | 'size_options'        // menu shows sizes (Half/Full); add them as variants
  | 'ai_description';     // description written by AI, not read from the menu

export type DraftMenuItem = {
  name: string;
  description: string | null;
  descriptionSource: 'menu' | 'ai' | null;
  basePrice: number | null;
  foodType: FoodType | null;
  sizeOptionsText: string | null;
  duplicateOf: string | null;
  issues: DraftIssue[];
};

export type DraftMenuCategory = {
  name: string;
  /** Set when the category already exists, so the import files dishes under it instead of creating a twin. */
  existingCategoryId: string | null;
  items: DraftMenuItem[];
};

export type MenuDraft = {
  categories: DraftMenuCategory[];
  totalItems: number;
};

/** Why one uploaded page could not be read. The rest of the import continues. */
export type MenuImportFailureCode =
  | 'AI_DECLINED'
  | 'MENU_TOO_LONG'
  | 'PARSE_ERROR'
  | 'SCHEMA_ERROR'
  | 'NOT_A_MENU'
  | 'AI_BUSY'
  | 'AI_ERROR';

export type MenuImportPageFailure = {
  /** 1-based, as the owner counts pages. */
  page: number;
  code: MenuImportFailureCode;
  message: string;
};

/** A menu import paused at owner review (a LangGraph thread waiting on an interrupt). */
export type MenuImportPending = {
  threadId: string;
  draft: MenuDraft;
  pageCount: number;
  failedPages: MenuImportPageFailure[];
  createdAt: string;
};

/**
 * The owner's choice for one draft dish, sent on resume. Only selected dishes
 * are sent. `basePrice` / `foodType` fill in what the AI left blank; a value
 * the AI read from the menu is kept.
 */
export type MenuImportItemDecision = {
  categoryIndex: number;
  itemIndex: number;
  basePrice: number | null;
  foodType: FoodType | null;
};

/** A draft dish the owner approved and code validated: ready to save. */
export type ApprovedMenuItem = Omit<DraftMenuItem, 'basePrice' | 'foodType'> & {
  basePrice: number;
  foodType: FoodType;
};

export type ApprovedMenuCategory = Omit<DraftMenuCategory, 'items'> & {
  items: ApprovedMenuItem[];
};

// ---------------------------------------------------------------- AI dish writing (T34)

/**
 * Why a dish needs the owner's attention after the AI pass:
 * - health_claim: every attempt still made a diet/allergy/health claim, so
 *   the English description was dropped (never saved with the claim).
 * - ai_failed: the AI call failed for this dish; nothing was written.
 */
export type DishWritingFlag = 'health_claim' | 'ai_failed';

/** One dish after the AI pass, waiting for owner review. */
export type DishWritingResult = {
  itemId: string;
  name: string;
  category: string;
  /** What the dish has today. AI writes an English description only when this is empty. */
  currentDescription: string | null;
  /** Suggested English description; null when the dish already has one, or none passed the checks. */
  descriptionEn: string | null;
  nameHi: string | null;
  descriptionHi: string | null;
  /** AI calls used (1 = passed first time; more = rewritten after a guardrail failed). */
  attempts: number;
  flags: DishWritingFlag[];
};

/** A dish-writing run paused at owner review (a LangGraph thread waiting on an interrupt). */
export type MenuWritingPending = {
  threadId: string;
  dishes: DishWritingResult[];
  createdAt: string;
};

/** The owner's final text for one dish, sent on resume. Only dishes to save are sent. */
export type DishWritingDecision = {
  itemId: string;
  /** English description to save; null keeps the dish's current one. */
  descriptionEn: string | null;
  nameHi: string;
  descriptionHi: string | null;
};

/** A dish's text after code validation: ready to save. */
export type ApprovedDishText = DishWritingDecision & {
  /** 'owner' when the owner changed the AI's Hindi text before approving. */
  hiSource: 'ai' | 'owner';
};

export type AssistantChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantSuggestion = {
  itemId: string;
  reason: string;
};

export type AssistantReply = {
  reply: string;
  suggestions: AssistantSuggestion[];
};
