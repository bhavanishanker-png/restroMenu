# QBite — QR Restaurant Ordering Platform

A multi-tenant web app where customers scan a QR code at their table, browse the menu, and place orders — no app install, no login. Orders land instantly on the kitchen display. One deployment, many restaurants.

---

## Features

### Customer
- Scan QR → live menu, no login required
- Category tabs with scroll-spy, search, and filters (veg-only, price, bestsellers)
- Variants and add-ons per item (Half / Full, extra cheese, etc.)
- Cart with per-item notes, item stepper, bill breakdown
- Checkout: name + phone, then Cash or Razorpay
- Live order status tracker: Placed → Accepted → Preparing → Ready → Served

### Restaurant
- **Kitchen display** — real-time order cards, sound alert on new order, one tap to advance status, amber/red urgency timers
- **Menu manager** — add/edit/delete categories and items, drag to reorder, one-tap availability toggle
- **Table manager** — QR standee PDF generator (branded, table-numbered)
- **Dashboard** — today's order count, revenue, average ticket
- **Staff login** — email (owner/manager) or 4-digit PIN (kitchen/waiter)

### Platform
- Super-admin panel to onboard and manage restaurants

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, RSC) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth + custom PIN login |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage |
| Payments | Razorpay |
| State | Zustand (cart) + TanStack Query (server state) |
| Error tracking | Sentry |
| Deployment | Vercel |

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd restroMenu
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_SECRET=qbite-dev-admin-secret-change-before-prod
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
ANTHROPIC_API_KEY=sk-ant-...          # AI Menu Extractor
```

### 3. Database setup

In the Supabase SQL editor, run in order:
1. `docs/schema.sql` — creates all tables, RLS policies, functions
2. `docs/seed.sql` — seeds one demo restaurant (`test-kitchen`) with tables, categories, and menu items

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Demo Credentials

| Role | How to access |
|---|---|
| Customer | `http://localhost:3000/r/test-kitchen/t/demo-t1-8c6c8c72d282750c` |
| Owner / Manager | `http://localhost:3000/login` → click **Use Demo** |
| Super admin | `http://localhost:3000/admin/login` → click **Use Demo** |

Demo restaurant login: `testowner@qbite.dev` / `Test1234!`

---

## Key Routes

| Route | Who |
|---|---|
| `/r/[slug]/t/[token]` | Customer — menu & ordering |
| `/r/[slug]/t/[token]/cart` | Customer — cart review |
| `/r/[slug]/t/[token]/checkout` | Customer — checkout |
| `/order/[orderId]` | Customer — live order tracker |
| `/login` | Staff login (email or PIN) |
| `/dashboard` | Restaurant dashboard |
| `/dashboard/kitchen` | Kitchen display |
| `/dashboard/menu` | Menu manager |
| `/dashboard/tables` | Table & QR manager |
| `/dashboard/orders` | Order history |
| `/admin/login` | Platform super-admin login |
| `/admin/restaurants` | Manage all restaurants |

---

## Project Structure

