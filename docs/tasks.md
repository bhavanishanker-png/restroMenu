# tasks.md — The build order

Work through these **in order**. Each task is self-contained. Do not start a task
until the previous one's acceptance criteria all pass.

Mark tasks complete by changing `- [ ]` to `- [x]`.

---

## Phase 0 — Foundation

### - [x] T01 · Project setup
Scaffold Next.js 14 App Router with TypeScript strict mode and Tailwind. Install:
`@supabase/supabase-js`, `@supabase/ssr`, `zustand`, `@tanstack/react-query`,
`zod`, `react-hook-form`, `@hookform/resolvers`, `lucide-react`, `date-fns`,
`recharts`, `sonner`, `qrcode`, `@react-pdf/renderer`, `bcryptjs`, `razorpay`.
Init shadcn/ui and add: button, input, sheet, dialog, dropdown-menu, tabs, badge,
switch, select, skeleton, sonner, card, separator, textarea, checkbox, radio-group.
Set up `.env.local` from `.env.example`. Configure path alias `@/*`.

**Done when:** `npm run dev` serves a page, `npm run build` passes with zero TS errors.

---

### - [x] T02 · Database
Run `docs/schema.sql` then `docs/seed.sql` in the Supabase SQL editor.
Create `src/lib/supabase/client.ts` (browser, anon key) and
`src/lib/supabase/server.ts` (server, service role — must never be imported by a client component).
Add a `guardServerOnly()` check that throws if the server module is loaded in a browser context.

**Done when:** a scratch server component can fetch and log the 25 seeded menu items, and the seed query prints 10 QR tokens.

---

### - [x] T03 · Types and mappers
Write `src/types/index.ts` mirroring the schema exactly (already drafted — extend it).
Write `src/lib/mappers.ts` with one snake_case→camelCase mapper per entity:
`toRestaurant`, `toMenuItem`, `toOrder`, `toOrderItem`, `toTable`, `toStaff`.

**Done when:** no component or route handler anywhere accesses a snake_case property.

---

### - [x] T04 · Pricing engine
Implement `src/lib/pricing.ts` exactly as specified in the provided file.
Write unit tests covering: base item only; item with variant; item with 3 add-ons;
two items with **different tax rates** (5% food, 12% beverage); service charge applied;
packing charge on takeaway only; rounding at `.005` boundaries; empty cart.

**Done when:** all tests pass and the beverage/food mixed-tax case produces a
per-item tax total, not a flat rate on the subtotal.

---

## Phase 1 — Customer ordering

### - [x] T05 · Menu API
Implement `GET /api/menu/[slug]` per `docs/api-spec.md`. Include time-based
category filtering using the restaurant's timezone. One query with nested selects,
not N+1.

**Done when:** `/api/menu/tandoori-hut?table={token}` returns all 5 categories with
nested items, variants and add-on groups, Kadai Mutton has `isAvailable: false`,
and the whole response takes one round trip.

---

### - [x] T06 · Menu page
Build `/r/[slug]/t/[token]/page.tsx` per `docs/ui-spec.md` §1. Server Component
for the initial fetch; a client child for search, filters and scroll-spy.
Components: `MenuHeader`, `MenuFilters`, `CategoryTabs`, `MenuSection`,
`MenuItemCard`, `FoodTypeMarker`, `SpiceLevel`.

**Done when:** on a 375px viewport the menu scrolls smoothly, category tabs
scroll-spy correctly, veg filter works, Kadai Mutton is greyed out and not tappable,
and images lazy-load.

---

### - [x] T07 · Item sheet and cart store
Build `ItemDetailSheet` with variants, add-on groups honouring min/max, notes,
quantity, and a live price footer. Build `src/store/cart.ts` with Zustand persisted
to localStorage keyed by table token. Cart line identity = `itemId + variantId + sorted addonIds + notes`.

**Done when:** adding the same item with different add-ons creates two lines,
adding it with identical options increments quantity, and the cart survives a page refresh.

---

### - [x] T08 · Cart and checkout pages
Build the cart page and checkout page per `docs/ui-spec.md` §2–3. Bill summary
uses `lib/pricing.ts`. Generate an `idempotencyKey` UUID when the cart transitions
from empty to non-empty and persist it with the cart.

**Done when:** the bill summary matches a hand calculation on a mixed food +
beverage order, and phone validation rejects fewer than 10 digits.

---

### - [x] T09 · Order creation API
Implement `POST /api/orders` following the 9-step server behaviour in
`docs/api-spec.md`. Snapshot everything into `order_items`. Wrap the inserts in
a Postgres function or a transaction so a partial order can never exist.

**Done when:**
- Posting the same `idempotencyKey` twice returns the same order ID with 200 the second time
- Sending a tampered `total` in the body has no effect on the stored total
- Ordering Kadai Mutton returns 400 `ITEM_UNAVAILABLE` naming the dish
- An item ID from another restaurant returns 400

---

### - [ ] T10 · Order tracker
Build `/order/[orderId]` per `docs/ui-spec.md` §4. Subscribe to `order:{id}` via
Supabase Realtime with a 15s polling fallback. Clear the cart on first load of a
successful order.

