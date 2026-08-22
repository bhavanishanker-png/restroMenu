# plan.md — QR Restaurant Ordering Platform

> **This is the master spec.** Read this file first, then `CLAUDE.md` for coding rules,
> then work through `docs/tasks.md` in order. Do not skip ahead.

---

## 1. What we are building

A multi-tenant web app. A customer sits at a table, scans a QR code, sees that
restaurant's live menu, orders, and pays. The order appears instantly on the
restaurant's kitchen screen. The restaurant manages its own menu, tables, staff
and reports from a dashboard.

**One codebase serves three audiences:**

| Audience | Route prefix | Auth |
|---|---|---|
| Customer at a table | `/r/[slug]/t/[token]` | None. Anonymous. |
| Restaurant staff | `/dashboard/*` | Supabase Auth (owner/manager) or 4-digit PIN (kitchen/waiter) |
| Platform operator | `/admin/*` | Supabase Auth, `super_admin` flag |

---

## 2. Non-negotiable product decisions

These have already been decided. Do not re-litigate them while building.

1. **No customer signup.** Name + phone at checkout only. A signup wall kills conversion at a table.
2. **Price snapshots.** `order_items` stores `item_name`, `unit_price` and `addons` as literal values copied at order time. Never compute a past order's total by joining to `menu_items`. Menu prices change; bills must not.
3. **Kitchen screen is the real product.** If staff hate it, the restaurant abandons the whole system. Build it early, make it big, loud and offline-tolerant.
4. **Server recalculates all money.** The client's total is a display value only. The API recomputes from item IDs and ignores whatever the client sent.
5. **Every DB query filters by `restaurant_id`.** Missing this filter leaks another restaurant's data. RLS is the second line of defence, not the first.
6. **Mobile first.** 90%+ of customer traffic is a phone held one-handed at a table. Design at 375px, then scale up.

---

## 3. Tech stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ App Router, TypeScript, strict mode |
| Styling | Tailwind CSS + shadcn/ui |
| Icons | lucide-react |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (staff), bcrypt PIN (floor staff) |
| Realtime | Supabase Realtime (Postgres changes) |
| Storage | Supabase Storage (dish images) |
| Payments | Razorpay |
| Client state | Zustand (cart, persisted to localStorage) |
| Server state | TanStack Query |
| Forms | react-hook-form + zod |
| PDF | @react-pdf/renderer (QR standees) |
| Charts | recharts |
| Hosting | Vercel |
| Errors | Sentry |

---

## 4. Release scope

### Release 1 — MVP. Build this completely before anything else.

**Customer**
- QR resolves to a table, opens the menu
- Categories, search, veg/non-veg/egg markers, spice level, dish photos
- Item sheet: variants (Half/Full), add-on groups, quantity, cooking notes
- Cart persisted per table token, survives refresh
- Checkout: name + phone, then Cash at table or Razorpay
- Live order tracker: Placed → Accepted → Preparing → Ready → Served
- Unavailable items shown greyed out, not hidden

**Restaurant**
- Kitchen display: 4 status columns, sound on new order, one tap to advance
- Menu manager: category and item CRUD, drag reorder, one-tap out-of-stock
- Table manager + bulk QR standee PDF generator
- Today's dashboard: orders, revenue, average ticket
- Staff management with roles

**Platform**
- Super-admin: create restaurant, activate/deactivate, list all

### Release 2 — after a real restaurant has used R1 for two weeks
Group ordering with split bill · time-based menus · waiter/water/bill call buttons ·
private routing of sub-3 ratings to the owner · loyalty by phone · reorder-my-usual ·
reports (dead items, hourly heatmap, table turnover) · WhatsApp bill · takeaway pre-order

### Release 3 — the moat
Ingredient-level inventory with auto stock-out · KOT station routing · kitchen overload
mode · multi-outlet with per-branch overrides · item margin tracking · AI menu
descriptions and Hindi translation · demand forecasting · thermal printer KOT · open webhook API

---

## 5. File map

```
plan.md                    ← you are here
CLAUDE.md                  ← coding rules, read before writing any code
.env.example
package.json
docs/
  schema.sql               ← run this in Supabase SQL editor first
  seed.sql                 ← one realistic restaurant with 25 items
  api-spec.md              ← every endpoint, request and response shape
  ui-spec.md               ← every screen, component by component
  tasks.md                 ← THE BUILD ORDER. Work through this.
src/
  types/index.ts           ← shared types, mirror of the schema
  lib/pricing.ts           ← ALL money math. Single source of truth.
```

---

## 6. Target directory structure

```
src/
  app/
    (customer)/
      r/[slug]/page.tsx                    restaurant landing
      r/[slug]/t/[token]/page.tsx          THE MENU — main customer screen
      r/[slug]/t/[token]/cart/page.tsx
      r/[slug]/t/[token]/checkout/page.tsx
      order/[orderId]/page.tsx             live status tracker
    (dashboard)/
      dashboard/layout.tsx                 sidebar + auth guard
      dashboard/page.tsx                   today's summary
      dashboard/kitchen/page.tsx           KDS
      dashboard/orders/page.tsx
      dashboard/menu/page.tsx
      dashboard/tables/page.tsx
      dashboard/staff/page.tsx
      dashboard/reports/page.tsx
      dashboard/settings/page.tsx
    (admin)/admin/restaurants/page.tsx
    api/
      menu/[slug]/route.ts
      orders/route.ts
      orders/[id]/route.ts
      orders/[id]/status/route.ts
      service-requests/route.ts
      payments/razorpay/route.ts
      payments/webhook/route.ts
      qr/[restaurantId]/pdf/route.ts
      reports/sales/route.ts
      health/route.ts
  components/
    menu/  cart/  kitchen/  dashboard/  ui/
  lib/
    supabase/client.ts
    supabase/server.ts
    pricing.ts
    auth.ts
    realtime.ts
    utils.ts
  store/cart.ts
  types/index.ts
```

---

## 7. Realtime channels

| Channel | Publisher | Subscriber | Payload |
|---|---|---|---|
| `restaurant:{id}:orders` | order insert/update | kitchen screen, dashboard | full order row |
| `order:{id}` | order status update | customer tracker | `{ status, updated_at }` |
| `restaurant:{id}:service` | service_requests insert | floor tablet | request row |

---

## 8. Definition of done for Release 1

- [ ] A phone can scan a printed QR and place a cash order in under 60 seconds
- [ ] That order appears on a second device's kitchen screen in under 2 seconds, with sound
- [ ] Advancing the status on the kitchen screen updates the customer's tracker live
- [ ] A Razorpay payment completes and the webhook marks the order paid
- [ ] The owner can mark an item out of stock and it greys out on the customer's next load
- [ ] A QR standee PDF prints correctly for all tables
- [ ] Two restaurants exist in the DB and neither can see the other's orders
- [ ] Double-tapping "Place order" creates exactly one order
- [ ] Kitchen screen queues status changes while offline and syncs on reconnect
- [ ] Lighthouse mobile performance on the menu page ≥ 85

---

## 9. Timeline

| Week | Deliverable |
|---|---|
| 1 | Setup, schema, seed, customer menu page |
| 2 | Cart, checkout, order creation, Razorpay |
| 3 | Kitchen display, customer tracker, realtime |
| 4 | Menu manager, tables, QR PDF |
| 5 | Auth, roles, dashboard, reports, hardening |
| 6 | Pilot in one real restaurant during a dinner rush |
| 7+ | Release 2 |

Ship Release 1 in six weeks with one paying restaurant rather than spending six
months on features nobody has used.
