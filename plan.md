# Restaurant Ordering Platform — Complete Build Plan

A multi-restaurant web app where customers scan a QR at their table, order from a live menu, and the restaurant manages everything from a dashboard.

---

## 1. Final feature set

Everything below is split into three releases. Build them **in this order**. Do not start Release 2 until Release 1 works end to end with a real order on a real phone.

### Release 1 — MVP (this is what you actually launch with)

**Customer side**
- Scan QR → lands on `/r/{restaurant-slug}/t/{table-token}` — no login, no app install
- Menu with categories, dish photos, veg/non-veg/egg markers, price
- Variants (Half / Full, Small / Medium / Large) and add-ons (extra cheese, extra gravy)
- Filters: pure veg, spice level, price range, search
- Cart with quantity, per-item cooking notes ("less spicy")
- Checkout: name + phone only, then Cash at table **or** Razorpay
- Live order status page: Placed → Accepted → Preparing → Ready → Served
- Items marked out of stock are greyed out, not hidden

**Restaurant side**
- Kitchen display: order cards in columns, sound alert on new order, one tap to advance status
- Menu manager: add/edit/delete categories and items, drag to reorder, one-tap out-of-stock toggle
- Table manager + **QR standee PDF generator** (branded, table-numbered, print and laminate)
- Today's dashboard: order count, revenue, average ticket size
- Staff PIN login (owner / manager / kitchen roles)

**Platform side**
- Super-admin: onboard a restaurant, activate/deactivate, view all outlets

### Release 2 — the features that make people pay

- **Group ordering** — multiple phones share one table cart, items tagged per person, split bill
- **Time-based menus** — breakfast 7–11, happy hour pricing, weekend-only items, auto-switching
- **Waiter call / water / bill** buttons that ping the floor
- **Private negative feedback** — ratings under 3 go straight to the owner's WhatsApp, not to a public review
- **Loyalty stamps** by phone number, no card
- **Reorder my usual** from order history
- **Reports** — dead items, top sellers, hourly heatmap, table turnover time
- **WhatsApp bill** with GST breakdown
- **Pre-order for takeaway** with pickup time

### Release 3 — the moat

- **Ingredient-level inventory** — recipe per dish, auto stock deduction, auto out-of-stock
- **KOT station routing** — tandoor / chinese / bar print separately
- **Kitchen overload mode** — auto-extend prep estimates when queue is deep
- **Multi-outlet** — shared menu template with per-branch price and stock overrides
- **Item margin tracking** — cost vs sell price per dish
- **AI**: menu description generation, Hindi translation, demand forecasting, weekly feedback summary
- **Thermal printer KOT** and open webhook API for existing POS systems

---

## 2. Tech stack (opinionated — just use this)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript** | One codebase for customer app, dashboard, and API routes |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, consistent, dark mode free |
| Database | **PostgreSQL via Supabase** | Relational data with real constraints; you need joins everywhere |
| Auth | **Supabase Auth** (staff) + phone OTP (customers, Release 2) | Customers stay anonymous in MVP |
| Realtime | **Supabase Realtime** (Postgres changes) | No separate socket server to run |
| File storage | **Supabase Storage** or Cloudinary | Dish images with on-the-fly resizing |
| Payments | **Razorpay** | UPI, cards, and it's the norm for Indian merchants |
| Cart state | **Zustand** + localStorage | Survives an accidental refresh at the table |
| Server data | **TanStack Query** | Caching and refetch handling |
| PDF (QR standees) | **@react-pdf/renderer** | Server-rendered, print-ready |
| Hosting | **Vercel** | Zero-config for Next.js |
| Errors | **Sentry** | You will need this on day one of a real restaurant |

**Why Supabase over a separate Express server:** you get Postgres, auth, file storage, and realtime subscriptions in one service. It removes roughly half the backend work. If you'd rather build the backend yourself for learning, use Node + Express + Prisma + Postgres + Socket.io — same schema, more code.

---

## 3. Database schema

