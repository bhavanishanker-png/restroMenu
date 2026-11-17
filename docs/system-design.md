# QBite — System Design (HLD + LLD)

This document reads QBite through a **system-design interview lens**. It names the
classic concepts (HLD and LLD) and points at where each one actually lives in this
codebase — and then, separately, how each would change if the system grew ~100×.

It does **not** re-derive the architecture. The *what* is in
[architecture.md](architecture.md), the *why* is in the [ADRs](adr/README.md), and the
diagrams are in [uml.md](uml.md). This file is the mapping layer between those and the
vocabulary an interviewer uses.

**How to read it**

- **Part A — HLD**: distributed-systems concerns (scaling, caching, consistency, rate
  limiting, capacity, failure).
- **Part B — LLD**: class/module design, design patterns, SOLID, concurrency control.
- Every section is split into two clearly-labelled halves:
  - 🟢 **As built** — what QBite is today. True statements about the real code.
  - 🔵 **At 100×** — what you'd change to serve ~100,000 restaurants. Hypothetical, and
    labelled as such, so the two are never confused.

> Scale target for the 🔵 sections: **100,000 restaurants**, each with one kitchen
> screen, peaks of ~60 orders/restaurant/hour, ~1M diners with a tracker open at peak.
> (The 🟢 as-built capacity estimate assumes 1,000 restaurants — see
> [architecture.md §6](architecture.md).)

---

# Part A — High-Level Design (HLD)

## A1. Concept map (the one-screen answer)

| System-design concept | 🟢 As built in QBite | Where |
|---|---|---|
| Multi-tenancy / data partitioning | Shared DB, `restaurant_id` on every tenant row, server-derived | [ADR 0001](adr/0001-shared-database-multi-tenancy.md) |
| Horizontal scaling | Stateless serverless functions on Vercel | §A3 |
| Load balancing | Vercel edge + PostgREST connection pooling | §A4 |
| Caching | React `cache()` + Next data cache with tag invalidation | §A5 |
| Consistency model | Strong (single Postgres primary), optimistic concurrency | §A6 |
| Idempotency | Client UUID + DB unique constraint → exactly-once order | [ADR 0003](adr/0003-idempotent-order-creation.md) |
| Rate limiting | Fixed-window, Redis-shared with in-memory fallback (fail-open) | §A8 |
| Async / eventual paths | Razorpay webhook (HMAC), poll-based fan-out | §A9 |
| Capacity estimation | Reads dominate writes ~50:1 (polling) | [architecture.md §6](architecture.md) |
| Observability | Sentry, `/api/health`, `order_events` audit log | §A11 |
| Security boundaries | Service-role key server-only; untrusted AI | [ADR 0009](adr/0009-ai-as-untrusted-component.md) |

---

## A2. Multi-tenancy & data partitioning

**The concept:** one deployment serves many customers. How do you isolate their data,
and how do you partition it as it grows?

🟢 **As built**
- **Shared-database, shared-schema** multi-tenancy. Every tenant table carries a
  `restaurant_id` column. There is no per-tenant database or schema.
