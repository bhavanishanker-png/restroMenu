# UI Specification

Mobile-first. Design at 375px width, scale up. shadcn/ui primitives throughout.

---

## Design tokens

Monochrome, built on a warm `stone` ramp. Hierarchy comes from **layering, border and
weight** — never from hue. Colour is spent only where it carries meaning.

```
── Neutrals (the whole UI) ──
Page             #FAFAF9   the "faded white" ground
Card / sheet     #FFFFFF   lifts by being brighter than the page
Container        #F5F5F4
Container high   #E7E5E4
Border/hairline  #E7E5E4   1px does the work shadows used to
Outline          #A8A29E   decorative only — never text (2.3:1)
Text secondary   #78716C
Text body        #57534E
Text primary     #1C1917
Primary action   #1C1917   near-black fill, white label — not pure #000

── Semantic accents (the only hues) ──
Veg marker       #15803D   green square outline with a filled dot
Non-veg marker   #B91C1C   red square outline with a filled triangle
Egg marker       #CA8A04   amber square outline with a filled dot
Success          #15803D   on #F0FDF4 — ready, paid
Warning          #B45309   on #FFFBEB — kitchen 15–25 min
Danger / error   #B91C1C   on #FEF2F2 — cancelled, errors, kitchen 25 min+

Radius           12px cards, 8px controls, full for pills
Font             Inter body / Outfit headings (next/font)
Base size        16px customer / 18px kitchen screen
Elevation        near-hairline; heavy shadows read dated on monochrome
```

Tokens live in two places and must agree: the named Material-3 set in
`tailwind.config.ts` (`surface-*`, `on-surface-*`, `primary-*`, `success-*`,
`warning-*`, `error-*`, `veg`/`non-veg`/`egg`) and the shadcn CSS variables in
`src/app/globals.css`. Never hardcode a hex in a component.

Never use colour alone. Veg/non-veg always shows the square-dot icon; order status
badges differ by fill weight and label; kitchen urgency escalates border *weight*
alongside colour.

---

# CUSTOMER SCREENS

## 1. Menu — `/r/[slug]/t/[token]`

The most important screen in the app.

**Layout, top to bottom**
1. **Header (collapses on scroll)** — restaurant cover image 140px tall, logo, name, "Table T7" pill, open/closed status.
2. **Search + filter row (sticky under header)** — search input, and filter chips: `Veg only` · `Bestsellers` · `Under ₹200`. Active chips are filled with primary colour.
3. **Category tab bar (sticky)** — horizontally scrollable pills. Scroll-spies the sections below and auto-centres the active pill.
4. **Menu sections** — one per category, `id` anchored for scroll-spy.
5. **Floating cart bar** — fixed bottom, appears only when cart is non-empty. Shows `3 items · ₹792` and a `View cart` button. 64px tall, respects safe-area inset.

**MenuItemCard**
- Horizontal layout: text left, 96×96 rounded image right.
- Line 1: veg/non-veg marker + item name (16px, medium).
- Line 2: price. If variants exist, show the lowest as `₹240 onwards`.
- Line 3: description, clamped to 2 lines, 14px secondary.
- Line 4: tag pills (`Bestseller`, `Chef's special`) and spice level as 1–3 chilli icons.
- Bottom-right of the image: an `ADD` button, or a `− 1 +` stepper once in cart.
- **Unavailable:** whole card at 40% opacity, image greyscale, an `Unavailable` pill replaces the ADD button, card not tappable.

**Item detail — bottom sheet, not a page**
- Full-width image, name, description, price.
- Variants as a radio group. Default variant preselected.
- Each add-on group as a labelled checkbox list, respecting `minSelect`/`maxSelect`. Disable remaining checkboxes once max is reached.
- A "Cooking instructions" text input (`e.g. less spicy, no onion`), 120 char cap.
- Quantity stepper.
- Sticky footer: `Add item · ₹520` with the live computed price.

**Empty states**
- Search with no results: "Nothing matches '{query}'" + a Clear search button.
- Restaurant closed: a banner at top, menu still browsable, ordering disabled.

---

## 2. Cart — `/r/[slug]/t/[token]/cart`

