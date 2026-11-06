# 0004 — Order state machine with compare-and-set

**Status:** Accepted

## Context

Several people change an order's status from different devices: the kitchen tablet advances it, a waiter's phone may cancel it, the owner's dashboard may do either. Writes can arrive late (slow network) or out of order (an offline tablet syncing). Without rules, a late "Ready" can overwrite a "Cancelled", or an order can jump backwards.

## Options considered

1. **Free-form status column, last write wins.** Simple, and silently wrong under concurrency.
2. **Row locks** (`SELECT … FOR UPDATE`) around each transition. Correct, but needs a transaction spanning the read and write, which the HTTP-and-PostgREST setup doesn't give for free.
3. **Explicit transition table plus compare-and-set.** Validate the transition, then update only if the status is still what was validated.

## Decision

Option 3.

- **One-way transitions**, defined once in `ORDER_FLOW` and shared by the API and the kitchen UI:

  ```
  placed → accepted → preparing → ready → served
     └─────────┴──────────┴─────────┴──→ cancelled   (any state before served)
  ```

  `canTransition(from, to)` rejects anything else with **409 `INVALID_TRANSITION`**.
- **Compare-and-set.** The update is `UPDATE orders … WHERE id = ? AND restaurant_id = ? AND status = <the status we validated against>`. If another device moved the order in between, zero rows match and the route returns **409 `STATUS_CHANGED`** instead of overwriting.
- **Audit log.** Every successful change inserts a row into `order_events` (order, new status, staff member, time). Lifecycle timestamps (`accepted_at`, `ready_at`, `served_at`) are set on the order for cheap reporting.

## Consequences

- ✅ No lost updates and no backwards moves, without explicit locks or long transactions.
- ✅ The same rules drive the UI (which button to show) and the API (what to accept).
- ✅ `order_events` gives a full history: who did what, when; prep-time analytics come from it.
- ⚠️ The client must handle 409. The kitchen screen rolls back its optimistic change and the next poll shows the true state (see [0008](0008-offline-kitchen-display.md)).
- ⚠️ The status update and the event insert are two statements, not one transaction. If the event insert fails it is logged and the status change stands. Moving both into one RPC would close that gap.

## Where it lives

- `src/types/index.ts` — `ORDER_FLOW`, `canTransition`
- `src/app/api/orders/[orderId]/status/route.ts` — validation, compare-and-set, event insert
