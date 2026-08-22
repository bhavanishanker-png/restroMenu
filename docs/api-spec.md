# API Specification

All routes live under `src/app/api/`. Every request body is validated with zod
before use. Every error response is `{ error: { code, message } }`.

**Auth levels**
- `public` — no auth, anon Supabase key
- `staff` — Supabase session, staff row must match the restaurant
- `owner` — staff role must be `owner` or `manager`
- `admin` — row in `platform_admins`

---

## GET `/api/menu/[slug]` — public

Returns the full menu for a restaurant, filtered to what's available right now.

**Query params**
- `table` (optional) — QR token. If present, the response includes the resolved table.

**Response 200**
```json
{
  "restaurant": {
    "id": "uuid", "slug": "tandoori-hut", "name": "Tandoori Hut",
    "logoUrl": null, "currency": "INR",
    "settings": { "acceptsCash": true, "acceptsOnline": true,
                  "serviceChargePct": 5, "packingCharge": 20 }
  },
  "table": { "id": "uuid", "label": "T7" },
  "categories": [
    {
      "id": "uuid", "name": "Starters", "sortOrder": 1,
      "items": [
        {
          "id": "uuid", "name": "Paneer Tikka",
          "description": "Cottage cheese cubes...",
          "imageUrl": null, "basePrice": 240,
          "foodType": "veg", "spiceLevel": 2, "prepMinutes": 18,
          "taxRate": 5, "tags": ["bestseller"], "isAvailable": true,
          "variants": [
            { "id": "uuid", "name": "Regular (6 pc)", "priceDelta": 0, "isDefault": true }
          ],
          "addonGroups": [
            { "id": "uuid", "name": "Extras", "minSelect": 0, "maxSelect": 4,
              "addons": [ { "id": "uuid", "name": "Extra gravy", "price": 40 } ] }
          ]
        }
      ]
    }
  ]
}
```

**Rules**
- Categories with `available_from`/`available_to` outside the current restaurant-local time are omitted entirely.
- Categories with `active_days` not including today are omitted.
- Items with `is_available = false` are **included** with the flag set, so the UI can grey them out.
- Items with `is_active = false` are omitted.
- 404 if slug not found or `is_active = false`. 404 if `table` token doesn't belong to this restaurant.

---

## POST `/api/orders` — public

Creates an order. **The single most important endpoint in the app.**

**Request**
```json
{
  "restaurantSlug": "tandoori-hut",
  "tableToken": "a1b2c3...",
  "orderType": "dine_in",
  "customerName": "Rahul",
  "customerPhone": "9812345678",
  "notes": "Ring the bell when ready",
  "idempotencyKey": "client-generated-uuid",
  "paymentMethod": "cash",
  "items": [
    {
      "itemId": "uuid",
      "variantId": "uuid or null",
      "addonIds": ["uuid", "uuid"],
      "quantity": 2,
      "notes": "less spicy"
    }
  ]
}
```

**Server behaviour, in order**
1. Validate with zod. Reject empty `items`, `quantity < 1`, `quantity > 50`.
2. Resolve restaurant from slug; 404 if inactive.
3. Resolve table from token; 400 if it doesn't belong to that restaurant.
4. Check `idempotencyKey`. If an order already exists with it, return that order with **200** and stop.
5. Fetch all referenced items, variants and addons **from the DB in one query**. Reject with 400 if any ID is unknown, belongs to another restaurant, or the item has `is_available = false`.
6. Compute totals via `lib/pricing.ts` using DB prices. **Ignore any price the client sent.**
7. Generate `order_number` via `next_order_number(restaurant_id)`.
8. Insert `orders` + `order_items` (with snapshots) + one `order_events` row, in a transaction.
9. If `paymentMethod = 'razorpay'`, set `payment_status = 'pending'` and return a Razorpay order in the response.

**Response 201**
```json
{
  "order": {
    "id": "uuid", "orderNumber": "TH-0042", "status": "placed",
    "subtotal": 720, "taxTotal": 36, "serviceCharge": 36,
    "packingCharge": 0, "discount": 0, "total": 792,
    "paymentStatus": "pending", "placedAt": "2026-08-22T18:30:00Z"
  },
  "razorpay": { "orderId": "order_xxx", "amount": 79200, "keyId": "rzp_test_xxx" }
}
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_BODY` | zod failure |
| 400 | `ITEM_UNAVAILABLE` | an item is out of stock — include `itemName` in the message |
| 404 | `RESTAURANT_NOT_FOUND` | bad slug |
| 404 | `TABLE_NOT_FOUND` | bad token |
| 429 | `RATE_LIMITED` | more than 10 orders/minute from one IP |

---

## GET `/api/orders/[id]` — public

Customer's order tracker. Returns the order with snapshot line items and an
estimated ready time (`placedAt + max(prepMinutes)`).