```sql
-- ============ TENANTS ============
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,               -- tandoori-hut
  name text not null,
  logo_url text,
  cover_url text,
  phone text,
  address text,
  gst_number text,
  currency text default 'INR',
  timezone text default 'Asia/Kolkata',
  plan text default 'free',
  is_active boolean default true,
  created_at timestamptz default now()
);

create table restaurant_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  accepts_cash boolean default true,
  accepts_online boolean default true,
  service_charge_pct numeric(5,2) default 0,
  packing_charge numeric(10,2) default 0,
  opening_hours jsonb,                     -- { "mon": [["09:00","23:00"]], ... }
  order_number_prefix text default 'ORD',
  auto_accept_orders boolean default false
);

-- ============ PEOPLE ============
create table staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  auth_user_id uuid,                       -- links to Supabase auth
  name text not null,
  phone text,
  role text not null check (role in ('owner','manager','kitchen','waiter')),
  pin_hash text,                           -- bcrypt, for quick floor login
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============ TABLES & SESSIONS ============
create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  label text not null,                     -- "T7", "Rooftop 3"
  seats int default 4,
  qr_token text unique not null,           -- random, printed on the standee
  is_active boolean default true
);

create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  table_id uuid references restaurant_tables(id) on delete cascade,
  join_code text,                          -- 4-digit, for group ordering
  status text default 'open' check (status in ('open','billed','closed')),
  opened_at timestamptz default now(),
  closed_at timestamptz
);

-- ============ MENU ============
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  available_from time,                     -- null = always
  available_to time,
  active_days int[],                       -- [1,2,3,4,5] = Mon-Fri
  is_active boolean default true
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  base_price numeric(10,2) not null,
  cost_price numeric(10,2),                -- for margin reports
  food_type text check (food_type in ('veg','non_veg','egg')),
  spice_level int default 0,               -- 0-3
  prep_minutes int default 15,
  tax_rate numeric(5,2) default 5,
  kitchen_station text default 'main',     -- tandoor / chinese / bar
  tags text[],                             -- jain, bestseller, chef_special
  is_available boolean default true,       -- the out-of-stock toggle
  sort_order int default 0,
  is_active boolean default true
);

create table item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references menu_items(id) on delete cascade,
  name text not null,                      -- Half / Full
  price_delta numeric(10,2) default 0,
  is_default boolean default false
);

create table addon_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  name text not null,                      -- "Extra toppings"
  min_select int default 0,
  max_select int default 5
);

create table addons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references addon_groups(id) on delete cascade,
  name text not null,
  price numeric(10,2) default 0
);

create table item_addon_groups (
  item_id uuid references menu_items(id) on delete cascade,
  group_id uuid references addon_groups(id) on delete cascade,
  primary key (item_id, group_id)
);

-- ============ ORDERS ============
create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  table_id uuid references restaurant_tables(id),
  session_id uuid references table_sessions(id),
  order_number text not null,              -- ORD-0042
  order_type text default 'dine_in' check (order_type in ('dine_in','takeaway','pre_order')),
  customer_name text,
  customer_phone text,
  status text default 'placed'
    check (status in ('placed','accepted','preparing','ready','served','cancelled')),
  subtotal numeric(10,2) not null,
  tax_total numeric(10,2) default 0,
  service_charge numeric(10,2) default 0,
  packing_charge numeric(10,2) default 0,
  discount numeric(10,2) default 0,
  total numeric(10,2) not null,
  payment_status text default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  payment_method text,                     -- cash / razorpay
  payment_ref text,
  notes text,
  idempotency_key text unique,             -- stops double submission
  placed_at timestamptz default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  item_id uuid references menu_items(id),
  item_name text not null,                 -- SNAPSHOT, never a join at read time
  variant_name text,
  unit_price numeric(10,2) not null,       -- SNAPSHOT
  quantity int not null default 1,
  addons jsonb default '[]',               -- SNAPSHOT: [{name, price}]
  line_total numeric(10,2) not null,
  notes text,
  kitchen_station text default 'main',
  status text default 'pending',
  ordered_by text                          -- person name, for group ordering
);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  status text not null,
  staff_id uuid references staff(id),
  created_at timestamptz default now()
);

-- ============ EXTRAS ============
create table service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  table_id uuid references restaurant_tables(id),
  type text check (type in ('waiter','water','bill')),
  status text default 'open',
  created_at timestamptz default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  order_id uuid references orders(id),
  rating int check (rating between 1 and 5),
  comment text,
  is_public boolean default false,         -- ratings < 3 stay private
  created_at timestamptz default now()
);

create table loyalty (
  restaurant_id uuid references restaurants(id) on delete cascade,
  phone text not null,
  visits int default 0,
  points int default 0,
  primary key (restaurant_id, phone)
);

-- ============ INDEXES ============
create index on orders (restaurant_id, status, placed_at desc);
create index on order_items (order_id);
create index on menu_items (restaurant_id, category_id, is_active);
create index on restaurant_tables (qr_token);
```

