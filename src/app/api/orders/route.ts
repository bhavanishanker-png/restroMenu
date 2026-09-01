import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { priceCart, buildLineId } from "@/lib/pricing";
import { toOrder, toRestaurantSettings } from "@/lib/mappers";
import { getStaffSession, requireRole } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import type { CartLine, FoodType, OrderStatus } from "@/types";
import type { DbOrder, DbRestaurantSettings } from "@/types/db";

// ---------------------------------------------------------------- GET /api/orders  (staff only)

const VALID_STATUSES = new Set<string>([
  "placed", "accepted", "preparing", "ready", "served", "cancelled",
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const sp = req.nextUrl.searchParams;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateFrom = sp.get("dateFrom") ?? today.toISOString();
  const dateTo = sp.get("dateTo");
  const statusParam = sp.get("status") ?? "all";
  const search = sp.get("search") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 50)));

  const supabase = createServerClient();

  let query = supabase
    .from("orders")
    .select("*, restaurant_tables(label)", { count: "exact" })
    .eq("restaurant_id", session!.restaurantId)
    .order("placed_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (dateFrom) query = query.gte("placed_at", dateFrom);
  if (dateTo) query = query.lte("placed_at", dateTo);
  if (statusParam !== "all" && VALID_STATUSES.has(statusParam)) {
    query = query.eq("status", statusParam as OrderStatus);
  }
  if (search.trim()) {
    query = query.or(
      `order_number.ilike.%${search.trim()}%,customer_phone.ilike.%${search.trim()}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[orders GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load orders." } },
      { status: 500 }
    );
  }

  const orders = (data ?? []).map((row) => ({
    ...toOrder(row as DbOrder),
    tableLabel:
      (row as { restaurant_tables: { label: string } | null })
        .restaurant_tables?.label ?? null,
  }));

  return NextResponse.json({ orders, total: count ?? 0, page, limit });
}

// ---------------------------------------------------------------- zod schema
// IMPORTANT: `total` and any per-line prices are intentionally absent.
// The server computes every amount from database prices — the client value
// is always ignored.

const orderItemSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  // Deduplicate addon IDs to prevent double-pricing via malformed requests.
  addonIds: z
    .array(z.string().uuid())
    .transform((ids) => Array.from(new Set(ids))),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(50, "Quantity cannot exceed 50"),
  notes: z.string().max(500).optional(),
});

const createOrderSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableToken: z.string().nullable().optional(),
  orderType: z.enum(["dine_in", "takeaway", "pre_order"]),
  customerName: z.string().min(1, "Name is required").max(100),
  customerPhone: z.string().regex(/^\d{10}$/, "Invalid phone number"),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
  paymentMethod: z.enum(["cash", "razorpay"]),
  // Group ordering fields (optional — absent for solo orders)
  sessionId: z.string().uuid().nullable().optional(),
  orderedBy: z.string().max(100).nullable().optional(),
  items: z.array(orderItemSchema).min(1, "Order must contain at least one item"),
});

// ---------------------------------------------------------------- DB row types for this route

type DbItemRow = {
  id: string;
  name: string;
  base_price: number;
  tax_rate: number;
  kitchen_station: string;
  is_available: boolean;
  food_type: string;
  prep_minutes: number;
  item_variants: {
    id: string;
    name: string;
    price_delta: number;
    is_default: boolean;
  }[];
  item_addon_groups: {
    addon_groups:
      | { id: string; addons: { id: string; name: string; price: number }[] }
      | { id: string; addons: { id: string; name: string; price: number }[] }[]
      | null;
  }[];
};

// ---------------------------------------------------------------- helpers

function getAddonMap(dbItem: DbItemRow): Map<string, { id: string; name: string; price: number }> {
  const map = new Map<string, { id: string; name: string; price: number }>();
  for (const jt of dbItem.item_addon_groups) {
    const raw = jt.addon_groups;
    if (!raw) continue;
    const groups = Array.isArray(raw) ? raw : [raw];
    for (const group of groups) {
      for (const addon of group.addons) {
        map.set(addon.id, { id: addon.id, name: addon.name, price: Number(addon.price) });
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------- POST /api/orders

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Step 1: Rate limit — 20 requests per IP per minute.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`orders:${ip}`, 20, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." } },
      { status: 429 }
    );
  }

  // Step 1: Parse and validate request body.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const supabase = createServerClient();

  // Step 2: Resolve restaurant from slug; 404 if inactive.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, is_active, restaurant_settings(*)")
    .eq("slug", body.restaurantSlug)
    .single();

  if (!restaurant || !restaurant.is_active) {
    return NextResponse.json(
      { error: { code: "RESTAURANT_NOT_FOUND", message: "Restaurant not found." } },
      { status: 404 }
    );
  }

  const restaurantId: string = restaurant.id;
  const settingsRaw = Array.isArray(restaurant.restaurant_settings)
    ? restaurant.restaurant_settings[0]
    : restaurant.restaurant_settings;

  if (!settingsRaw) {
    return NextResponse.json(
      { error: { code: "SETTINGS_MISSING", message: "Restaurant configuration is incomplete." } },
      { status: 500 }
    );
  }

  // Step 3: Resolve table from token; 400 if it doesn't belong to this restaurant.
  let tableId: string | null = null;
  if (body.tableToken) {
    const { data: table } = await supabase
      .from("restaurant_tables")
      .select("id")
      .eq("qr_token", body.tableToken)
      .eq("restaurant_id", restaurantId)
      .single();

    if (!table) {
      return NextResponse.json(
        { error: { code: "TABLE_NOT_FOUND", message: "Table not found or does not belong to this restaurant." } },
        { status: 400 }
      );
    }
    tableId = table.id;
  }

  // Step 4: Idempotency check — return existing order if key was already used.
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("*")
    .eq("idempotency_key", body.idempotencyKey)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (existingOrder) {
    return NextResponse.json({ order: toOrder(existingOrder as DbOrder) }, { status: 200 });
  }

  // Step 5: Fetch all referenced items (one query, not N+1).
  // MUST filter by restaurant_id — an item from another restaurant must never
  // be accepted even if its UUID is known.
  const allItemIds = Array.from(new Set(body.items.map((i) => i.itemId)));

  const { data: dbItemsRaw, error: itemsError } = await supabase
    .from("menu_items")
    .select(
      `id, name, base_price, tax_rate, kitchen_station, is_available, food_type, prep_minutes,
       item_variants(id, name, price_delta, is_default),
       item_addon_groups(
         addon_groups(id, addons(id, name, price))
       )`
    )
    .in("id", allItemIds)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);

  if (itemsError) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load menu items." } },
      { status: 500 }
    );
  }

  const dbItems = (dbItemsRaw ?? []) as DbItemRow[];
  const dbItemsMap = new Map<string, DbItemRow>(dbItems.map((item) => [item.id, item]));

  // Validate each requested item:
  //  - must exist in this restaurant (if not in map, it's from another tenant or nonexistent)
  //  - must be available
  //  - variant must belong to this item
  //  - every addon must belong to this item
  for (const reqItem of body.items) {
    const dbItem = dbItemsMap.get(reqItem.itemId);
    if (!dbItem) {
      return NextResponse.json(
        {
          error: {
            code: "ITEM_NOT_FOUND",
            message: `Menu item not found: ${reqItem.itemId}`,
          },
        },
        { status: 400 }
      );
    }

    if (!dbItem.is_available) {
      return NextResponse.json(
        {
          error: {
            code: "ITEM_UNAVAILABLE",
            message: `${dbItem.name} is currently unavailable.`,
          },
        },
        { status: 400 }
      );
    }

    if (reqItem.variantId) {
      const variantExists = dbItem.item_variants.some((v) => v.id === reqItem.variantId);
      if (!variantExists) {
        return NextResponse.json(
          {
            error: {
              code: "VARIANT_NOT_FOUND",
              message: `Variant not found for item: ${dbItem.name}`,
            },
          },
          { status: 400 }
        );
      }
    }

    if (reqItem.addonIds.length > 0) {
      const addonMap = getAddonMap(dbItem);
      for (const addonId of reqItem.addonIds) {
        if (!addonMap.has(addonId)) {
          return NextResponse.json(
            {
              error: {
                code: "ADDON_NOT_FOUND",
                message: `Add-on not found for item: ${dbItem.name}`,
              },
            },
            { status: 400 }
          );
        }
      }
    }
  }

  // Step 6: Build CartLines from DB prices (completely ignoring any client prices).
  const cartLines: CartLine[] = body.items.map((reqItem) => {
    const dbItem = dbItemsMap.get(reqItem.itemId)!;

    const variant = reqItem.variantId
      ? (dbItem.item_variants.find((v) => v.id === reqItem.variantId) ?? null)
      : null;

    const addonMap = getAddonMap(dbItem);
    const selectedAddons = reqItem.addonIds.map((id) => addonMap.get(id)!);

    return {
      lineId: buildLineId(
        reqItem.itemId,
        reqItem.variantId ?? null,
        reqItem.addonIds,
        reqItem.notes ?? null
      ),
      itemId: dbItem.id,
      itemName: dbItem.name,
      imageUrl: null,
      foodType: dbItem.food_type as FoodType,
      basePrice: Number(dbItem.base_price),
      taxRate: Number(dbItem.tax_rate),
      prepMinutes: dbItem.prep_minutes,
      variantId: reqItem.variantId ?? null,
      variantName: variant?.name ?? null,
      variantPriceDelta: Number(variant?.price_delta ?? 0),
      addons: selectedAddons,
      quantity: reqItem.quantity,
      notes: reqItem.notes ?? null,
    };
  });

  const settings = toRestaurantSettings(settingsRaw as DbRestaurantSettings);
  const bill = priceCart(cartLines, { orderType: body.orderType, settings });

  // Build order_items payload: each row is a snapshot.  unit_price comes from
  // bill.lines (server-computed), never from the client request.
  const itemsPayload = cartLines.map((line, i) => {
    const pricedLine = bill.lines[i];
    const dbItem = dbItemsMap.get(line.itemId)!;

    return {
      item_id: line.itemId,
      item_name: line.itemName,          // SNAPSHOT
      variant_name: line.variantName,    // SNAPSHOT
      unit_price: pricedLine.unitPrice,  // SNAPSHOT — server-computed
      quantity: line.quantity,
      addons: line.addons.map((a) => ({ name: a.name, price: a.price })),  // SNAPSHOT
      tax_rate: line.taxRate,            // SNAPSHOT
      line_total: pricedLine.lineTotal,  // SNAPSHOT — server-computed
      notes: line.notes,
      kitchen_station: dbItem.kitchen_station,
    };
  });

  // If a sessionId is provided, verify it belongs to this restaurant and is open.
  let resolvedSessionId: string | null = null;
  if (body.sessionId) {
    const { data: session } = await supabase
      .from("table_sessions")
      .select("id")
      .eq("id", body.sessionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "open")
      .single();

    if (!session) {
      return NextResponse.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Group session not found or has ended." } },
        { status: 400 }
      );
    }
    resolvedSessionId = session.id;
  }

  // Tag each item with ordered_by if this is a group order
  const orderedBy = body.orderedBy?.trim() || null;
  const itemsPayloadWithOwner = itemsPayload.map((item) => ({
    ...item,
    ordered_by: orderedBy,
  }));

  // Steps 7–8: call the atomic Postgres function (orders + order_items + order_events
  // in one transaction — a partial order can never exist).
  const { data: rpcResult, error: rpcError } = await supabase.rpc("create_order", {
    p_data: {
      restaurant_id:  restaurantId,
      table_id:       tableId ?? "",
      session_id:     resolvedSessionId ?? "",
      order_type:     body.orderType,
      customer_name:  body.customerName,
      customer_phone: body.customerPhone,
      notes:          body.notes ?? "",
      idempotency_key: body.idempotencyKey,
      payment_method: body.paymentMethod,
      subtotal:       bill.subtotal,
      tax_total:      bill.taxTotal,
      service_charge: bill.serviceCharge,
      packing_charge: bill.packingCharge,
      discount:       bill.discount,
      total:          bill.total,
      items:          itemsPayloadWithOwner,
    },
  });

  if (rpcError) {
    // Postgres unique-constraint violation: a concurrent request beat us to it.
    // Fetch and return the existing order instead of failing.
    if (rpcError.code === "23505") {
      const { data: racedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("idempotency_key", body.idempotencyKey)
        .eq("restaurant_id", restaurantId)
        .single();

      if (racedOrder) {
        return NextResponse.json({ order: toOrder(racedOrder as DbOrder) }, { status: 200 });
      }
    }

    console.error("create_order RPC error:", rpcError);
    return NextResponse.json(
      { error: { code: "CREATE_FAILED", message: "Failed to place order. Please try again." } },
      { status: 500 }
    );
  }

  const result = rpcResult as { order_id: string; order_number: string };

  // Fetch the created order to return to the client.
  const { data: createdOrder } = await supabase
    .from("orders")
    .select("*")
    .eq("id", result.order_id)
    .single();

  if (!createdOrder) {
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: "Order was placed but could not be retrieved." } },
      { status: 500 }
    );
  }

  // Step 9: If paymentMethod = 'razorpay', create a Razorpay order and return its details.
  // The checkout form uses these to open the Razorpay modal without a second round-trip.
  let razorpayPayload: { orderId: string; amount: number; keyId: string } | null = null;
  if (body.paymentMethod === "razorpay") {
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const rzpOrder = await rzp.orders.create({
      amount: Math.round(bill.total * 100), // paise
      currency: "INR",
      receipt: result.order_id.slice(0, 40),
    });

    // Store Razorpay order ID in payment_ref so the webhook can look up this order.
    await supabase
      .from("orders")
      .update({ payment_ref: rzpOrder.id })
      .eq("id", result.order_id);

    razorpayPayload = {
      orderId: rzpOrder.id,
      amount: Number(rzpOrder.amount),
      keyId: process.env.RAZORPAY_KEY_ID!,
    };
  }

  const response: Record<string, unknown> = { order: toOrder(createdOrder as DbOrder) };
  if (razorpayPayload) response.razorpay = razorpayPayload;

  return NextResponse.json(response, { status: 201 });
}
