# QBite — QR Restaurant Ordering Platform

Customers scan a QR at their table, order from a live menu, and pay.
Orders appear instantly on the restaurant's kitchen screen. Multi-tenant:
one deployment serves many restaurants.

---

## For the AI agent building this

Read in this order:

1. **`plan.md`** — what we're building, fixed decisions, scope, definition of done
2. **`CLAUDE.md`** — coding rules. Non-negotiable.
3. **`docs/tasks.md`** — the build order. Work through it top to bottom.

Reference as needed:
- `docs/schema.sql` — the database. Run it first.
- `docs/seed.sql` — one realistic restaurant with deliberate edge cases.
- `docs/api-spec.md` — every endpoint's contract.
- `docs/ui-spec.md` — every screen, component by component.
- `src/types/index.ts` — shared types. Already written.
- `src/lib/pricing.ts` — money math. Already written. Do not duplicate it.

**Start with task T01 in `docs/tasks.md`.**

---

## Local setup

```bash
npm install
cp .env.example .env.local     # fill in Supabase and Razorpay keys
```

Then in the Supabase SQL editor:
1. Run `docs/schema.sql`
2. Run `docs/seed.sql` — it prints 10 QR tokens at the end, copy one

```bash
npm run dev
```

Open `http://localhost:3000/r/tandoori-hut/t/{qr_token}` with a token from the seed output.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run test` | Vitest |
| `npm run check` | typecheck + lint + test — run before every commit |

---

## Key routes

| Route | Who |
|---|---|
| `/r/[slug]/t/[token]` | Customer menu |
| `/order/[orderId]` | Customer order tracker |
| `/dashboard/kitchen` | Kitchen display |
| `/dashboard/menu` | Menu manager |
| `/admin/restaurants` | Platform admin |

---

## The five things that break this app if done wrong

1. A query missing `restaurant_id` leaks another restaurant's data.
2. Trusting a client-supplied total lets anyone order a biryani for ₹1.
3. Joining to `menu_items` to price a past order rewrites history when prices change.
4. A missing idempotency key turns a double-tap into two orders and one angry table.
5. A kitchen screen that doesn't survive a wifi drop gets unplugged by day three.

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase
(Postgres, Auth, Storage, Realtime) · Razorpay · Zustand · TanStack Query ·
Vercel · Sentry
