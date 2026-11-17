# QBite — System Design Interview Q&A (HLD + LLD)

A drill pack. Each item is **they ask → you say → they push → you hold**. Say the
answers out loud until they're yours. Keep the first answer short; let the pushback pull
more out of you. The concepts and code pointers are in [system-design.md](system-design.md);
this is the spoken version.

**Rule for the whole interview:** answer in one or two sentences, then stop. The follow-up
is where you score. Don't dump everything at once.

---

## 0. The opener — "Walk me through the design"

> "QBite is a QR-ordering platform. A diner scans the QR on their table, the menu opens in
> their phone browser — no app, no login — they order, and it shows on the kitchen screen in
> a few seconds. One deployment serves many restaurants.
>
> It's a Next.js app on Vercel with Postgres behind it. Three kinds of users: diners (no
> login, identified by the table's QR token), staff (PIN or password login), and a platform
> admin. The two screens that matter are the **diner menu** and the **kitchen display**.
>
> The three things I'd defend hardest: **money is always computed on the server**, **orders
> are created exactly once** even under double-taps, and **order status can't be corrupted by
> two devices racing**. I can go deep on any of those."

**They push: "Why one shared database instead of one per restaurant?"**
> "Operational simplicity, and platform queries stay cheap — the admin can count orders
> across all restaurants with one query. The cost is a noisy-neighbour risk. I isolate
> tenants with a `restaurant_id` column on every row, and I derive that ID on the server, not
> from the request body. If one restaurant got huge, that same column lets me move it to its
> own database without a rewrite."

---

## HLD drills

### H1. Multi-tenancy
**Ask: "How do you keep one restaurant from seeing another's data?"**
> "Every tenant table has a `restaurant_id`. Every query filters on it. The important part:
> the server *derives* that ID — from the URL slug for diners, from the signed staff session
> for staff — it never trusts a restaurant ID sent in the request body."

**Push: "You use the service-role key, which bypasses row-level security. Isn't that risky?"**
> "Yes, so RLS is my backstop, not my main defence. The real guarantee is that every server
> query carries the `restaurant_id` filter. In this codebase an unscoped tenant query is
> treated as a bug, not a style issue. RLS is the second lock in case I ever slip."

### H2. Scaling & the real bottleneck
**Ask: "Where does this break first under load?"**
> "Not where people expect. It's not order writes — that's about 17 a second at a thousand
> restaurants. It's **polling reads**. Kitchen screens and diner trackers keep asking 'anything
> new?'. Reads beat writes about fifty to one. Idle screens are the load."

**Push: "So how do you fix that?"**
> "In order of effort. First, return 'nothing changed' cheaply — a 304 keyed off the last
> order-event. Second, cache each restaurant's board for a second or two, so ten screens in
> one restaurant cost one query. Third, replace polling with server-sent events: one process
> holds the service role and pushes changes per restaurant. At a hundred thousand restaurants,
> polling would be eighty thousand reads a second — you *have* to push."

**Push: "And the writes at that scale?"**
> "Writes only go to about seventeen hundred a second — a single tuned Postgres primary with
> connection pooling handles that. The write tier barely moves. The whole scaling story is
> about reads."

### H3. Serverless + a connection-limited database
**Ask: "Serverless functions can spike to hundreds of instances. Won't you exhaust Postgres
connections?"**
> "That's the classic trap, but it doesn't bite here. The client talks to Postgres over HTTP
> through PostgREST, which pools the connections. So a few hundred function instances don't
> open a few hundred database connections. If I had a path that bypassed that, I'd put
> PgBouncer in front in transaction-pooling mode."

### H4. Caching
**Ask: "What do you cache, and what do you refuse to cache?"**
> "I cache the menu hard — it's read constantly and changes rarely. I use a tagged data
> cache and bust it the moment the owner edits the menu, not on a timer. I deliberately do
> *not* cache order status or the kitchen board — those have to be fresh, so they're read
> live every time. Rule of thumb: cache the catalogue, never the order."