**The single most important rule in this schema:** `order_items` stores `item_name`, `unit_price`, and `addons` as **snapshots**. When the owner raises Paneer Tikka from ₹240 to ₹280 tomorrow, last week's bills must not silently change. Never compute an old order's total by joining to `menu_items`.

---

## 4. Project structure

```
src/
  app/
    (customer)/
      r/[slug]/
        page.tsx                  # restaurant landing
        t/[token]/
          page.tsx                # the menu (main customer screen)
          cart/page.tsx
          checkout/page.tsx
      order/[orderId]/page.tsx    # live status tracker
    (dashboard)/
      dashboard/
        layout.tsx                # sidebar + auth guard
        page.tsx                  # today's summary
        kitchen/page.tsx          # the KDS screen
        orders/page.tsx
        menu/page.tsx
        tables/page.tsx
        staff/page.tsx
        reports/page.tsx
        settings/page.tsx
    (admin)/
      admin/restaurants/page.tsx
    api/
      orders/route.ts
      orders/[id]/status/route.ts
      payments/razorpay/route.ts
      payments/webhook/route.ts
      qr/[restaurantId]/pdf/route.ts
  components/
    menu/  cart/  kitchen/  ui/
  lib/
    supabase/{client,server}.ts
    pricing.ts                    # ALL money math lives here, one file
    auth.ts
    realtime.ts
  store/cart.ts
  types/
```

Keep every rupee calculation in `lib/pricing.ts`. If tax logic is scattered across three components you will ship a wrong bill.

---

## 5. API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/menu/:slug?table=token` | Public menu, time-filtered, with availability |
| POST | `/api/orders` | Create order (requires idempotency key) |
| GET | `/api/orders/:id` | Order status for the customer |
| PATCH | `/api/orders/:id/status` | Staff advances the status |
| POST | `/api/service-requests` | Waiter / water / bill call |
| POST | `/api/payments/razorpay` | Create payment order |
| POST | `/api/payments/webhook` | Razorpay confirmation (verify signature) |
| CRUD | `/api/menu/items`, `/categories`, `/variants` | Menu management |
| GET | `/api/qr/:restaurantId/pdf` | QR standee PDF |
| GET | `/api/reports/sales?from&to` | Sales reports |

**Realtime channels**
- `restaurant:{id}:orders` → new orders and status changes to the kitchen screen
- `order:{id}` → status pushed to the customer's tracker
- `restaurant:{id}:service` → waiter calls

---

## 6. Build steps, in order

### Step 1 — Setup (day 1)
1. `npx create-next-app@latest --typescript --tailwind --app`
2. Create a Supabase project, run the schema SQL above in the SQL editor
3. Add `.env.local`: Supabase URL, anon key, service role key, Razorpay keys
4. Install shadcn/ui, Zustand, TanStack Query, Lucide icons
5. Push to GitHub, connect Vercel, confirm a deploy works

### Step 2 — Seed one real restaurant (day 2)
Insert one restaurant, 5 categories, 25 items with real prices and photos, 8 tables. Use a menu from an actual place near you. Fake seed data hides real problems — long dish names, items with 6 variants, categories with 40 items.

### Step 3 — Customer menu page (days 3–6)
- `/r/[slug]/t/[token]` resolves the table, shows the menu
- Sticky category tabs, search, veg filter
- Item detail sheet: variants, add-ons, quantity, notes
- **Test on an actual phone from day one.** This screen is 90% mobile.

### Step 4 — Cart and checkout (days 7–9)
- Zustand cart persisted to localStorage, keyed by table token
- Pricing function: `subtotal → tax per item → service charge → packing → total`
- Checkout form: name, phone, payment choice
- Cash order writes straight to the DB; online goes through Razorpay first

### Step 5 — Order creation with idempotency (day 10)
Generate a UUID on the client when the cart is created. Send it as `idempotency_key`. The unique constraint makes a double-tap a no-op instead of two biryanis.

