# 0001 — Shared-database multi-tenancy

**Status:** Accepted

## Context

QBite serves many restaurants from one deployment. Each restaurant must see only its own menu, tables, staff and orders. A leak between tenants (one restaurant seeing another's orders or customer phone numbers) is the worst bug this system can have.

The server talks to Supabase with the **service role key**, which bypasses Row-Level Security (RLS). The browser holds only the **anon key**, which is subject to RLS.

## Options considered

1. **Database per tenant.** Strongest isolation, but every migration runs N times, connection counts grow with tenants, and onboarding means provisioning infrastructure. Too heavy for small restaurants.
2. **Schema per tenant.** Better isolation than shared tables, but Supabase tooling, RLS and the generated API assume one schema; cross-tenant admin queries get awkward.
3. **Shared tables with a `restaurant_id` column on every tenant table.** Cheapest to run and onboard; isolation depends on every query being scoped correctly.

## Decision

Option 3, with two layers of defence:

- **Primary: application-level scoping.** Every query on a tenant table includes `.eq('restaurant_id', restaurantId)`, and `restaurantId` is always derived on the server — from the URL slug for customers, or from the verified staff session for staff — never from a request body field.
- **Backstop: RLS.** Every tenant table has RLS enabled, with policies built on `is_staff_of(restaurant_id)`. This protects anything that reaches the database with the anon key, such as browser-side Realtime subscriptions.

Lookups by a globally unique ID are still scoped by restaurant. For example, order creation fetches menu items with `.in("id", ids).eq("restaurant_id", restaurantId)`, so knowing another restaurant's item UUID does not let a customer order it.

## Consequences

- ✅ One schema, one migration path, onboarding a restaurant is an `INSERT`.
- ✅ Defence in depth: a missing filter in server code is caught by code review and the convention; a mistake in browser access is caught by RLS.
- ⚠️ Because the server bypasses RLS, **RLS does not protect server routes**. Correctness depends on discipline; the rule is written down in `CLAUDE.md` and enforced in review.
- ⚠️ A noisy tenant shares capacity with everyone. Acceptable at current scale; the escape hatch is moving large tenants to their own project later, which the `restaurant_id` column makes mechanical.
- 🐛 RLS has its own failure modes. `is_staff_of()` originally ran with the caller's rights, so the `staff` table's policy recursively called itself (`54001 stack depth limit exceeded`) and every staff read failed. Fixed by making it `SECURITY DEFINER` with a pinned `search_path` — see `docs/migrations/006_fix_is_staff_of_recursion.sql`.

## Where it lives

- `docs/schema.sql` — RLS policies, `is_staff_of()`
- `src/lib/auth.ts` — `restaurantId` comes from the verified session
- `src/app/api/orders/route.ts` — item lookup scoped by restaurant