**Push: "At scale?"**
> "The menu page is basically static per restaurant per menu-version, so I'd put it and the
> dish images on a CDN and bust by version. And I'd cache today's dashboard numbers in Redis,
> invalidated when a new order event lands."

### H5. Consistency / CAP
**Ask: "What's your consistency model?"**
> "Single Postgres primary, so strong consistency on the order path. For writes I lean CP —
> if I had to choose, I'd rather reject a conflicting order update than accept two conflicting
> ones. Money and order state don't get to be eventually consistent."

**Push: "Then why would you ever add read replicas?"**
> "Only for reads that can tolerate staleness — reports, dashboards. Those go to a replica;
> order writes and the tracker's first read stay on the primary. I'd be trading strong for
> eventual consistency *only* where it's safe, and I'd say so explicitly."

### H6. Idempotency
**Ask: "A diner double-taps 'Place order' on a flaky connection. What happens?"**
> "One order. The client makes a UUID key when the first item goes in the cart, and sends it
> with the order. The server checks for an existing order with that key first — if it finds
> one, it returns it with a 200, not an error."

**Push: "Two taps arrive at the exact same millisecond and both pass that check."**
> "Then the database catches it. There's a unique constraint on the key, so one insert wins
> and the other gets a unique-violation, re-reads the winning order, and returns that with a
> 200. The race is made *safe*, not prevented. The caller can't tell the difference — they
> always get the one real order."

### H7. Rate limiting under failure
**Ask: "How do you rate limit, and what happens when the rate limiter's backend is down?"**
> "Fixed-window counter on order creation and PIN login. It uses Redis so every serverless
> instance shares one counter. The key decision is the failure mode: if Redis is slow or down,
> I **fail open** to a weaker per-instance in-memory limit — and log it. I never fail closed."

**Push: "Failing open sounds like a security hole."**
> "It's a deliberate trade. Failing closed means a Redis blip stops a restaurant taking
> orders — that's worse for the business than a minute of weaker limiting. It's never *no*
> limit, just a weaker one, and it's logged so I know it happened. For real abuse I'd add
> edge/WAF limiting in front and a per-tenant limit, not just per-IP."

### H8. Payments / trust boundary
**Ask: "How do you know a payment actually succeeded?"**
> "I never trust the browser's 'payment succeeded' callback. Payment state only changes from
> Razorpay's webhook, and I verify its HMAC signature before any write. A forged or replayed
> webhook does nothing — a replay just finds the order already updated."

### H9. Why not WebSockets / realtime?
**Ask: "A kitchen screen screams for realtime push. Why are you polling?"**
> "I wanted to, and it's a good story. Supabase Realtime filters rows through row-level
> security using the auth user ID. But my staff log in with a signed cookie — so shared
> tablets can use a PIN — which means to the database the browser is anonymous and gets zero
> rows. So realtime handed the kitchen nothing. The reliable path is a server route that reads
> with the service role and scopes to the session's restaurant. I kept realtime only as a
> nudge to poll sooner. At scale I'd replace polling with server-sent events from a backend
> process, which sidesteps the same problem."

*(This is a strong answer because it shows you hit a real wall and reasoned around it, not a
textbook choice.)*

---

## LLD drills

### L1. The order state machine
**Ask: "How do you model order status?"**
> "As a state machine defined in one place — a table of which statuses can follow which:
> placed → accepted → preparing → ready → served, and cancelled reachable from anything before
> served. A `canTransition` function reads that table. Both the API and the kitchen UI use the
> same definition, so there's no duplicated if-ladder that can drift."

**Push: "Two kitchen tablets both tap 'Accept' on the same order."**
> "Only one wins. The update is a compare-and-set: update the row *where the status is still
> what I validated against*. If zero rows match, someone already moved it, and that device gets
> a 409 and refreshes. It's optimistic concurrency — no locks on the hot path — and every
> change also appends to an audit log."

### L2. The pricing engine
**Ask: "Where does pricing live?"**
> "In one module, `pricing.ts`. It's the only place money is calculated — not in a component,
> not in a route handler. The functions are pure: cart lines plus settings in, a price
> breakdown out, no I/O. That makes it exhaustively unit-testable, which matters for money."

