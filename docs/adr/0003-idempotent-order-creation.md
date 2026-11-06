# 0003 — Idempotent order creation

**Status:** Accepted

## Context

Customers order from phones on restaurant wifi or patchy mobile data. A request can time out after the server has already created the order; the customer taps "Place order" again, or the browser retries. Without protection, one table gets two orders, the kitchen cooks twice, and the customer may pay twice.

## Options considered

1. **Disable the button after the first tap.** Necessary for UX but not sufficient: it does nothing for network retries, reloads, or two tabs.
2. **Detect duplicates heuristically** (same table, same items, within N seconds). Guesses wrong both ways: two friends genuinely ordering the same dish get merged.
3. **Client-generated idempotency key, enforced by the database.** The same logical order always carries the same key; the database guarantees at most one order per key.

## Decision

Option 3, with a fast path and a race-safe backstop:

1. The cart generates a UUID `idempotencyKey` when the first item is added to an empty cart. It stays the same through retries and reloads (the cart is persisted), and resets only when the cart empties — which happens after a successful order. Retries therefore resend the same key.
2. **Fast path.** `POST /api/orders` first looks up an existing order with that key (scoped to the restaurant). If found, it returns that order with **200**, not an error.
3. **Race backstop.** Two concurrent requests can both miss in step 2. `orders.idempotency_key` has a `UNIQUE` constraint, so the second insert fails with Postgres `23505`. The route catches that code, fetches the order the winner created, and returns it with 200.
4. The order, its line items and its first `order_events` row are written in one database transaction (`create_order` RPC), so a retry never sees a half-written order.

## Consequences

- ✅ Double-taps, retries and concurrent duplicates all collapse to exactly one order, and the client always receives that order.
- ✅ Correctness comes from a database constraint, not from timing.
- ⚠️ The key identifies the *cart*, not the request body. If a client reused a key with different items, it would get the original order back. That matches the intended semantics (one cart, one order) but is worth knowing.
- ⚠️ The constraint is global, while lookups are scoped by restaurant. A key reused against a *different* restaurant would hit `23505`, find no order in this restaurant, and return 500. With random UUIDs this only happens if a client deliberately reuses a key, and it affects only that client.
- 📌 Next step: a load test that fires many concurrent requests with one key and asserts exactly one order row.

## Where it lives

- `src/store/cart.ts` — key generation
- `src/app/api/orders/route.ts` — fast path and `23505` handling
- `docs/migrations/002_create_order_fn.sql` — transactional `create_order`
- `docs/schema.sql` — `idempotency_key text unique not null`