**Response 200**
```json
{
  "id": "uuid", "orderNumber": "TH-0042", "status": "preparing",
  "tableLabel": "T7", "total": 792, "paymentStatus": "paid",
  "estimatedReadyAt": "2026-08-22T18:52:00Z",
  "items": [
    { "itemName": "Paneer Tikka", "variantName": "Regular (6 pc)",
      "quantity": 2, "unitPrice": 240, "lineTotal": 480,
      "addons": [{ "name": "Extra gravy", "price": 40 }], "notes": "less spicy" }
  ],
  "events": [ { "status": "placed", "createdAt": "..." } ]
}
```

Line items are read from `order_items` snapshots. Never join to `menu_items` here.

---

## PATCH `/api/orders/[id]/status` — staff

**Request** `{ "status": "preparing" }`

**Rules**
- Valid transitions only: `placed → accepted → preparing → ready → served`.
  `cancelled` is allowed from any state before `served`.
- Any other transition returns **409 `INVALID_TRANSITION`**.
- Sets the matching timestamp column (`accepted_at`, `ready_at`, `served_at`).
- Inserts an `order_events` row with the acting `staff_id`.
- The Realtime broadcast happens automatically via the Postgres change feed.

---

## GET `/api/orders` — staff

**Query params:** `status` (comma-separated), `from`, `to`, `limit` (default 50), `cursor`

Returns orders for the authenticated staff member's restaurant, newest first.
Used by the kitchen screen's initial load and the orders list page.

---

## Menu management — staff

| Method | Route | Notes |
|---|---|---|
| POST | `/api/menu/categories` | |
| PATCH | `/api/menu/categories/[id]` | |
| DELETE | `/api/menu/categories/[id]` | Soft delete (`is_active = false`) |
| POST | `/api/menu/items` | |
| PATCH | `/api/menu/items/[id]` | Also handles the `isAvailable` toggle |
| DELETE | `/api/menu/items/[id]` | Soft delete — old orders reference it |
| POST | `/api/menu/reorder` | `{ type: 'item'\|'category', ids: [...] }` — bulk `sort_order` update |
| POST | `/api/menu/items/[id]/variants` | |
| POST | `/api/upload/image` | Returns a Supabase Storage signed upload URL |

---

## Tables — staff

| Method | Route | Notes |
|---|---|---|
| GET | `/api/tables` | |
| POST | `/api/tables` | Generates `qr_token` server-side with `crypto.randomUUID()` |
| PATCH | `/api/tables/[id]` | |
| POST | `/api/tables/[id]/regenerate-qr` | Invalidates the printed standee — warn in the UI |

---

## GET `/api/qr/[restaurantId]/pdf` — staff

Returns a print-ready PDF standee sheet: one card per table with the restaurant
logo, table label, QR code encoding `{APP_URL}/r/{slug}/t/{qr_token}`, and
"Scan to order". A4, 4 cards per page, crop marks.

**Query params:** `tableIds` (optional, comma-separated — defaults to all active tables)

---

## Payments

### POST `/api/payments/razorpay` — public
`{ orderId }` → creates a Razorpay order, returns `{ razorpayOrderId, amount, keyId }`.

### POST `/api/payments/webhook` — public, signature-verified
1. Read the raw body (**do not parse before verifying**).
2. Verify `x-razorpay-signature` with HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`.
3. On `payment.captured`: set `payment_status = 'paid'`, store `payment_ref`.
4. On `payment.failed`: set `payment_status = 'failed'`.
5. Always return 200 once verified, even for events you ignore, or Razorpay will retry forever.
6. Handle duplicate deliveries — the same event may arrive twice.

---

## POST `/api/service-requests` — public

`{ tableToken, type: 'waiter' | 'water' | 'bill' }`
Rate limited to one request per table per 60 seconds. Broadcasts on
`restaurant:{id}:service`.

---

## GET `/api/reports/sales` — owner

**Query:** `from`, `to`, `groupBy` (`day` | `hour` | `item`)

```json
{
  "totals": { "orders": 142, "revenue": 68400, "averageTicket": 481 },
  "series": [ { "label": "2026-08-21", "orders": 38, "revenue": 18200 } ],
  "topItems": [ { "itemName": "Butter Chicken", "quantity": 64, "revenue": 24320 } ],
  "deadItems": [ { "itemName": "Kadai Mutton", "lastOrderedAt": "2026-07-14" } ]
}
```

---

## GET `/api/health` — public

`{ "status": "ok", "db": "ok", "timestamp": "..." }` — for the uptime monitor.

---

## Standard error shape

```json
{ "error": { "code": "ITEM_UNAVAILABLE", "message": "Kadai Mutton is currently unavailable" } }
```

Never leak stack traces, SQL, or Supabase error text to the client. Log the full
error to Sentry, return a clean message.
