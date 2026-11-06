# QBite UML Diagrams

UML views of the system, drawn in Mermaid so they render on GitHub and stay next to the code. They complement [architecture.md](architecture.md), which already holds the **sequence**, **state machine** and **ER** diagrams:

| UML diagram | Where |
|---|---|
| Use case | [§1](#1-use-case-diagram) |
| Class (domain model) | [§2](#2-class-diagram--domain-model) |
| Class (server modules) | [§3](#3-class-diagram--server-modules) |
| Component | [§4](#4-component-diagram) |
| Activity (place an order) | [§5](#5-activity-diagram--post-apiorders) |
| Activity (Razorpay webhook) | [§6](#6-activity-diagram--razorpay-webhook) |
| Deployment | [§7](#7-deployment-diagram) |
| State machine (order) | [architecture.md §2](architecture.md#2-order-lifecycle) |
| Sequence (place order, kitchen) | [architecture.md §3–4](architecture.md#3-flow-a-diner-places-an-order) |
| Entity relationship | [architecture.md §5](architecture.md#5-core-data-model) |

Mermaid has no native use case or deployment syntax, so those two use flowchart notation: stick-figure actors become 👤 nodes, use cases become rounded nodes, and nodes/execution environments become nested boxes.

---

## 1. Use case diagram

Who can do what. Staff roles nest: a manager can do everything a waiter or kitchen user can, and an owner everything a manager can (enforced by `requireRole()` in `src/lib/auth.ts` and the `roles` lists in `DashboardNav.tsx`).

![use case](diagrams/use-case.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart LR
  diner["👤 Diner<br/>(no login)"]
  kitchen["👤 Kitchen staff"]
  waiter["👤 Waiter"]
  manager["👤 Manager"]
  owner["👤 Owner"]
  admin["👤 Platform admin"]
  razorpay["⚙️ Razorpay"]
  claude["⚙️ Claude API"]

  subgraph QBite["QBite system"]
    direction TB
    uc1([Scan table QR & browse menu])
    uc2([Ask the menu assistant])
    uc3([Build cart & place order])
    uc4([Pay online])
    uc5([Track order status])
    uc6([Join a group order])
    uc7([Call waiter / water / bill])

    uc10([Log in with PIN or email])
    uc11([Advance order on kitchen board])
    uc12([View & cancel orders])
    uc13([Resolve service requests])

    uc20([Manage menu & stock])
    uc21([Import menu with AI])
    uc22([Manage tables & print QR codes])
    uc23([Manage staff])
    uc24([View sales reports])
    uc25([Edit restaurant settings])

    uc30([Onboard a restaurant])
  end

  diner --- uc1 & uc2 & uc3 & uc5 & uc6 & uc7
  uc3 -.->|"«extend»"| uc4
  uc4 --- razorpay
  uc2 --- claude
  uc21 --- claude

  kitchen --- uc10 & uc11
  waiter --- uc10 & uc12 & uc13
  manager --- uc20 & uc21 & uc22 & uc23 & uc24
  owner --- uc25
  admin --- uc30

  manager -.->|"«inherits»"| waiter
  manager -.->|"«inherits»"| kitchen
  owner -.->|"«inherits»"| manager
  uc21 -.->|"«include»"| uc20
```

</details>

---

## 2. Class diagram — domain model

The types in `src/types/index.ts`, which mirror `docs/schema.sql`. Fields are trimmed to the ones that matter for behaviour. A few things the diagram shows:
- `OrderItem` holds **no reference to price data** in `MenuItem`. It is a snapshot ([ADR 0002](adr/0002-server-side-pricing-and-snapshots.md)).
- `CartLine` and `PriceBreakdown` are client/compute shapes, not tables.
- Every tenant-owned class carries `restaurantId`.

![class domain model](diagrams/class-domain-model.png)

<details>
<summary>Mermaid source</summary>

```mermaid
classDiagram
  direction LR

  class Restaurant {
    +id: uuid
    +slug: string
    +name: string
    +currency: string
    +timezone: string
    +isActive: boolean
  }
  class RestaurantSettings {
    +restaurantId: uuid
    +acceptsCash: boolean
    +acceptsOnline: boolean
    +serviceChargePct: number
    +packingCharge: number
    +orderNumberPrefix: string
    +autoAcceptOrders: boolean
  }
  class Staff {
    +id: uuid
    +restaurantId: uuid
    +name: string
    +role: StaffRole
    +isActive: boolean
  }
  class RestaurantTable {
    +id: uuid
    +restaurantId: uuid
    +label: string
    +seats: number
    +qrToken: uuid
    +isActive: boolean
  }
  class TableSession {
    +id: uuid
    +tableId: uuid
    +joinCode: string
    +status: open/billed/closed
  }
  class MenuCategory {
    +id: uuid
    +restaurantId: uuid
    +name: string
    +availableFrom: time
    +availableTo: time
    +activeDays: number[]
  }
  class MenuItem {
    +id: uuid
    +restaurantId: uuid
    +name: string
    +basePrice: number
    +foodType: FoodType
    +spiceLevel: 0..3
    +taxRate: number
    +isAvailable: boolean
  }
  class ItemVariant {
    +id: uuid
    +name: string
    +priceDelta: number
    +isDefault: boolean
  }
  class AddonGroup {
    +id: uuid
    +name: string
    +minSelect: number
    +maxSelect: number
  }
  class Addon {
    +id: uuid
    +name: string
    +price: number
  }
  class Order {
    +id: uuid
    +restaurantId: uuid
    +orderNumber: string
    +orderType: OrderType
    +status: OrderStatus
    +subtotal: number
    +taxTotal: number
    +serviceCharge: number
    +total: number
    +paymentStatus: PaymentStatus
    +placedAt: timestamp
  }
  class OrderItem {
    +itemName: string «snapshot»
    +variantName: string «snapshot»
    +unitPrice: number «snapshot»
    +addons: json «snapshot»
    +taxRate: number «snapshot»
    +quantity: number
    +lineTotal: number
    +notes: string
  }
  class OrderEvent {
    +orderId: uuid
    +status: OrderStatus
    +staffId: uuid
    +createdAt: timestamp
  }
  class ServiceRequest {
    +tableId: uuid
    +type: ServiceRequestType
    +status: open/resolved
  }

  class OrderStatus {
    <<enumeration>>
    placed
    accepted
    preparing
    ready
    served
    cancelled
  }
  class StaffRole {
    <<enumeration>>
    owner
    manager
    kitchen
    waiter
  }
  class FoodType {
    <<enumeration>>
    veg
    non_veg
    egg
  }

  class CartLine {
    <<value object>>
    +lineId: string
    +itemId: uuid
    +basePrice: number
    +variantPriceDelta: number
    +addons: SelectedAddon[]
    +quantity: number
  }
  class PriceBreakdown {
    <<value object>>
    +subtotal: number
    +taxTotal: number
    +serviceCharge: number
    +packingCharge: number
    +total: number
    +lines: PricedLine[]
  }

  Restaurant "1" *-- "1" RestaurantSettings
  Restaurant "1" *-- "*" Staff
  Restaurant "1" *-- "*" RestaurantTable
  Restaurant "1" *-- "*" MenuCategory
  Restaurant "1" *-- "*" MenuItem
  Restaurant "1" *-- "*" AddonGroup
  Restaurant "1" *-- "*" Order
  MenuCategory "0..1" o-- "*" MenuItem
  MenuItem "1" *-- "*" ItemVariant
  MenuItem "*" -- "*" AddonGroup
  AddonGroup "1" *-- "*" Addon
  RestaurantTable "1" -- "*" TableSession
  RestaurantTable "0..1" -- "*" Order : placed at
  TableSession "0..1" -- "*" Order : groups
  RestaurantTable "1" -- "*" ServiceRequest
  Order "1" *-- "1..*" OrderItem
  Order "1" *-- "*" OrderEvent : audit log
  Staff "0..1" -- "*" OrderEvent : changed by
  Order ..> OrderStatus
  Staff ..> StaffRole
  MenuItem ..> FoodType
  CartLine ..> MenuItem : copied from
  PriceBreakdown ..> CartLine : computed from
  OrderItem ..> CartLine : snapshot of
```

</details>

---

## 3. Class diagram — server modules

The modules are plain TypeScript modules, not classes, so each box is drawn as a «module» with its exported functions. Arrows are "uses" dependencies. The important property is direction: route handlers depend on `lib/`, `lib/` never depends on routes, and **only `pricing.ts` does money arithmetic**.

![class server modules](diagrams/class-server-modules.png)

<details>
<summary>Mermaid source</summary>

```mermaid
classDiagram
  direction TB

  class OrdersRoute {
    <<route handler>>
    POST /api/orders
    GET /api/orders
  }
  class OrderStatusRoute {
    <<route handler>>
    PATCH /api/orders/:orderId/status
  }
  class KitchenBoardRoute {
    <<route handler>>
    GET /api/kitchen/board
  }
  class MenuChatRoute {
    <<route handler>>
    POST /api/ai/menu-chat
  }
  class MenuExtractRoute {
    <<route handler>>
    POST /api/ai/menu-extract
  }
  class WebhookRoute {
    <<route handler>>
    POST /api/payments/webhook
  }

  class pricing {
    <<module>>
    +roundMoney(value) number
    +computeUnitPrice(...) number
    +priceLine(line) PricedLine
    +priceCart(lines, options) PriceBreakdown
    +estimateReadyAt(lines, placedAt) Date
    +formatMoney(value, currency) string
  }
  class auth {
    <<module>>
    +getStaffSession() StaffSession
    +setSessionCookie(session)
    +clearSessionCookie()
    +requireRole(roles) NextResponse
  }
  class rateLimit {
    <<module>>
    +checkRateLimit(key, limit, windowMs) boolean
  }
  class orderPrivacy {
    <<module>>
    +orderIdSchema
    +toGuestOrder(order) Order
  }
  class mappers {
    <<module>>
    +toOrder(row) Order
    +toMenuItem(row) MenuItem
    +toStaff() / toTable() / ... one per entity
  }
  class domainTypes {
    <<module>>
    +ORDER_FLOW
    +canTransition(from, to) boolean
  }
  class queries {
    <<module>>
    +fetchPublicMenu(slug, token)
    +fetchMenuCatalog(restaurantId)
    +fetchKitchenBoard(restaurantId)
    +fetchOrder(orderId)
  }
  class supabaseServer {
    <<module, server-only>>
    +createServerClient() service-role client
  }
  class guardrails {
    <<module>>
    +isAiFeatureEnabled(feature)
    +enforceAiRateLimits(rules)
    +sanitizeUserText(text)
    +wrapUntrusted(tag, text)
    +fileMatchesDeclaredType(bytes, type)
    +containsHealthClaim(text)
    +redactCurrencyAmounts(text)
  }
  class menuAssistant {
    <<module>>
    +runMenuAssistant(client, menu, history) AssistantReply
    -search_menu tool
    -get_item_details tool
    -suggest_items tool
  }
  class menuOnboarding {
    <<module>>
    +ExtractionSchema
    +reconcileDraft(extraction, catalog) MenuDraft
  }
  class aiClient {
    <<module>>
    +getAnthropicClient() Anthropic
    +AI_MODELS
    +FALLBACK_PARAMS
  }

  OrdersRoute ..> rateLimit
  OrdersRoute ..> pricing
  OrdersRoute ..> mappers
  OrdersRoute ..> supabaseServer
  OrderStatusRoute ..> auth
  OrderStatusRoute ..> domainTypes
  OrderStatusRoute ..> supabaseServer
  KitchenBoardRoute ..> auth
  KitchenBoardRoute ..> queries
  MenuChatRoute ..> guardrails
  MenuChatRoute ..> queries
  MenuChatRoute ..> menuAssistant
  MenuExtractRoute ..> auth
  MenuExtractRoute ..> guardrails
  MenuExtractRoute ..> menuOnboarding
  MenuExtractRoute ..> queries
  WebhookRoute ..> supabaseServer
  menuAssistant ..> aiClient
  menuAssistant ..> pricing
  menuAssistant ..> guardrails
  menuOnboarding ..> pricing
  menuOnboarding ..> guardrails
  guardrails ..> rateLimit
  queries ..> mappers
  queries ..> supabaseServer
```

</details>

---

## 4. Component diagram

The deployable pieces and the interfaces between them. The dashed boundary is the trust boundary: everything in the browser is untrusted, and the service-role key exists only inside the server components.

![component](diagrams/component.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TB
  subgraph Browser["«device» Browser (untrusted)"]
    direction LR
    CustomerUI["«component»<br/>Customer menu & checkout<br/>/r/[slug]/t/[token]"]
    CartStore["«component»<br/>Cart store (Zustand + localStorage)<br/>holds idempotencyKey"]
    Tracker["«component»<br/>Order tracker<br/>/order/[orderId]"]
    KitchenUI["«component»<br/>Kitchen display<br/>+ offline queue"]
    DashboardUI["«component»<br/>Staff dashboard"]
    AdminUI["«component»<br/>Platform admin"]
    CustomerUI --> CartStore
  end

  subgraph Server["«execution env» Next.js server (trusted)"]
    direction LR
    MW["«component»<br/>middleware.ts<br/>guards /dashboard, /admin"]
    RSC["«component»<br/>Server Components<br/>initial page data"]
    OrdersAPI["«component»<br/>Orders API"]
    StaffAPI["«component»<br/>Staff & menu APIs"]
    KitchenAPI["«component»<br/>Kitchen board API"]
    PayAPI["«component»<br/>Payments API + webhook"]
    AIAPI["«component»<br/>AI APIs + guardrails"]
    Core["«component»<br/>lib/: pricing, auth,<br/>mappers, queries, rate-limit"]
    OrdersAPI & StaffAPI & KitchenAPI & PayAPI & AIAPI & RSC --> Core
  end

  subgraph Supabase["«external system» Supabase"]
    PG[("PostgreSQL<br/>+ RLS + create_order RPC")]
    Storage[("Storage<br/>logos, dish images")]
    Realtime["Realtime"]
    AuthSvc["Auth"]
  end

  Razorpay["«external system»<br/>Razorpay"]
  Claude["«external system»<br/>Claude API"]

  CustomerUI -- "HTTPS JSON: IOrders" --> OrdersAPI
  CustomerUI -- "IMenuChat" --> AIAPI
  Tracker -- "poll GET order" --> OrdersAPI
  KitchenUI -- "poll board / PATCH status" --> KitchenAPI
  KitchenUI -.->|"change nudge"| Realtime
  DashboardUI -- "session cookie" --> StaffAPI
  AdminUI --> StaffAPI
  Browser -.->|"page requests"| MW --> RSC

  Core -- "service-role key" --> PG
  Core --> Storage
  StaffAPI --> AuthSvc
  PayAPI -- "create order" --> Razorpay
  Razorpay -- "signed webhook" --> PayAPI
  AIAPI -- "Messages API" --> Claude
  CustomerUI -- "checkout modal" --> Razorpay
```

</details>

---

## 5. Activity diagram — `POST /api/orders`

Every decision the route makes, in order (`src/app/api/orders/route.ts`, "Step 1" to "Step 9"). Swimlanes: the route handler and Postgres. Note the two idempotency exits that both return **200** with the existing order.

![activity place order](diagrams/activity-place-order.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TD
  start((●)) --> rl{"Rate limit OK?<br/>20/min per IP"}
  rl -- no --> e429[/"429 RATE_LIMITED"/] --> stop
  rl -- yes --> json{"Body is JSON<br/>and passes zod?"}
  json -- no --> e400a[/"400 INVALID_JSON /<br/>VALIDATION_ERROR"/] --> stop
  json -- yes --> rest{"Restaurant for slug<br/>exists and active?"}
  rest -- no --> e404[/"404 RESTAURANT_NOT_FOUND"/] --> stop
  rest -- yes --> table{"Table token belongs<br/>to this restaurant?"}
  table -- no --> e400b[/"400 TABLE_NOT_FOUND"/] --> stop
  table -- yes --> idem{"Order with this<br/>idempotency key exists?"}
  idem -- yes --> ok200a[/"200 existing order"/] --> stop
  idem -- no --> load["Load all referenced items<br/>in one query"]
  load --> valid{"Every item, variant and<br/>add-on exists and is available?"}
  valid -- no --> e400c[/"400 ITEM_NOT_FOUND /<br/>ITEM_UNAVAILABLE / ..."/] --> stop
  valid -- yes --> price["Build CartLines from DB prices<br/>priceCart() → PriceBreakdown<br/>(client prices ignored)"]
  price --> snap["Build order_items snapshots"]
  snap --> sess{"Group sessionId given?"}
  sess -- "yes, not open" --> e400d[/"400 SESSION_NOT_FOUND"/] --> stop
  sess -- "no / valid" --> rpc

  subgraph PG["Postgres transaction: create_order()"]
    rpc["Lock restaurant (advisory)<br/>next_order_number()"] --> ins["INSERT orders, order_items,<br/>first order_events row"]
  end

  ins --> uniq{"23505 unique<br/>violation?"}
  uniq -- yes --> race["Fetch the order the<br/>concurrent request created"] --> ok200b[/"200 existing order"/] --> stop
  uniq -- "other error" --> e500[/"500 CREATE_FAILED"/] --> stop
  uniq -- no --> pay{"paymentMethod =<br/>razorpay?"}
  pay -- yes --> rz["Create Razorpay order<br/>(failure is not an error:<br/>guest can retry payment)"] --> ok201
  pay -- no --> ok201[/"201 new order"/] --> stop((◉))
```

</details>

---

## 6. Activity diagram — Razorpay webhook

Payment state only changes after the signature is verified, and the handler is safe to receive the same event twice: a replay finds the row by its updated `payment_ref` and sees it is already paid (`src/app/api/payments/webhook/route.ts`).

![activity razorpay webhook](diagrams/activity-razorpay-webhook.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TD
  start((●)) --> secret{"Webhook secret<br/>configured?"}
  secret -- no --> e500[/"500 NOT_CONFIGURED"/] --> stop
  secret -- yes --> hmac["HMAC-SHA256(raw body, secret)"]
  hmac --> cmp{"timingSafeEqual with<br/>x-razorpay-signature?"}
  cmp -- no --> e400[/"400 invalid signature"/] --> stop
  cmp -- yes --> json{"Body is valid JSON?"}
  json -- no --> e400j[/"400 INVALID_JSON"/] --> stop
  json -- yes --> kind{"payment.captured or<br/>payment.failed with ids?"}
  kind -- no --> ack[/"200 acknowledge, no change"/] --> stop
  kind -- yes --> find{"Order found by<br/>payment_ref?"}
  find -- "lookup error" --> e500b[/"500 DB_ERROR<br/>(Razorpay retries)"/] --> stop
  find -- "not found" --> ack2[/"200, logged<br/>(no endless retries)"/] --> stop
  find -- yes --> paid{"Already paid?"}
  paid -- yes --> dup[/"200 no-op (duplicate delivery)"/] --> stop
  paid -- no --> ev{"Event type"}
  ev -- captured --> cap["payment_status = paid<br/>payment_ref = payment id"]
  ev -- failed --> fail["payment_status = failed"]
  cap & fail --> wr{"Update succeeded?"}
  wr -- no --> e500c[/"500 DB_ERROR<br/>(Razorpay retries)"/] --> stop
  wr -- yes --> ok[/"200 OK"/] --> stop((◉))
```

</details>

The response codes are deliberate: a **500 asks Razorpay to retry** (used when a captured payment could be lost), while a 200 stops retries for events that can never succeed.

---

## 7. Deployment diagram

Where each piece runs in production.

![deployment](diagrams/deployment.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart LR
  subgraph Phone["«device» Diner's phone"]
    B1["Browser<br/>customer pages"]
  end
  subgraph Tablet["«device» Kitchen tablet (10″)"]
    B2["Browser / PWA<br/>kitchen display<br/>localStorage offline queue"]
  end
  subgraph Laptop["«device» Staff laptop / phone"]
    B3["Browser<br/>dashboard"]
  end

  subgraph Vercel["«cloud» Vercel"]
    direction TB
    Edge["«edge runtime»<br/>middleware.ts"]
    CDN["«CDN»<br/>static assets, images"]
    Fn["«serverless functions»<br/>Server Components + /api/* routes<br/>env: SUPABASE_SERVICE_ROLE_KEY,<br/>ANTHROPIC_API_KEY, RAZORPAY_*"]
  end

  subgraph SB["«cloud» Supabase"]
    direction TB
    DB[("PostgreSQL<br/>schema + RLS + RPCs")]
    RT["Realtime"]
    ST[("Storage")]
    AU["Auth"]
  end

  RZ["«cloud» Razorpay"]
  AN["«cloud» Anthropic API"]

  B1 & B2 & B3 -- "HTTPS" --> Edge --> Fn
  B1 & B2 & B3 -- "HTTPS" --> CDN
  B2 -.->|"WebSocket (nudge only)"| RT
  Fn -- "HTTPS / PostgREST" --> DB
  Fn --> ST
  Fn --> AU
  Fn -- "HTTPS" --> RZ
  RZ -- "webhook" --> Fn
  Fn -- "HTTPS" --> AN
```

</details>

**Deployment notes**
- Secrets live only in Vercel's server environment. `NEXT_PUBLIC_*` variables (Supabase URL, anon key, Razorpay key id) are the only values shipped to browsers.
- Serverless instances don't share memory, so the in-memory rate limiter in `src/lib/rate-limit.ts` is per instance. Moving it to Redis is listed in [architecture.md §8](architecture.md#8-known-gaps).