### Step 6 — Kitchen display (days 11–14)
- Four columns: New / Preparing / Ready / Served
- Subscribe to `restaurant:{id}:orders`, play a sound on insert
- Big fonts, high contrast, tap targets over 60px — it's read from three feet away by someone holding a ladle
- Show elapsed time per order, turn the card amber past 15 minutes and red past 25
- Queue status changes locally and sync on reconnect; restaurant wifi dies constantly

### Step 7 — Customer order tracker (days 15–16)
Subscribe to `order:{id}`, show a progress bar with an estimated ready time from the max `prep_minutes` in the order.

### Step 8 — Menu management dashboard (days 17–21)
- Category and item CRUD, image upload with compression before upload
- Drag-to-reorder
- **The out-of-stock toggle must be one tap from the item list.** Staff use this 20 times a day.

### Step 9 — Tables and QR generator (days 22–23)
- Create tables, generate `qr_token`
- PDF standee: restaurant logo, table label, QR, "Scan to order"
- Bulk download all tables as one PDF

### Step 10 — Auth and roles (days 24–26)
- Supabase Auth for owner and manager
- 4-digit PIN for kitchen and waiter (bcrypt hashed, rate limited)
- Route guards on `/dashboard`, role checks on every mutating API route

### Step 11 — Reports (days 27–28)
Today's revenue, order count, average ticket, top 10 items, hourly chart, date-range export to CSV.

### Step 12 — Harden it (days 29–32)
Work through the security checklist in section 7. Add Sentry. Test with wifi off, with a slow 3G throttle, and with two phones ordering at the same table.

### Step 13 — Pilot with one real restaurant (week 5)
Sit in the restaurant during a dinner rush and watch people use it. You will find ten things in two hours that no amount of solo testing surfaces.

### Step 14 — Release 2 features
Only now. Group ordering first, then time-based menus, then feedback routing.

---

## 7. Security and correctness checklist

- [ ] **Every query filters by `restaurant_id`.** One missing filter leaks another restaurant's orders. Enable Postgres RLS as a second line of defence.
- [ ] **QR tokens are random**, not `table-1`, `table-2`. Otherwise anyone guesses table numbers.
- [ ] **Table sessions expire.** A photo of the QR shouldn't let someone order from home at 2am. Bind an order to an open session.
- [ ] **Prices are recalculated server-side.** Never trust the total the client sends.
- [ ] **Razorpay webhook signature verified** before marking anything paid.
- [ ] **Idempotency key on order creation.**
- [ ] **Rate limit** order creation and PIN login per IP and per table.
- [ ] **Soft deletes** on menu items — old orders still reference them.
- [ ] **Audit log** (`order_events`) for who changed what.
- [ ] Image uploads: type check, size cap, strip EXIF.
- [ ] No secrets in client components. Service role key stays server-side only.

---

## 8. Deployment

1. Vercel for the app; Supabase handles the database
2. Custom domain, HTTPS enforced (camera-based QR scanning requires it)
3. Enable Supabase daily backups
4. `robots.txt` blocking `/dashboard` and `/admin`
5. PWA manifest + service worker so the kitchen screen can be added to a tablet home screen
6. Sentry for errors, Vercel Analytics for traffic
7. Uptime monitor pinging `/api/health` every 5 minutes

---

## 9. What to get right that most people get wrong

- **No customer login in the MVP.** Every signup wall costs you orders.
- **The kitchen screen is the real product.** If staff hate it, the restaurant stops using the whole system regardless of how good the customer side looks.
- **Build offline tolerance early**, not as a v2 patch.
- **Price snapshots**, as covered above.
- **Onboard a restaurant in under 15 minutes** — bulk menu import from a CSV or a photo of their printed menu, then QR PDFs. If onboarding takes a week, you'll never get past one customer.
- **Don't build the admin panel first.** Get one order moving from a phone to a kitchen screen before anything else.

---

## 10. Suggested timeline

| Weeks | Milestone |
|---|---|
| 1–2 | Setup, seeded data, customer menu, cart, order creation |
| 3–4 | Kitchen display, order tracker, menu dashboard, QR generator |
| 5 | Auth, roles, reports, hardening |
| 6 | Pilot with one real restaurant, fix what breaks |
| 7–10 | Release 2 features |
| 11+ | Release 3, second and third restaurant |

Ship Release 1 in six weeks with one paying restaurant rather than spending six months on a feature list nobody has used yet.