- Line items with name, variant, add-ons listed small underneath, notes in italics, quantity stepper, line total.
- Swipe-to-delete, plus a visible trash icon (swipe alone isn't discoverable).
- "Add more items" link back to the menu.
- Bill summary card: Subtotal, GST, Service charge, Packing charge (takeaway only), **Total** in bold.
- Sticky `Proceed to checkout` button.
- Empty cart: illustration + "Your cart is empty" + Browse menu button.

---

## 3. Checkout — `/r/[slug]/t/[token]/checkout`

- Order type shown as read-only (`Dine-in · Table T7`).
- Name (required), phone (required, 10 digits, validated).
- Payment method: two large radio cards — `Pay at table (Cash)` and `Pay now (UPI / Card)`. Hide either if disabled in settings.
- Order notes textarea.
- Bill summary repeated.
- `Place order` button — **disabled and showing a spinner immediately on tap**, so a double-tap can't fire twice.
- On success: `router.replace()` to the tracker, so Back doesn't re-submit.

---

## 4. Order tracker — `/order/[orderId]`

- Large order number, table label.
- Horizontal 5-step progress: Placed · Accepted · Preparing · Ready · Served. Completed steps filled, current step pulsing.
- "Estimated ready by 7:52 PM" countdown.
- Order items list (from snapshots).
- Payment status pill.
- Live via `order:{id}` subscription. Poll every 15s as a fallback if the socket drops.
- Once `served`: show a 5-star feedback prompt.
- Buttons: `Call waiter`, `Request bill` (Release 2).

---

# DASHBOARD SCREENS

## 5. Kitchen display — `/dashboard/kitchen`

Built for a 10" tablet, read from three feet away.

- **No sidebar.** Full-bleed. A thin top bar: restaurant name, live clock, connection status dot, sound toggle, fullscreen-ish toggle.
- **Four equal columns:** New · Preparing · Ready · Served (today).
- Column headers show a live count.

**OrderCard**
- Order number at 32px bold. Table label at 20px.
- Elapsed timer, updating every second.
- Item lines: `2× Paneer Tikka (Regular)` at 18px, add-ons and notes indented at 15px. **Notes highlighted in amber** — this is where "no onion" lives and it must not be missed.
- Border and header tint: neutral under 15 min, amber 15–25 min, red past 25 min.
- One full-width primary button: `Accept` → `Start preparing` → `Mark ready` → `Mark served`. Minimum 60px tall.
- A small overflow menu for `Cancel order`.

**Behaviour**
- New order: card slides in at the top of column 1, plays a chime, briefly flashes.
- Status updates are optimistic. Roll back and toast on failure.
- **Offline:** queue changes to localStorage, show a persistent amber banner `Offline — 3 changes pending`, sync on reconnect.
- Prevent screen sleep with the Wake Lock API.

---

## 6. Menu manager — `/dashboard/menu`

- Two-pane on desktop: category list left, items right. Stacked on mobile.
- Categories: drag to reorder, inline rename, item count badge.
- Item rows: drag handle, thumbnail, name, price, food-type marker, **an availability toggle switch directly in the row**, and an edit button.
- The availability toggle is the most-used control in the whole dashboard. One tap, optimistic, no confirmation dialog.
- Item editor is a slide-over sheet: image upload with client-side compression before upload, all fields, variants as a repeatable row list, add-on group multi-select.
- Bulk actions: select multiple items → mark available / unavailable / move category.

---

## 7. Tables — `/dashboard/tables`

- Grid of table cards: label, seats, active session indicator, small QR preview.
- `Add table`, `Print all QR standees` (downloads the PDF), per-table `Download QR`.
- Regenerating a QR shows a destructive confirm: "The printed standee for T7 will stop working."

---

## 8. Today's dashboard — `/dashboard`

- Four stat cards: Orders today · Revenue today · Average ticket · Live orders now.
- Hourly bar chart of orders.
- Recent orders table, last 10.
- Quick action buttons: Open kitchen screen, Add menu item.

## 9. Orders — `/dashboard/orders`
Filterable, searchable table with a detail slide-over. Date range, status filter, CSV export.

## 10. Staff — `/dashboard/staff`
List with name, role, active toggle. Add staff by email (owner/manager, sends an invite) or by PIN (kitchen/waiter).

## 11. Reports — `/dashboard/reports`
Date range picker. Revenue line chart, top 10 items bar chart, dead items table, hourly heatmap, category-wise split.

## 12. Settings — `/dashboard/settings`
Restaurant profile, GST number, opening hours editor, service charge %, packing charge, payment method toggles, order number prefix.

## 13. Admin — `/admin/restaurants`
Table of all restaurants with plan, status, order count. Create-restaurant form that provisions the restaurant, settings row, and an owner staff account in one go.

---

## Cross-cutting requirements

- Every async surface has a **skeleton**, not a spinner.
- Every destructive action has a confirm dialog naming the thing being destroyed.
- Every mutation shows a toast on success and on failure.
- Every list has an empty state with a call to action.
- All interactive elements reachable by keyboard, visible focus rings.
- All images have alt text; icon-only buttons have `aria-label`.
- Text contrast ≥ 4.5:1.
- The customer app is a PWA: manifest, icons, add-to-home-screen prompt after a completed order.
