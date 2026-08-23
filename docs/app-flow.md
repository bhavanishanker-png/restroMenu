# QBite — Complete Application Flow

## 1. Super Admin — Create a Restaurant

**Who:** The person who runs the QBite platform

```
1. Go to /admin/login
2. Enter SUPER_ADMIN_SECRET from .env.local
3. Redirected to /admin/restaurants
4. Click "New restaurant"
5. Fill in:
   - Restaurant name: "Spice Garden"
   - Slug: "spice-garden"  ← becomes the URL /r/spice-garden/...
   - Owner name, email, password
6. Click "Create restaurant"
   → Creates: restaurants row + restaurant_settings + Supabase auth user + staff (owner)
7. Owner can now log in at /login with their email/password
```

---

## 2. Owner — First-time Setup

**Who:** Restaurant owner, after getting credentials from super admin

### A. Login
```
/login → email + password → redirected to /dashboard
```

### B. Configure settings
```
/dashboard/settings
- Set service charge % (e.g. 5%)
- Set packing charge for takeaway (e.g. ₹20)
- Set order number prefix (e.g. "SG")
- Toggle: accept cash / accept online payments
- Toggle: auto-accept orders
- Save
```

### C. Add menu categories
```
/dashboard/menu
Left pane → "Add category"
- Add: Starters, Main Course, Breads, Beverages
- Drag to reorder
```


### D. Add menu items
```
/dashboard/menu → click a category → "Add item"
For each item fill:
- Name, description
- Base price
- Food type (Veg 🟢 / Non-veg 🔴)
- Spice level
- Tax rate %
- Upload photo (compressed, stored in Supabase Storage)
- Variants (e.g. Half / Full with price delta)
- Add-on groups (e.g. "Extra toppings")
- Is available toggle
- Save
```

### E. Add tables
```
/dashboard/tables → "Add table"
- Label: T1, T2 ... T10
- Seats: 4, 6
→ Each table gets a unique QR token (crypto.randomUUID)

"Print all QR standees" → downloads A4 PDF
- 4 standees per page, each with QR code + table label + restaurant name
- Print and place on tables
```

### F. Add staff
```
/dashboard/staff → "Add staff"
- Kitchen staff: name "Raju", role Kitchen, PIN 1234
- Waiter: name "Priya", role Waiter, PIN 5678
- Manager: name "Vikram", role Manager (logs in with email via /login)
```

---

## 3. Staff — Login

### Owner / Manager (email login)
```
/login → Email: owner@restaurant.com → Password → /dashboard
```

### Kitchen / Waiter (PIN login)
```
/login
→ "Staff PIN login" tab
→ Select restaurant slug
→ Select staff name from list
→ Enter 4-digit PIN
→ Kitchen → redirected to /dashboard/kitchen
→ Waiter → redirected to /dashboard/orders
```

---

## 4. Customer — Ordering Flow

**Who:** Customer at the table, scans QR code

### Step 1 — Scan QR
```
Customer scans table standee
→ Opens: /r/spice-garden/t/<qr_token>
```

### Step 2 — Browse menu
```
Menu page loads:
- Restaurant name, cover photo, logo at top
- Sticky category tab bar (Starters | Mains | Breads | Beverages)
- Scrolling section list below

Customer scrolls:
- Tab bar highlights current visible section
- Each item card shows: photo, name, veg/non-veg dot, price, spice level
- Out-of-stock items: greyed out 40%, "Unavailable" pill, not tappable
```

### Step 3 — Add item to cart
```
Customer taps an item card
→ Bottom sheet slides up showing:
   - Full photo
   - Name, description
   - Variant selector (e.g. Half ₹180 / Full ₹320) — radio buttons
   - Add-on checkboxes (e.g. Extra cheese +₹40)
   - Quantity +/–
   - Notes field (e.g. "less spicy")
   - "Add to cart" button showing live price

Taps "Add to cart"
→ Bottom sheet closes
→ Sticky cart bar appears at bottom: "2 items · ₹640"
```

### Step 4 — Cart review
```
Taps cart bar → /r/spice-garden/t/<token>/cart

Cart page shows:
- Each item: name, variant, add-ons, notes, quantity, line total
- Remove / change quantity
- Bill breakdown:
    Subtotal      ₹580
    Tax (5%)      ₹29
    Service chg   ₹30
    ─────────────────
    Total         ₹639
- Order type: Dine-in / Takeaway
- "Proceed to checkout" button
```

### Step 5 — Checkout
```
/r/spice-garden/t/<token>/checkout

Fill in:
- Name (required)
- Phone number (required, 10 digits)
- Order notes (optional)
- Payment: Cash / Online (Razorpay)

If Cash:
→ Tap "Place order"
→ POST /api/orders with idempotency_key (UUID generated client-side)
→ Server recomputes total from DB prices (ignores any client total)
→ Order created in DB with status: "placed"
→ Redirect to /order/<orderId>

If Razorpay:
→ Tap "Pay ₹639"
→ Razorpay modal opens (UPI / Card / Netbanking)
→ Customer completes payment
→ Razorpay sends webhook to /api/payments/webhook
→ Server verifies HMAC signature
→ Updates payment_status = "paid"
→ Redirect to /order/<orderId>
```

