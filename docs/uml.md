# QBite UML Diagrams

Every UML view of the system in one place, drawn in Mermaid so it renders on GitHub and stays next to the code. The diagrams follow the usual UML order: **requirements** (what the system does for whom), **structure** (what it is made of) and **behaviour** (what happens over time). For the narrative, scaling limits and failure modes, see [architecture.md](architecture.md).

| # | Diagram | UML type |
|---|---|---|
| | **Part 1 — Requirements** | |
| [1](#1-use-case-diagram) | Actors and what they can do | Use case |
| | **Part 2 — Structure** | |
| [2](#2-class-diagram--domain-model) | Domain model | Class |
| [3](#3-class-diagram--server-modules) | Server modules | Class |
| [4](#4-component-diagram) | Browser, server and external systems | Component |
| [5](#5-deployment-diagram) | Where it runs in production | Deployment |
| | **Part 3 — Behaviour** | |
| [6](#6-state-machine--order-lifecycle) | Order lifecycle | State machine |
| [7](#7-activity-diagram--post-apiorders) | `POST /api/orders` | Activity |
| [8](#8-activity-diagram--razorpay-webhook) | Razorpay webhook | Activity |
| [9.1](#91-diner-places-an-order) | Diner places an order | Sequence |
| [9.2](#92-kitchen-advances-an-order) | Kitchen advances an order | Sequence |
| [9.3](#93-owner-login-and-session) | Owner login and session | Sequence |
| [9.4](#94-ai-menu-import) | AI menu import | Sequence |
| [9.5](#95-owner-marks-a-dish-out-of-stock) | Owner marks a dish out of stock | Sequence |
| [A](#appendix--data-model-er) | Data model | ER (not UML) |

Mermaid has no native use case or deployment syntax, so those two use flowchart notation: actors become 👤 nodes, use cases become rounded nodes, and nodes/execution environments become nested boxes.

---

## Part 1 — Requirements

### 1. Use case diagram

Who can do what. Staff roles nest: a manager can do everything a waiter or kitchen user can, and an owner everything a manager can (enforced by `requireRole()` in `src/lib/auth.ts` and the `roles` lists in `DashboardNav.tsx`).

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

---

## Part 2 — Structure

How the system is built: the data it holds, the code that handles it, and where it runs.

### 2. Class diagram — domain model

The types in `src/types/index.ts`, which mirror `docs/schema.sql`. Fields are trimmed to the ones that matter for behaviour. A few things the diagram shows:
- `OrderItem` holds **no reference to price data** in `MenuItem`. It is a snapshot ([ADR 0002](adr/0002-server-side-pricing-and-snapshots.md)).
- `CartLine` and `PriceBreakdown` are client/compute shapes, not tables.
- Every tenant-owned class carries `restaurantId`.

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

### 3. Class diagram — server modules

The modules are plain TypeScript modules, not classes, so each box is drawn as a «module» with its exported functions. Arrows are "uses" dependencies. The important property is direction: route handlers depend on `lib/`, `lib/` never depends on routes, and **only `pricing.ts` does money arithmetic**.

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

### 4. Component diagram

The deployable pieces and the interfaces between them. The dashed boundary is the trust boundary: everything in the browser is untrusted, and the service-role key exists only inside the server components.

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

### 5. Deployment diagram

Where each piece runs in production.

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

**Deployment notes**
- Secrets live only in Vercel's server environment. `NEXT_PUBLIC_*` variables (Supabase URL, anon key, Razorpay key id) are the only values shipped to browsers.
- Serverless instances don't share memory, so the in-memory rate limiter in `src/lib/rate-limit.ts` is per instance. Moving it to Redis is listed in [architecture.md §8](architecture.md#8-known-gaps).

---

## Part 3 — Behaviour

How the system acts over time: the life of an order, the decisions a request goes through, and who talks to whom.

### 6. State machine — order lifecycle

Transitions are defined once, in `ORDER_FLOW` (`src/types/index.ts`), and used by both the API and the kitchen UI. Any other transition is rejected with **409**. An update applies only if the order is still in the status it was checked against (compare-and-set), and every change appends a row to `order_events` ([ADR 0004](adr/0004-order-state-machine.md)).

```mermaid
stateDiagram-v2
  [*] --> placed: POST /api/orders
  placed --> accepted
  accepted --> preparing
  preparing --> ready
  ready --> served
  served --> [*]

  placed --> cancelled
  accepted --> cancelled
  preparing --> cancelled
  ready --> cancelled
  cancelled --> [*]
```

### 7. Activity diagram — `POST /api/orders`

Every decision the route makes, in order (`src/app/api/orders/route.ts`, "Step 1" to "Step 9"). Swimlanes: the route handler and Postgres. Note the two idempotency exits that both return **200** with the existing order.

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

### 8. Activity diagram — Razorpay webhook

Payment state only changes after the signature is verified, and the handler is safe to receive the same event twice: a replay finds the row by its updated `payment_ref` and sees it is already paid (`src/app/api/payments/webhook/route.ts`).

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

The response codes are deliberate: a **500 asks Razorpay to retry** (used when a captured payment could be lost), while a 200 stops retries for events that can never succeed.

### 9. Sequence diagrams

Five flows, grouped by who starts them. The step-by-step reasoning for 9.1 and 9.2 is in [architecture.md §3–4](architecture.md#3-flow-a-diner-places-an-order).

#### 9.1 Diner places an order

Server-side repricing, the idempotency fast path and race backstop, payment, and the order tracker ([ADR 0002](adr/0002-server-side-pricing-and-snapshots.md), [ADR 0003](adr/0003-idempotent-order-creation.md)).

```mermaid
sequenceDiagram
  autonumber
  actor D as Diner phone
  participant P as Menu page (server)
  participant C as Cart (browser, Zustand)
  participant O as POST /api/orders
  participant DB as Postgres
  participant R as Razorpay
  participant W as Payment webhook
  participant T as GET /api/orders/[id]

  D->>P: GET /r/[slug]/t/[token]
  P->>DB: restaurant by slug, table by QR token, menu
  P-->>D: HTML with menu already rendered
  D->>C: add items (idempotency key created on first item)
  C-->>D: running total via pricing.ts (display only)
  D->>O: item IDs, variants, add-ons, quantities, idempotency key
  Note over O: rate limit per IP, validate with zod
  O->>DB: resolve restaurant from slug and table from token
  O->>DB: existing order with this key?
  alt key already used
    O-->>D: 200 with the existing order
  else new key
    O->>DB: load items scoped to restaurant, check availability
    Note over O: reprice from DB rows with priceCart(). Client total ignored.
    O->>DB: create_order RPC (order + snapshot lines + first event, one transaction)
    alt unique violation (concurrent duplicate)
      O->>DB: fetch the order the other request created
      O-->>D: 200 with that order
    else created
      opt pay online
        O->>R: create payment order for the server-computed amount
      end
      O-->>D: 201 with order (+ Razorpay details)
    end
  end
  opt pay online
    D->>R: pay in Razorpay checkout
    R->>W: payment.captured / payment.failed
    Note over W: verify HMAC signature first. Replays are no-ops.
    W->>DB: set payment_status
  end
  loop every 15 s while the page is visible
    D->>T: refresh order tracker
    T->>DB: load order
    T-->>D: status, redacted to what a guest may see
  end
```

#### 9.2 Kitchen advances an order

Tenant-scoped polling with Realtime only as a nudge, an optimistic tap, and a compare-and-set update ([ADR 0007](adr/0007-kitchen-board-polling.md), [ADR 0008](adr/0008-offline-kitchen-display.md)).

```mermaid
sequenceDiagram
  autonumber
  actor K as Kitchen tablet
  participant MW as Middleware
  participant KP as Kitchen page (server)
  participant KD as KitchenDisplay (browser)
  participant B as GET /api/kitchen/board
  participant S as PATCH /api/orders/[id]/status
  participant DB as Postgres

  K->>MW: GET /dashboard/kitchen
  Note over MW: staff cookie present? If not, redirect to /login
  MW->>KP: continue
  KP->>DB: verify session against staff row, load board
  KP-->>K: HTML with current orders
  KP->>KD: initialOrders as props

  loop every 8 s (sooner if Realtime nudges)
    KD->>B: poll
    B->>DB: active orders for the session's restaurant
    B-->>KD: board (ignored if a local tap happened meanwhile)
  end

  K->>KD: tap "Accept"
  KD->>KD: move card now (optimistic)
  alt online
    KD->>S: status = accepted
    Note over S: role check, zod, canTransition()
    S->>DB: UPDATE ... WHERE id AND restaurant_id AND status = 'placed'
    alt a row matched
      S->>DB: INSERT order_events
      S-->>KD: 200
    else zero rows (changed elsewhere)
      S-->>KD: 409, card rolls back
    end
  else offline
    KD->>KD: queue change in localStorage, show "Offline — N changes pending"
    Note over KD: on reconnect replay the queue. 409 or 404 means the server wins.
  end
```

#### 9.3 Owner login and session

Email login goes through Supabase Auth, but the session the app trusts is its own signed cookie. Middleware only checks that the cookie **exists**. The signature and the staff row are checked on **every** server request, so a removed or demoted staff member loses access right away (`src/app/api/auth/login/route.ts`, `src/lib/auth.ts`, `src/middleware.ts`; [ADR 0006](adr/0006-staff-sessions.md)).

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner (browser)
  participant L as POST /api/auth/login
  participant SA as Supabase Auth
  participant DB as Postgres
  participant MW as Middleware
  participant D as Dashboard page / API route

  O->>L: { method: "email", email, password }
  Note over L: validate with zod
  L->>SA: signInWithPassword
  alt Auth unreachable or 5xx / 429
    SA-->>L: error
    L-->>O: 503 AUTH_UNAVAILABLE (not "wrong password")
  else wrong email or password (4xx)
    SA-->>L: error
    L-->>O: 401 INVALID_CREDENTIALS
  else signed in
    SA-->>L: user
    L->>DB: staff row for this auth user,<br/>role owner/manager, is_active
    alt no active staff row
      L-->>O: 403 NOT_STAFF
    else found
      Note over L: sign {staffId, restaurantId, role, exp: 8h}<br/>with HMAC-SHA256
      L-->>O: 200 + Set-Cookie qbite-staff (HttpOnly, SameSite=Lax)
    end
  end

  O->>MW: GET /dashboard/menu
  alt no qbite-staff cookie
    MW-->>O: redirect /login?next=/dashboard/menu
  else cookie present
    MW->>D: continue
    D->>D: getStaffSession(): verify signature and expiry
    D->>DB: staff still active? read current role
    alt invalid, expired or staff removed
      D-->>O: treated as signed out (401 / redirect)
    else valid
      Note over D: role comes from DB, not the cookie.<br/>restaurantId scopes every query.
      D-->>O: page rendered for this restaurant
    end
  end
```

#### 9.4 AI menu import

The model only drafts. Code checks the request before the model is called and checks the result after. The owner fixes anything uncertain, and the save goes through the same menu APIs and validation as a hand-made dish (`src/app/api/ai/menu-extract/route.ts`, `MenuExtractDialog.tsx`; [ADR 0009](adr/0009-ai-as-untrusted-component.md)).

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant UI as MenuExtractDialog (browser)
  participant X as POST /api/ai/menu-extract
  participant G as guardrails.ts
  participant DB as Postgres
  participant C as Claude API
  participant M as POST /api/menu/categories<br/>POST /api/menu/items

  O->>UI: choose menu photo or PDF
  UI->>X: multipart upload
  X->>X: requireRole(owner, manager)<br/>restaurantId from session
  X->>G: kill switch on? rate limit<br/>(10/h per restaurant, 20/h per IP)
  alt disabled or limited
    X-->>UI: 503 / 429
  end
  X->>G: type, size ≤ 10 MB,<br/>magic bytes match declared type
  alt bad file
    X-->>UI: 400
  end
  X->>DB: fetchMenuCatalog(restaurantId)<br/>existing categories and dishes
  X->>C: image + system prompt<br/>(menu text is untrusted data),<br/>structured output schema
  C-->>X: extraction JSON
  alt refusal, cut off, invalid JSON or "not a menu"
    X-->>UI: error with a clear message
  else valid
    X->>X: zod re-validate, then reconcileDraft():<br/>• match existing categories<br/>• flag duplicates by name<br/>• round and range-check prices (pricing.ts)<br/>• veg only from a printed marker<br/>• drop AI text with health claims
    X-->>UI: 200 { draft }  (nothing saved yet)
  end

  UI-->>O: review screen: duplicates unticked,<br/>missing price / veg marker flagged
  O->>UI: fill missing prices and food types, untick
  Note over UI: Import is disabled while any<br/>selected dish is missing price or food type
  O->>UI: Import
  loop each selected category
    opt category is new
      UI->>M: create category
    end
    loop each selected dish
      UI->>M: create item (zod, requireRole,<br/>category must belong to restaurant)
      M->>DB: INSERT scoped to restaurant_id
    end
  end
  UI-->>O: "N imported, M failed" (failures are counted, not hidden)
```

#### 9.5 Owner marks a dish out of stock

The toggle is optimistic and rolls back if the request fails. Diners see the change on their next menu load. A diner who already has the dish in their cart can't order it, because order creation re-checks availability on the server (`ItemList.tsx`, `src/app/api/menu/items/[id]/route.ts`, `src/app/api/orders/route.ts`).

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant UI as Menu manager (browser)
  participant P as PATCH /api/menu/items/[id]
  participant DB as Postgres
  actor D as Diner
  participant MP as Menu page (server)
  participant OR as POST /api/orders

  O->>UI: toggle "Available" off
  UI->>UI: update the list immediately (optimistic)
  UI->>P: { isAvailable: false }
  P->>P: requireRole(owner, manager), zod
  P->>DB: does the item belong to session.restaurantId?
  alt not this restaurant's item
    P-->>UI: 404
  else owned
    P->>DB: UPDATE menu_items SET is_available = false<br/>WHERE id AND restaurant_id
    P-->>UI: 200
  end
  alt request failed
    UI->>UI: roll back the toggle
    UI-->>O: toast "Couldn't update … still available"
  end

  D->>MP: open or reload the menu
  MP->>DB: menu for slug + table token
  MP-->>D: dish shown at 40% opacity,<br/>"Unavailable", not tappable

  D->>OR: order from a cart filled earlier with that dish
  OR->>DB: load items, check is_available
  OR-->>D: 400 ITEM_UNAVAILABLE (no order created)
```

---

## Appendix — Data model (ER)

Not a UML diagram, but the class diagram in §2 maps onto these tables. Full version with notes: [architecture.md §5](architecture.md#5-core-data-model).

![ER diagram](diagrams/er-data-model.png)