- The `restaurant_id` is **derived server-side** — from the URL slug for diners, from
  the verified staff session for staff. It is *never* read from a client-supplied body
  field. See the order route resolving it from the slug before any write
  ([route.ts:215](../src/app/api/orders/route.ts#L215)).
- **RLS is a backstop, not the primary defence.** Because the server uses the
  service-role key (which bypasses RLS), correctness depends on every query carrying
  `.eq('restaurant_id', restaurantId)`. CLAUDE.md makes an unscoped tenant query a *bug*.
- Trade-off chosen: operational simplicity and cheap cross-tenant platform queries, at
  the cost of a noisy-neighbour risk and blast-radius-wide RLS. ([ADR 0001](adr/0001-shared-database-multi-tenancy.md).)

🔵 **At 100×**
- `restaurant_id` is already the natural **partition / shard key** — the column makes
  moving a tenant mechanical.
- **Hot tenant → dedicated project.** A very large chain gets its own Supabase project;
  the slug→restaurant lookup becomes a routing table (tenant → shard DSN).
- **Partition the write-heavy tables.** `orders`, `order_items`, `order_events` by
  `(restaurant_id, created_at)` range/hash partitions so one busy tenant's day doesn't
  bloat everyone's indexes.
- **Tenant tiering.** Noisy-neighbour isolation via per-tenant connection/QPS budgets,
  enforced at the rate limiter (§A8) keyed by `restaurant_id`, not just IP.

---

## A3. Statelessness & horizontal scaling

🟢 **As built**
- Every API route and Server Component is **stateless**: no session affinity, no
  in-process order state. A function instance can be killed and restarted with nothing
  visible to users ([architecture.md §7](architecture.md), last row).
- State lives in three places only: **Postgres** (durable), the **client** (Zustand cart
  + localStorage, [ADR 0008](adr/0008-offline-kitchen-display.md)), and a **best-effort
  in-memory rate-limit counter** that is explicitly allowed to reset.
- This is what makes serverless viable: scale = add instances, no coordination.

🔵 **At 100×**
- Statelessness already holds, so horizontal scale is "turn up concurrency." The limits
  you hit are **downstream**: Postgres connections and the polling read load (§A5, §A9),
  not the app tier.
- Move the SSE/push fan-out (§A9) to a **stateful, long-lived process** (not serverless)
  — the one place you'd deliberately break statelessness, isolated behind its own service.

---

## A4. Load balancing & connection management

🟢 **As built**
- **Vercel's edge** load-balances HTTP across function instances — nothing hand-rolled.
- The subtle one: **serverless fan-out vs Postgres connection limits.** `supabase-js`
  talks to Postgres over HTTP through **PostgREST, which pools connections**, so 500
  concurrent function instances do *not* open 500 Postgres connections
  ([architecture.md §6](architecture.md)). This is the detail interviewers probe —
  "serverless + a connection-limited DB" is a classic trap, and PostgREST is the answer here.

🔵 **At 100×**
- Add **PgBouncer** (transaction pooling) in front of the primary for any path that
  bypasses PostgREST (e.g. the RPCs, reports on a replica).
- **Geo-distribute reads.** Diners are regional; put read replicas near demand and route
  tracker polls (§A9) to the nearest replica, keeping writes on the primary.

---

## A5. Caching

🟢 **As built**
- **Request-level memoization**: menu queries wrap in React `cache()` so one render
  doesn't hit the DB twice ([queries/menu.ts:1](../src/lib/queries/menu.ts#L1)).
- **Data cache with tag invalidation**: `unstable_cache` + `revalidateTag` — the public
  menu is cached and busted precisely when the owner edits it, rather than on a timer.
- **Deliberately *not* cached**: order status and the kitchen board. These are
  freshness-critical and read through the service role every time (§A9).
- Trade-off: menus are read-heavy and change rarely (cache aggressively); orders are
  write-heavy and change constantly (don't).

🔵 **At 100×**
- **CDN the menu + images.** The public menu page is effectively static per
  `(slug, menu-version)`; serve it from the edge and bust by version tag. Dish images go
  behind a CDN with on-the-fly resizing (the plan already anticipates Cloudinary).
- **A short-TTL board cache** (1–2 s per restaurant) so ten screens in one restaurant
  cost one query — already named as step 2 in [architecture.md §6](architecture.md).
- **Cache-aside for hot read models** (today's dashboard stats) in Redis, invalidated on
  `order_events`.

---

## A6. Consistency, CAP & concurrency control

🟢 **As built**
- **Single Postgres primary → strong consistency** for the order path. No read-your-writes
  anomalies in the critical flow; the system favours **consistency over availability**
  where money and order state are concerned (CP, for the write path).
- **Optimistic concurrency** instead of locks on the hot path. The status update is a
  **compare-and-set**: `UPDATE ... WHERE id AND restaurant_id AND status = <expected>`.
  Zero rows matched → someone else already moved it → **409**, client refreshes
  ([status/route.ts:91](../src/app/api/orders/[orderId]/status/route.ts#L91); [architecture.md §4](architecture.md)).
  Two kitchen devices can't clobber each other.
- **Advisory lock** (pessimistic, narrowly scoped) only for allocating the daily order
  number, serialised **per restaurant**, never platform-wide ([ADR 0005](adr/0005-daily-order-numbers.md)).

🔵 **At 100×**
- Introducing **read replicas** (§A4) trades strong for **eventual** consistency on
  reads. Keep order *writes* and the tracker's first read on the primary; send reports
  and dashboards to replicas where staleness is fine.
- The order-number advisory lock stays fine (per-tenant contention only), but if a single
  tenant's checkout rate ever contends, switch to a **per-day sequence** or
  pre-allocated blocks.

---

## A7. Idempotency (exactly-once order creation)

🟢 **As built** — the single most interview-ready mechanism here.
- Client generates a **UUID idempotency key** when the first item enters the cart.
- `POST /api/orders` first looks up an existing order by `(idempotency_key,
  restaurant_id)`; if found, returns it with **200** (not an error)
  ([route.ts:260](../src/app/api/orders/route.ts#L260)).
- A **DB unique constraint** closes the race: if two concurrent requests pass the lookup,
  one insert wins and the other catches the unique violation, re-reads the winner's row,
  and returns **200** with it ([route.ts:474](../src/app/api/orders/route.ts#L474)).
- Net effect: double-taps, client retries, and concurrent duplicates all collapse to
  **one** order. ([ADR 0003](adr/0003-idempotent-order-creation.md).)

🔵 **At 100×**
- The pattern scales as-is (it's enforced in the DB, not in app memory). The only change:
  if order creation ever moves behind a queue, the **idempotency key becomes the message
  dedupe key** too, so a redelivered message is a no-op.

---

## A8. Rate limiting

🟢 **As built**
- **Fixed-window counter**, applied to `POST /api/orders` and PIN login, keyed per IP.
- **Two backends behind one interface**: Upstash **Redis** when configured (so every
  serverless instance shares one counter), **in-memory** otherwise
  ([rate-limit.ts:62](../src/lib/rate-limit.ts#L62)).
- **Fail-open to a weaker limit, never to no limit.** If Redis errors or exceeds a ~1 s
  timeout, the request falls back to the in-memory limiter and logs it
  ([rate-limit.ts:123](../src/lib/rate-limit.ts#L123)). Rationale: a Redis outage must not
  stop a restaurant taking orders — availability of *ordering* beats perfect rate-limit
  accuracy ([architecture.md §6](architecture.md)).

🔵 **At 100×**
- Fixed-window has a **burst-at-the-boundary** flaw; switch to **sliding-window log** or
  **token bucket** in Redis.
- Add a **per-tenant** dimension (not just per-IP) to contain a single restaurant's QPS
  (§A2 tenant tiering), and push coarse limiting to the **edge/WAF** so abuse is dropped
  before it reaches a function.

---

## A9. Async paths, webhooks & the read-amplification problem

🟢 **As built**
- **Payments are asynchronous and authority-separated.** The browser's "payment
  succeeded" callback is **never** trusted. Payment state changes *only* from the
  **Razorpay webhook**, whose **HMAC signature is verified before any write**; replays
  find the order already updated and are no-ops ([architecture.md §3](architecture.md),
  [ADR 0009 neighbours]).
- **Reads dominate.** The real bottleneck is not order writes (~17/s at 1k tenants) but
  **polling**: kitchen boards (~125 reads/s) and diner trackers (~670 reads/s) — roughly
  **50:1 reads:writes** ([architecture.md §6](architecture.md)).
- **Polling, not Realtime, is deliberate.** Supabase Realtime filters via RLS using
  `auth.uid()`, but staff use a **signed cookie** (to allow PIN login on shared tablets),
  so to the DB they're anonymous and receive nothing. The reliable path is a server route
  reading with the service role, scoped to the session's restaurant. Realtime is kept only
  to *nudge* an earlier poll ([ADR 0006](adr/0006-staff-sessions.md),
  [ADR 0007](adr/0007-kitchen-board-polling.md)). *This is the recorded project memory:
  "realtime blocked by RLS."*

🔵 **At 100×** — this is where the design actually bends.
- **Replace polling with push.** Server-Sent Events from a long-lived process holding the
  service role, **fanning out per restaurant**, collapses ~800 reads/s of polling into one
  change-driven stream per tenant (step 3 in [architecture.md §6](architecture.md)).
- **304 / empty-diff** on unchanged boards keyed off the latest `order_events` row — cheap
  first win before you build push.
- **Queue the non-critical async work** (WhatsApp bills, AI summaries, webhooks fan-out)
  so spikes don't touch the order path.

---

## A10. Capacity estimation (the math an interviewer wants)

🟢 **As built** (1,000 tenants) — from [architecture.md §6](architecture.md):

| Load | Calculation | Rate |
|---|---|---|
| Order writes | 1,000 × 60 / 3,600 | ~17/s |
| Kitchen board polls | 1,000 ÷ 8 s | ~125/s |
| Tracker polls | 10,000 ÷ 15 s | ~670/s |

**Conclusion: idle screens asking "anything new?" cost more than orders.** Optimise reads.

🔵 **At 100×** (100,000 tenants), same ratios:
- Order writes ≈ **1,700/s** → still modest for one tuned primary + pooling.
- Polling reads ≈ **~80,000/s** → **infeasible to poll.** This single number is the
  justification for the push architecture in §A9. The write tier barely moves; the read
  tier is the whole problem.

---

## A11. Observability & failure modes

🟢 **As built**
- **Sentry** on client, server, and edge (config files at repo root).
- **`/api/health`** returns 503 when Supabase is unreachable, for an uptime monitor —
  and an outage is reported as *unavailable*, not as *wrong credentials*
  ([architecture.md §7](architecture.md)).
- **`order_events`** is an append-only **audit log** — every status change writes a row,
  giving a full history per order (also the basis for change-detection in §A5/A9).
- The full failure matrix (double-tap, forged total, concurrent edit, kitchen offline,
  replayed webhook, staff removed mid-shift, Supabase down, Claude down) is tabulated in
  [architecture.md §7](architecture.md).

🔵 **At 100×**
- Add **structured metrics** (p99 order-create latency, poll volume, Redis fallback rate),
  **distributed tracing** across the push service and webhooks, and **per-tenant SLOs** so
  one tenant's degradation is visible and attributable.

---

# Part B — Low-Level Design (LLD)

The LLD story here is strong because the codebase enforces a few invariants *structurally*
rather than by convention. Each pattern below is named, then pointed at.

## B1. Design patterns in use

| Pattern | Where | What it buys |
|---|---|---|
| **State machine** | `ORDER_FLOW` + `canTransition` ([types/index.ts:19](../src/types/index.ts#L19)) | One definition of legal transitions, shared by API and UI |
| **Strategy + Dependency Injection** | `RateLimitStore` interface, Redis vs in-memory ([rate-limit.ts:62](../src/lib/rate-limit.ts#L62)) | Swap backend; fake it in tests |
| **Adapter / DTO mapper** | one mapper per entity ([mappers.ts:1](../src/lib/mappers.ts#L1)) | snake_case DB ↔ camelCase domain, in exactly one place |
| **Factory + guard** | `createServerClient` / `guardServerOnly` ([supabase/server.ts:7](../src/lib/supabase/server.ts#L7)) | Service-role client only ever constructed server-side |
| **Repository** | `src/lib/queries/*` ([queries/order.ts](../src/lib/queries/order.ts)) | Data access isolated from route handlers & components |
| **Pure-function engine (Facade)** | `pricing.ts` ([pricing.ts:1](../src/lib/pricing.ts#L1)) | All money math behind one tested, side-effect-free module |

### B1.1 State pattern — the order lifecycle
```ts
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  placed:    ['accepted', 'cancelled'],
  accepted:  ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['served', 'cancelled'],
  served: [], cancelled: [],
};
export const canTransition = (from, to) => ORDER_FLOW[from].includes(to);
```
The transition table is defined **once** and consumed by both the status API (to reject
illegal moves with 409) and the kitchen UI (to render the single "advance" button). No
`if (status === ...)` ladders duplicated across layers. ([ADR 0004](adr/0004-order-state-machine.md).)

### B1.2 Strategy + DI — the rate limiter
`RateLimitStore` is a one-method interface; `createUpstashStore` is one implementation and
the in-memory limiter is the fallback. `setRateLimitStoreForTests` injects a fake. This is
textbook **Strategy** (interchangeable algorithm) + **DI** (caller chooses), and it's *why*
the limiter is unit-testable without a live Redis ([rate-limit.test.ts](../src/lib/rate-limit.test.ts)).

### B1.3 Adapter — the mapper boundary
Rule: *no component or route handler ever reads a snake_case property.* Every row passes
through one mapper ([mappers.ts:1](../src/lib/mappers.ts#L1)). DB-shape types
(`src/types/db.ts`) and domain types (`src/types/index.ts`) are kept distinct, so a schema
rename touches one function, not fifty components.

## B2. SOLID, concretely

- **S — Single responsibility:** `pricing.ts` does money and nothing else; mappers do shape
  translation and nothing else; queries do data access and nothing else.
- **O — Open/closed:** adding a payment share method or an `OrderType` extends a type union
  and the pricing switch, without editing unrelated call sites.
- **L — Liskov:** any `RateLimitStore` (real/fake) is substitutable — the limiter can't
  tell which it got.
- **I — Interface segregation:** `priceCart` takes `Pick<RestaurantSettings,
  'serviceChargePct' | 'packingCharge'>`, not the whole settings object — it depends only
  on what it uses ([pricing.ts:114](../src/lib/pricing.ts#L114)).
- **D — Dependency inversion:** route handlers depend on the `queries/` abstraction and the
  `RateLimitStore` interface, not on `supabase-js` or Redis directly.

## B3. Concurrency control (LLD of the three mechanisms)

| Mechanism | Type | Scope | Guards against |
|---|---|---|---|
| Idempotency key + unique constraint | DB uniqueness | per order | duplicate submits/retries (§A7) |
| `UPDATE ... WHERE status = <expected>` | Optimistic (CAS) | per order | two devices racing a status change |
| `pg_advisory_xact_lock(restaurant_id)` | Pessimistic | per restaurant | two checkouts grabbing the same daily number |

The design principle: **use the weakest lock that is still correct.** Optimistic CAS on the
hot path (cheap, no contention), a narrow advisory lock only where a gapless counter forces
serialisation, and uniqueness constraints to make races *safe* rather than *prevented*.

## B4. The pricing engine (LLD worth memorising)

[pricing.ts](../src/lib/pricing.ts) is the **only** place money is computed — enforced by
CLAUDE.md. Design choices to be able to defend:

- **Pure functions, no I/O.** `priceCart` takes cart lines + settings and returns a
  breakdown. Deterministic → exhaustively unit-testable
  ([pricing.test.ts](../src/lib/pricing.test.ts)).
- **Integer paise to avoid float drift.** `toPaise`/`sumMoney` add in whole paise so
  `0.1 + 0.2 !== 0.3` never reaches a bill ([pricing.ts:32](../src/lib/pricing.ts#L32)).
  `roundMoney` uses an `EPSILON` nudge to dodge the `1.005` rounding trap.
- **Per-item tax, not flat.** Food 5%, beverages 12% — tax is summed per line, because a
  flat rate on the subtotal produces a wrong GST bill ([pricing.ts:94](../src/lib/pricing.ts#L94)).
- **Defined order of operations** for subtotal → tax → service charge → packing → discount,
  documented in the function header, so the total is reproducible.
- **Server authority.** The server reprices every line from DB rows; the client total is
  display-only and ignored ([route.ts:397](../src/app/api/orders/route.ts#L397)).
- **Remainder-fair splitting.** `splitEqually` distributes leftover paise one-per-share so
  ₹1000/3 = `[333.34, 333.33, 333.33]` and the shares sum back to the total exactly
  ([pricing.ts:209](../src/lib/pricing.ts#L209)).

## B5. Data-model LLD — the snapshot decision

- `order_items` **snapshots** `item_name`, `unit_price`, `addons`, `tax_rate` at order
  time. A historic order is **never** re-priced by joining to `menu_items`
  ([ADR 0002](adr/0002-server-side-pricing-and-snapshots.md)). This is the classic
  *immutability for records that must not change retroactively* pattern: tomorrow's price
  edit must not rewrite yesterday's bill.
- Everything else is **normalised** (categories → items → variants, add-on groups
  many-to-many) because it's edited and must stay consistent. Snapshot the *record*,
  normalise the *catalogue*. ([ER diagram](diagrams/er-data-model.png).)

## B6. API contract & validation layering

- **Validate at the boundary, trust inside.** Every route parses input with a **zod**
  schema (`safeParse`) before any logic — no raw `req.json()` destructuring
  ([route.ts:202](../src/app/api/orders/route.ts#L202)). Past the parse, the data is typed
  and trusted.
- **Uniform error envelope:** `{ error: { code, message } }` with a correct HTTP status,
  everywhere — so clients branch on `code`, not on prose.
- **Status codes carry meaning:** 200 (idempotent replay), 201 (created), 409 (illegal
  transition / lost CAS), 503 (dependency down). The code *is* part of the contract.

---

# Part C — Interview cheat-sheet

One-liners that map a concept to where it lives. Say the left, point at the right.

- *"Multi-tenant?"* → shared DB, `restaurant_id` on every row, derived server-side, RLS as
  backstop. [ADR 0001](adr/0001-shared-database-multi-tenancy.md)
- *"Exactly-once orders?"* → client UUID + DB unique constraint; duplicates return 200.
  [ADR 0003](adr/0003-idempotent-order-creation.md)
- *"Concurrent edits?"* → optimistic compare-and-set on status; loser gets 409.
  [ADR 0004](adr/0004-order-state-machine.md)
- *"Biggest bottleneck?"* → polling reads, ~50:1 over writes; fix with 304s → cache → SSE
  push. [architecture.md §6](architecture.md)
- *"Why not WebSockets/Realtime?"* → staff auth is a signed cookie, so RLS gives the client
  zero rows; server-role polling is the reliable path. [ADR 0007](adr/0007-kitchen-board-polling.md)
- *"Money correctness?"* → one pure `pricing.ts`, integer paise, per-item tax, server
  reprices, client total ignored. [ADR 0002](adr/0002-server-side-pricing-and-snapshots.md)
- *"Rate limiting under failure?"* → fixed-window, Redis-shared, fail-*open* to in-memory so
  an outage can't stop ordering. [rate-limit.ts](../src/lib/rate-limit.ts)
- *"Payment trust?"* → state changes only from the HMAC-verified webhook, never the browser
  callback; replays are no-ops.
- *"Scaling the DB?"* → `restaurant_id` is the shard key; hot tenant → own project;
  partition the order tables.

---

*Companion docs:* [architecture.md](architecture.md) · [ADR index](adr/README.md) ·
[uml.md](uml.md) · [interview-prep.md](../interview-prep.md)