### Step 6 — Order tracking
```
/order/<orderId>

Shows:
- Order number (e.g. SG-0042)
- Table label (T3)
- Status badge: New → Accepted → Preparing → Ready → Served
- Each item with quantity, variant, add-ons
- Bill breakdown
- Estimated ready time

Status updates in real-time via Supabase Realtime
(polling fallback every 15s if Realtime drops)

"Add to home screen" banner appears (Android Chrome)
→ Customer can install QBite as a PWA
```

---

## 5. Kitchen Staff — Kitchen Display

**Who:** Cook in the kitchen, on a 10" tablet

```
/dashboard/kitchen (full-bleed, no sidebar)

Screen shows 4 columns:
┌──────────┬────────────┬─────────┬─────────┐
│   NEW    │ PREPARING  │  READY  │ SERVED  │
│          │            │         │         │
│ [Card]   │ [Card]     │ [Card]  │ [Card]  │
└──────────┴────────────┴─────────┴─────────┘

Each card shows:
- Order number (large, 32px)
- Table label
- Elapsed time (e.g. "8 min")
- Each item: qty + name + variant + add-ons + notes
- Border: white <15min | amber 15–25min | red >25min

When new order arrives:
→ Card animates into "New" column from top
→ Chime plays (Web Audio API)

Kitchen taps "Accept" → card moves to Preparing
Kitchen taps "Mark ready" → card moves to Ready
Waiter picks up → "Mark served" → moves to Served
"Cancel order" → order cancelled from any state

If WiFi drops:
→ Orange banner: "Offline — 2 changes pending"
→ Changes queue in localStorage
→ WiFi returns → banner: "Syncing..." → resolves automatically

Screen never sleeps (Wake Lock API)
```

---

## 6. Owner / Manager — Daily Operations

### Dashboard
```
/dashboard

Shows (refreshes on each load):
- Orders today: 47
- Revenue today: ₹18,240
- Avg ticket: ₹388
- Live orders: 3
- Hourly bar chart (orders per hour)
- Recent 10 orders table
- Quick links: Open kitchen | Add menu item
```

### Orders list
```
/dashboard/orders

Filters:
- Date range (default: today)
- Status: All / New / Preparing / Ready / Served / Cancelled
- Search: by order number or phone

Table rows: order# | table | customer | status badge | total | time

Click a row → detail sheet slides in:
- Full bill breakdown (subtotal, tax, service charge, total)
- Customer name + phone
- Payment status + method
- Notes

"Export CSV" → downloads filtered orders as spreadsheet
```

### Reports
```
/dashboard/reports

Select date range → area chart of daily revenue
Daily breakdown table: date | orders | revenue | tax | service charge
Export CSV button
```

### Menu updates
```
/dashboard/menu
- Toggle item availability (instant optimistic update)
- Edit price → existing orders unaffected (snapshots stored)
- Add new items, upload photos
- Drag to reorder categories and items
```

### Tables
```
/dashboard/tables
- See which tables have active sessions
- Regenerate QR if standee is lost/damaged (old QR immediately stops working)
- Download individual QR as PNG
- Print all QR standees as A4 PDF
```

---

## 7. Complete Order Lifecycle (end-to-end)

```
Customer scans QR
    ↓
Browses menu → adds items → fills checkout
    ↓
POST /api/orders
  → server validates items exist + belong to restaurant
  → recomputes price from DB
  → inserts order (status: placed) + order_items (snapshots)
  → inserts order_event (placed)
    ↓
Kitchen display receives Realtime INSERT event
  → fetches full order with joins
  → animates card into New column + plays chime
    ↓
Kitchen taps Accept
  → PATCH /api/orders/:id/status { status: accepted }
  → validates transition (placed → accepted ✓)
  → updates order + inserts order_event
  → Realtime UPDATE event → card moves to Preparing column
    ↓
Customer's /order/:id page updates in real-time
    ↓
Kitchen taps Mark ready
  → card moves to Ready column
  → Customer sees "Ready for pickup"
    ↓
Waiter delivers food, taps Mark served
  → order complete
  → appears in /dashboard/orders with status Served
  → counted in today's revenue on /dashboard
```

---

## 8. URL Map

| URL | Who | What |
|---|---|---|
| `/admin/login` | Super admin | Platform login |
| `/admin/restaurants` | Super admin | Manage all tenants |
| `/login` | Staff | Email or PIN login |
| `/dashboard` | Owner/Manager | Stats + recent orders |
| `/dashboard/kitchen` | All staff | Live kitchen display |
| `/dashboard/orders` | All staff | Filterable order history |
| `/dashboard/menu` | Owner/Manager | Menu categories + items |
| `/dashboard/tables` | Owner/Manager | Tables + QR PDF |
| `/dashboard/staff` | Owner | Staff accounts + PINs |
| `/dashboard/settings` | Owner | Billing + payments config |
| `/dashboard/reports` | Owner/Manager | Sales by date range |
| `/r/[slug]/t/[token]` | Customer | Browse menu |
| `/r/[slug]/t/[token]/cart` | Customer | Review cart + bill |
| `/r/[slug]/t/[token]/checkout` | Customer | Place order |
| `/order/[orderId]` | Customer | Real-time order tracker |
| `/api/health` | Uptime monitor | DB connectivity check |
