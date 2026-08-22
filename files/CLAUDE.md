# CLAUDE.md — Rules for building this project

Read `plan.md` first. Then follow these rules for every line of code you write.

---

## Working method

1. Work through `docs/tasks.md` **in order**. One task per session.
2. Before starting a task, restate its acceptance criteria in one line.
3. After finishing, verify each acceptance criterion explicitly. Do not claim a task is done without checking.
4. If a task's spec is ambiguous, choose the simpler option and note the choice in a comment. Do not stop to ask unless the choice changes the data model.
5. Never scaffold ahead. Do not create files for Release 2 features while building Release 1.

---

## Hard rules — violating these is a bug, not a preference

### Multi-tenancy
- Every Supabase query touching a tenant table **must** include `.eq('restaurant_id', restaurantId)`.
- `restaurantId` is derived server-side from the slug or the authenticated staff record. Never from a client-supplied body field.
- RLS policies are a backstop, not the primary defence.

### Money
- All pricing math lives in `src/lib/pricing.ts`. No arithmetic on prices anywhere else — not in a component, not in a route handler.
- Store money as `numeric(10,2)` in Postgres, handle as `number` in TS, round with the helpers in `pricing.ts`.
- `POST /api/orders` recomputes the total from item IDs. Any `total` in the request body is ignored.
- `order_items` stores snapshots (`item_name`, `unit_price`, `addons` jsonb). Never join to `menu_items` to price a historic order.

### Orders
- Order creation requires an `idempotency_key` (client-generated UUID, unique constraint in DB). A duplicate returns the existing order with 200, not an error.
- Status transitions are one-directional: `placed → accepted → preparing → ready → served`. `cancelled` is reachable from any state before `served`. Reject invalid transitions with 409.
- Every status change writes a row to `order_events`.

### Security
- The Supabase **service role key is server-only**. If it appears in a file under `components/` or in any `'use client'` file, that is a critical bug.
- Verify the Razorpay webhook signature before mutating payment state.
- QR tokens are `crypto.randomUUID()`-derived, never sequential.
- Rate limit `POST /api/orders` and PIN login per IP.
- Validate every API input with a zod schema. No raw `req.json()` destructuring.

### TypeScript
- `strict: true`. No `any`. No `@ts-ignore`.
- Types live in `src/types/index.ts` and mirror the schema exactly.
- Prefer `type` over `interface` for object shapes.

### React / Next
- Server Components by default. Add `'use client'` only when you need state, effects or event handlers.
- Data fetching for initial page load happens in Server Components. TanStack Query is for client-side refetch and mutations only.
- No `<form>` submit-to-server patterns in client components — use handlers and API routes.
- Loading states are skeletons, not spinners.
- Every list has an empty state with a useful call to action.

### Styling
- Tailwind utility classes only. No CSS modules, no styled-components.
- Use shadcn/ui primitives; do not hand-roll a modal, sheet, or dropdown.
- Mobile first: write base classes for 375px, add `sm:` / `md:` / `lg:` upward.
- Minimum tap target 44px on customer screens, 60px on the kitchen screen.
- Colour is never the only signal. Veg/non-veg needs the square-dot icon, not just green/red.

### Errors
- Every API route returns `{ error: { code, message } }` on failure with a correct HTTP status.
- Never swallow an error. Log it and surface something actionable to the user.
- Wrap every Supabase call's `error` return and handle it.

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files (components) | PascalCase | `MenuItemCard.tsx` |
| Files (everything else) | kebab-case | `order-status.ts` |
| DB tables/columns | snake_case | `menu_items`, `base_price` |
| TS variables | camelCase | `basePrice` |
| Types | PascalCase | `MenuItem`, `OrderStatus` |
| Constants | SCREAMING_SNAKE | `MAX_CART_ITEMS` |
| API routes | kebab-case | `/api/service-requests` |

Map snake_case DB rows to camelCase TS objects in a single mapper per entity, in
`src/lib/mappers.ts`. Do not sprinkle `item.base_price` through components.

---

## What "good" looks like on the two screens that matter

### Customer menu (`/r/[slug]/t/[token]`)
- First contentful paint under 1.5s on 3G. Dish images lazy-loaded and served at the size actually rendered.
- Sticky category tab bar that scroll-spies the sections.
- The cart is a fixed bottom bar showing item count and total, always visible once non-empty.
- Tapping an item opens a bottom sheet, not a new page.
- Out-of-stock items: 40% opacity, "Unavailable" pill, not tappable.

### Kitchen display (`/dashboard/kitchen`)
- Designed for a 10" tablet, read from three feet away. Base font 18px, order numbers 32px.
- Four columns. New orders animate in at the top of column 1 and play a chime.
- Each card shows: order number, table, elapsed time, items with quantity and notes.
- Card border turns amber past 15 minutes, red past 25.
- One primary button per card advances the status. No dropdowns.
- Status changes are optimistic and queue to localStorage when offline; a banner shows "Offline — 3 changes pending" and syncs on reconnect.

---

## Testing expectations

- Unit tests for `lib/pricing.ts` covering: variants, multiple add-ons, per-item tax rates, service charge, packing charge, rounding at boundaries.
- One integration test for order creation including the idempotency path.
- Manual checklist before calling Release 1 done: the "definition of done" list in `plan.md` §8.

---

## Things you should refuse to do

- Add a customer login/signup to the MVP.
- Compute an order total on the client and trust it server-side.
- Join to `menu_items` when displaying a past order's line items.
- Put business logic inside a React component.
- Add a feature from Release 2 or 3 before Release 1's definition of done is fully met.