```
src/
  app/
    (customer)/r/[slug]/t/[token]/   # Customer menu, cart, checkout
    (customer)/order/[orderId]/      # Order tracker
    dashboard/                       # Restaurant staff pages
    admin/                           # Platform admin
    api/                             # API routes
  components/
    menu/          # MenuHeader, MenuItemCard, CartBar, CategoryTabs…
    cart/          # CartLineItem, BillSummary…
    checkout/      # CheckoutForm
    kitchen/       # KitchenBoard, OrderCard…
    dashboard/     # Analytics, Staff, Tables…
    admin/         # Super-admin components
    ui/            # shadcn/ui primitives + custom atoms
  lib/
    pricing.ts     # All money math — the only place arithmetic on prices happens
    queries/       # Supabase data fetching
    mappers.ts     # DB row → TS type (snake_case → camelCase)
    auth.ts        # Session helpers
  store/
    cart.ts        # Zustand cart store (persisted to localStorage)
  types/
    index.ts       # Shared TypeScript types — mirror the DB schema exactly
docs/
  schema.sql       # Database schema + RLS policies
  seed.sql         # Demo data
  api-spec.md      # API endpoint contracts
  ui-spec.md       # Screen & component spec
  tasks.md         # Build task list
```

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run test` | Vitest unit tests |
| `npm run check` | typecheck + lint + test |

---

## Architecture Notes

**Multi-tenancy** — Every Supabase query on a tenant table must include `.eq('restaurant_id', restaurantId)`. RLS policies are a backstop, not the primary defence. `restaurantId` always comes from the server (slug lookup or authenticated session), never from a client-supplied field.

**Money** — All pricing arithmetic lives in `src/lib/pricing.ts`. The server recomputes order totals from item IDs; any total sent in a request body is ignored.

**Orders** — Status moves one way: `placed → accepted → preparing → ready → served`. `cancelled` is reachable before `served`. Every transition is recorded in `order_events`. Order creation requires a client-generated idempotency key — duplicates return the existing order with 200.

**Cart** — Zustand store persisted to `localStorage`, scoped per `(restaurant_slug, table_id)`. Cart data is never trusted server-side for pricing.

**Kitchen realtime** — Supabase Realtime subscription on the `orders` table. Optimistic status updates queue to `localStorage` when offline and sync on reconnect.

---

## Five Things That Break This App If Done Wrong

1. A query missing `restaurant_id` leaks another restaurant's data.
2. Trusting a client-supplied total lets anyone order a biryani for ₹1.
3. Joining to `menu_items` to price a past order rewrites history when prices change.
4. A missing idempotency key turns a double-tap into two orders and one angry table.
5. A kitchen screen that doesn't survive a wifi drop gets unplugged by day three.

---

---

## User Guide

### For Customers

#### Placing an order
1. Scan the QR code on your table with any phone camera — no app needed.
2. The menu opens in your browser. Browse categories using the tabs at the top.
3. Tap an item to see details, variants (size), and add-ons. Adjust the quantity and tap **Add to Cart**.
4. The cart bar at the bottom shows your running total. Tap **View Cart** when ready.
5. Review your items, adjust quantities or remove anything, then tap **Proceed to Checkout**.
6. Enter your name and phone number. Choose **Cash** (pay at the table) or **Pay Online** (Razorpay).
7. After placing, you land on the **Order Tracker** page. Refresh or keep it open — the status updates live.

#### Order statuses
| Status | Meaning |
|---|---|
| Placed | Restaurant received your order |
| Accepted | Staff confirmed it |
| Preparing | Kitchen is cooking |
| Ready | Your food is on its way |
| Served | Done — enjoy! |

#### Tips
- Out-of-stock items appear faded and cannot be added.
- Use the **Veg only** filter to hide non-veg items.
- Add a note to any item ("less spicy", "no onion") in the detail sheet before adding to cart.

---

### For Restaurant Staff — Manager / Owner Login

#### Logging in
1. Go to `/login` (or scan the staff QR).
2. Choose **Manager / Owner** tab, enter your email and password, tap **Sign In**.
3. You land on the Dashboard.

#### Dashboard
- Shows today's order count, revenue, and average ticket in real time.
- Use the sidebar to navigate to Kitchen, Menu, Tables, Orders, and Settings.

#### Menu Manager (`/dashboard/menu`)
1. **Add a category** — click **+ Category**, enter a name, save.
2. **Add an item** — click **+ Item** inside a category. Fill in name, price, description, food type (veg/non-veg/egg), image, and optionally variants and add-on groups.
3. **Reorder** — drag any category or item to a new position.
4. **Toggle availability** — flip the switch on any item to mark it out of stock. Customers see it greyed out immediately.
5. **Edit / Delete** — use the kebab menu (⋮) on any item or category.

#### Table Manager (`/dashboard/tables`)
1. **Add a table** — click **+ Table**, enter a label (e.g. "T1", "Patio 3").
2. **Download QR standee** — click the QR icon next to any table to download a print-ready PDF with the restaurant name, table label, and scannable QR code. Print and laminate it.
3. **Regenerate QR** — if a token is compromised, regenerate it here. The old QR stops working immediately.

#### Order History (`/dashboard/orders`)
- Browse all past orders filtered by date or status.
- Click any order to see the full bill with item snapshots, add-ons, and payment method.

---

### For Kitchen Staff — PIN Login

1. Go to `/login`, choose **Kitchen / Waiter** tab.
2. Type your restaurant code (slug, e.g. `test-kitchen`), select your name, enter your 4-digit PIN.
3. You are taken directly to the Kitchen Display.

#### Kitchen Display (`/dashboard/kitchen`)
- New orders animate in at the top-left with a chime sound.
- Each card shows: **order number**, **table**, **elapsed time**, all **items with quantity and notes**.
- Card border turns **amber** after 15 minutes, **red** after 25.
- Tap the primary button on a card to advance its status:
  - **Accept** → **Start Preparing** → **Mark Ready**
- To cancel an order, use the kebab menu (⋮) on the card.
- If the internet drops, a banner shows "Offline — N changes pending". Status changes are saved locally and sync automatically when connection returns.

---

### For Platform Super-Admin

#### Logging in
Go to `/admin/login` and enter the super-admin secret.

#### Onboarding a restaurant
1. Go to **Restaurants** → **+ New Restaurant**.
2. Fill in: name, slug (URL-safe, e.g. `spice-garden`), timezone, currency.
3. Save — the restaurant is created with a default "open" status.
4. Share the staff login URL (`/login?slug=spice-garden`) with the owner.
5. The owner sets up their menu, tables, and staff PINs from the dashboard.

#### Managing restaurants
- **Activate / Deactivate** — deactivating hides the restaurant's menu from customers immediately.
- Click a restaurant row to view its order volume and settings.

---

## License

Private — all rights reserved.