**Done when:** changing the order status directly in the Supabase table updates
the tracker within 2 seconds without a refresh.

---

### - [ ] T11 · Razorpay
Implement `POST /api/payments/razorpay` and the signature-verified webhook.
Add the Razorpay checkout script to the checkout flow. Handle: success, user
dismissal, and payment failure.

**Done when:** a test-mode payment completes, the webhook flips `payment_status`
to `paid`, and replaying the same webhook payload twice does not double-process.

---

## Phase 2 — Restaurant operations

### - [ ] T12 · Staff auth
Supabase Auth email/password for owner and manager. A separate 4-digit PIN screen
for kitchen and waiter, bcrypt-verified, rate limited to 5 attempts per 10 minutes.
`src/lib/auth.ts` exposes `getStaffSession()` returning `{ staffId, restaurantId, role }`.
Guard `/dashboard/*` in the layout; guard every mutating API route by role.

**Done when:** an unauthenticated visit to `/dashboard` redirects to login, and a
`kitchen` role receives 403 from `PATCH /api/menu/items/[id]`.

---

### - [ ] T13 · Kitchen display
Build `/dashboard/kitchen` per `docs/ui-spec.md` §5. Subscribe to
`restaurant:{id}:orders`. Implement the chime, the elapsed timer, the amber/red
escalation, optimistic status updates, and the offline queue with the pending banner.

**Done when:** placing an order from a phone makes a card appear with sound within
2 seconds; killing the network, advancing 3 orders, then restoring the network
syncs all 3 and clears the banner.

---

### - [ ] T14 · Status transition API
Implement `PATCH /api/orders/[id]/status` with transition validation, timestamp
setting, and `order_events` logging.

**Done when:** `ready → accepted` returns 409, and every successful change writes an event row.

---

### - [ ] T15 · Menu manager
Build `/dashboard/menu` per `docs/ui-spec.md` §6, plus the menu CRUD API routes.
Include drag-to-reorder, the inline availability toggle, image upload with
client-side compression, and the item editor sheet.

**Done when:** toggling availability greys the item out on the customer menu on
next load, deleting an item soft-deletes it, and a past order containing that item
still renders its name and price correctly.

---

### - [ ] T16 · Tables and QR PDF
Build `/dashboard/tables` and `GET /api/qr/[restaurantId]/pdf`. A4, 4 standee
cards per page, logo + table label + QR + "Scan to order".

**Done when:** the PDF prints at A4 and a phone camera scanning a printed card
opens the correct table's menu.

---

### - [ ] T17 · Dashboard and orders list
Build `/dashboard` (stat cards, hourly chart, recent orders) and
`/dashboard/orders` (filter, search, detail slide-over, CSV export).

**Done when:** today's revenue matches the sum of today's non-cancelled order totals.

---

### - [ ] T18 · Staff, settings, reports
Build `/dashboard/staff`, `/dashboard/settings`, `/dashboard/reports` and
`GET /api/reports/sales`.

**Done when:** changing the service charge % in settings changes the next order's bill.

---

### - [ ] T19 · Super admin
Build `/admin/restaurants` with a create-restaurant flow that provisions the
restaurant, its settings row, and an owner staff account atomically.

**Done when:** a second restaurant can be created and, logged in as its owner,
none of Tandoori Hut's orders, items or tables are visible anywhere.

---

## Phase 3 — Hardening and launch

### - [ ] T20 · Security pass
Work through the checklist. Verify: no `restaurant_id`-less query exists anywhere
(grep for `.from('orders')` and check each call site); service role key absent from
the client bundle (`npm run build` then grep `.next/static`); zod on every route;
rate limits on order creation, PIN login and service requests; webhook signature verified.

**Done when:** every box is checked and the client bundle grep returns nothing.

---

### - [ ] T21 · Performance and PWA
Image optimisation via `next/image` with correct `sizes`. Add the PWA manifest,
icons, and a service worker caching the app shell. Add-to-home-screen prompt after
a completed order.

**Done when:** Lighthouse mobile on the menu page scores ≥ 85 performance and
≥ 95 accessibility.

---

### - [ ] T22 · Observability and deploy
Sentry on client and server. `GET /api/health`. Deploy to Vercel with a custom
domain and HTTPS. Enable Supabase daily backups. `robots.txt` blocking
`/dashboard` and `/admin`. Uptime monitor on `/api/health`.

**Done when:** a deliberately thrown error appears in Sentry within a minute.

---

### - [ ] T23 · Release 1 sign-off
Walk the entire "Definition of done" list in `plan.md` §8 on real devices — a phone
for the customer, a tablet for the kitchen. Fix everything that fails.

**Done when:** all 10 criteria pass. Only then move to Release 2.

---

## Release 2 backlog (do not start before T23)

T24 Group ordering with split bill · T25 Time-based menus · T26 Waiter/water/bill
call buttons · T27 Private routing of sub-3 ratings · T28 Loyalty by phone ·
T29 Reorder-my-usual · T30 Dead items and turnover reports · T31 WhatsApp bill ·
T32 Takeaway pre-order with pickup time
