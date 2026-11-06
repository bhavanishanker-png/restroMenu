# 0005 — Daily order numbers

**Status:** Accepted (revised by migration 007 after a production-class bug)

## Context

Orders have a UUID primary key, but staff shout numbers across a kitchen: "forty-two is ready". Numbers need to be short, sequential and per restaurant, so they reset each day (`ORD-0001`, `ORD-0002`, …).

## What went wrong first

The first version generated `count(today's orders) + 1`, with a uniqueness constraint on `(restaurant_id, order_number)` for **all time**. On day two the counter reset, produced `ORD-0001` again, and collided with day one's `ORD-0001`. Every order that day failed with `23505`. The API reported it as a generic "failed to place order", so it looked like a glitch rather than an outage.

The same function had two quieter bugs:
- `count(*)` is racy: two concurrent orders read the same count and claim the same number.
- `count(*)` reuses a number after a row is deleted.

## Options considered

1. **Make numbers global** (never reset). Fixes the collision but gives staff six-digit numbers.
2. **A Postgres sequence per restaurant.** Race-free, but sequences don't reset daily without a scheduled job, and creating one per tenant complicates onboarding.
3. **Scope uniqueness to the business day and serialise allocation.**

## Decision

Option 3 (`docs/migrations/007_fix_order_number_collision.sql`):

- A stored generated column `order_day` (derived from `placed_at`), and the constraint becomes `UNIQUE (restaurant_id, order_day, order_number)`.
- `next_order_number()` takes `pg_advisory_xact_lock(hashtext(restaurant_id))`, so allocation is serialised **per restaurant** for the length of the transaction. Different restaurants never wait on each other.
- The next number comes from the highest number issued today, not from a row count.

## Consequences

- ✅ Short numbers, no collisions across days, no duplicates under concurrency, no reuse after deletes.
- ✅ The lock is per restaurant and per transaction, so contention is limited to one restaurant's simultaneous orders.
- ⚠️ The business day is computed in **UTC**. For a restaurant in India, numbering resets at 05:30 local time rather than midnight. That's harmless for most restaurants (it falls outside service hours) but wrong for a 24-hour venue. The fix is to derive `order_day` from each restaurant's timezone, which the app already stores.
- 📌 Lesson: a generic error ("CREATE_FAILED") made a hard outage look like a transient glitch. The route still maps unexpected database errors to `CREATE_FAILED`; logging the Postgres error code and constraint name alongside it would have made this a five-minute diagnosis.

## Where it lives

- `docs/migrations/007_fix_order_number_collision.sql`
- `docs/schema.sql` — `order_day`, `orders_restaurant_day_number_key`
