# 0002 — Server-side pricing and order snapshots

**Status:** Accepted

## Context

Customers build a cart in the browser. The cart shows a running total, so the client already "knows" a price. Two risks follow:

1. **Tampering.** If the server trusts a total from the request, anyone can edit the request and order a biryani for ₹1.
2. **History drift.** Menus change. If a past order's lines are priced by joining to `menu_items`, raising a price today silently rewrites last month's bills and revenue reports.

Indian restaurant bills also have per-item tax rates (food and beverages differ), service charge and packing charges, so pricing logic is easy to get subtly wrong if it is duplicated.

## Options considered

1. **Trust the client total, validate loosely.** Simple, but a validation that only checks "close enough" is still exploitable.
2. **Recompute on the server, store references only.** Safe at order time, but historic orders still depend on current menu rows.
3. **Recompute on the server and snapshot every line.** Safe at order time and stable forever after.

## Decision

Option 3.

- **One pricing module.** All money arithmetic lives in `src/lib/pricing.ts` (unit price, per-line tax, service charge, packing charge, rounding). No other file does arithmetic on prices. The cart and the server call the same functions, so the displayed total and the charged total cannot drift apart.
- **The server ignores client totals.** `POST /api/orders` receives only item IDs, variant IDs, add-on IDs and quantities. It loads those rows from the database (scoped to the restaurant), checks each is available and that variants and add-ons belong to the item, then prices the order with `priceCart()`.
- **Snapshots.** `order_items` stores `item_name`, `variant_name`, `unit_price`, `addons` (as JSON with names and prices) and `tax_rate` as they were at order time. `item_id` is kept for reference only and is never used to price a past order.
- **Money types.** `numeric(10,2)` in Postgres; amounts are rounded once at defined boundaries with `roundMoney`, and summed in whole paise (`sumMoney`) so long lists don't accumulate float error.

## Consequences

- ✅ A tampered request can at worst order real items at real prices.
- ✅ Old bills and reports never change when the menu does.
- ✅ Pricing is unit-tested in one place (`src/lib/pricing.test.ts`: variants, multiple add-ons, per-item tax, service and packing charges, rounding boundaries).
- ⚠️ Snapshots duplicate data in every order line. That is the point; storage is cheap relative to a wrong bill.
- ⚠️ If a price changes between "view cart" and "place order", the customer is charged the new price. The server is the source of truth; the order confirmation shows the charged amount.

## Where it lives

- `src/lib/pricing.ts`, `src/lib/pricing.test.ts`
- `src/app/api/orders/route.ts` — repricing and validation
- `docs/schema.sql` — `order_items` snapshot columns