**Push: "Floating point and money don't mix. How do you avoid rounding bugs?"**
> "I add in integer paise, not rupees, so the classic 0.1 + 0.2 problem can't reach a bill.
> Rounding happens once at each defined boundary, with an epsilon nudge to dodge the 1.005
> trap. Tax is per-item, not a flat rate on the subtotal — food is 5%, drinks 12% — because a
> flat rate produces a wrong GST bill. And splitting a bill distributes the leftover paise one
> per share, so three-way splitting a thousand rupees still sums back exactly."

**Push: "The client shows a total. Do you trust it?"**
> "Never. The client total is display-only. The server reprices every line from the database
> and ignores whatever total came in the request. A tampered request with a fake total gets
> charged the real price."

### L3. Historic orders / snapshots
**Ask: "Tomorrow the owner raises the paneer price. What happens to yesterday's bill?"**
> "Nothing — and that's on purpose. Order line items store a *snapshot*: the name, unit price,
> add-ons and tax rate at the time of the order. I never join back to the live menu to price a
> past order. The catalogue is normalised because it's edited; the order record is immutable
> because it's history."

### L4. Design patterns (if they ask directly)
**Ask: "Point to design patterns in your code."**
> "A few, used where they earn their place. The order flow is a **state machine**. The rate
> limiter is **strategy plus dependency injection** — a store interface with a Redis
> implementation and an in-memory one, and I inject a fake in tests. Database rows go through
> one **mapper per entity** — an adapter from snake_case rows to camelCase domain objects — so
> a column rename touches one function, not fifty components. Data access sits behind a
> **repository** layer so routes and components never call the database driver directly. And
> the service-role client is built by a **factory with a guard** that throws if it's ever
> constructed outside the server."

**Push: "Isn't that over-engineering for an MVP?"**
> "Each one removed a concrete risk, not a hypothetical. The mapper stops snake_case leaking
> everywhere. The guard stops the service-role key shipping to the browser — that's a critical
> bug if it happens. The store interface is why the limiter has unit tests. I didn't add
> patterns for their own sake; I added the ones that bought a guarantee."

### L5. Validation & API contract
**Ask: "How do you handle bad input?"**
> "Validate at the boundary, trust inside. Every route parses the body with a zod schema
> before any logic runs — no raw JSON destructuring. Past the parse, the data is typed and I
> don't re-check it. Errors come back in one shape — a code and a message — with a correct
> status: 200 for an idempotent replay, 201 for created, 409 for an illegal transition or a
> lost race, 503 when a dependency is down. The status code is part of the contract."

### L6. Concurrency, summarised
**Ask: "Summarise how you handle concurrency."**
> "Weakest correct tool for each case. Optimistic compare-and-set for status changes — cheap,
> no contention. A unique constraint to make duplicate order submits *safe* rather than block
> them. And a narrow advisory lock, per restaurant, only for allocating the gapless daily order
> number, because that genuinely needs serialising. I don't reach for a lock when a constraint
> or a compare-and-set will do."

---

## The honest weak-points (say these yourself — interviewers love it)

- "The status update and its audit-log insert are two statements, not one transaction. In the
  worst case a crash between them loses an event row. I'd wrap them in the RPC like I did for
  order creation."
- "The daily order-number resets on a UTC day boundary, so in India it rolls over at 5:30am
  local. A per-restaurant timezone fix is on the list."
- "Polling is the first scaling wall, and I haven't built the push path yet — I've only
  designed it. I'd do the 304 quick-win first, then server-sent events."
- "Rate limits are per-instance only while Redis is unconfigured. Fine for dev, not for a real
  launch."

## One-line close

> "The theme across the whole thing is: don't trust the client, make races safe instead of
> trying to prevent them, and put each invariant — money, order state, tenant isolation — in
> exactly one place so it can't drift."

---

*Companion docs:* [system-design.md](system-design.md) · [architecture.md](architecture.md) ·
[ADRs](adr/README.md) · [interview-prep.md](../interview-prep.md) (the AI-features pack)
