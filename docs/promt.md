# prompts.md — Copy-paste prompts for building this with an LLM

Everything below is ready to paste. Replace `Txx` with the task number.

---

## 1. First session — kickoff

Use this once, at the very start.

```
Read plan.md, README.md, and CLAUDE.md in full before doing anything.

Then read docs/tasks.md and tell me:
1. A one-line summary of what this project is
2. What task T01 requires
3. Anything in the specs that is ambiguous or contradictory

Do not write any code yet. Just confirm you understand the project.
```

If its summary is wrong or vague, the specs didn't land — re-point it at the files
before letting it write anything.

---

## 2. Standard task prompt

This is the one you'll use ~23 times. It's deliberately strict.

```
Execute task T05 from docs/tasks.md.

Before you start:
- Re-read CLAUDE.md and follow every rule in it
- Read the relevant sections of docs/api-spec.md and docs/ui-spec.md
- State the acceptance criteria for this task in one line

While working:
- Only build what T05 asks for. Do not scaffold anything for later tasks.
- Do not modify src/lib/pricing.ts or src/types/index.ts unless the task says to
- Every DB query must filter by restaurant_id
- Validate every API input with zod

When done:
- List each acceptance criterion and state explicitly whether it passes
- Run `npm run typecheck` and paste the output
- List every file you created or modified, with one line on why

Stop after T05. Do not start T06.
```

---

## 3. Resuming in a new session

Context resets between sessions. Use this to reload state.

```
This is an existing project. Read plan.md, CLAUDE.md, and docs/tasks.md.

Look at which tasks are ticked in docs/tasks.md, then inspect the actual codebase
under src/ and tell me:
1. Which task appears genuinely complete vs just ticked
2. Which task I should do next
3. Any code already written that violates a rule in CLAUDE.md

Do not write code yet.
```

That second question matters — a ticked task with half-finished code is the most
common way these builds go sideways.

---

## 4. Verification — run this yourself after every task

```
Do not write any new code. Audit task T09 against its acceptance criteria in
docs/tasks.md and against docs/api-spec.md.

For each criterion, quote the specific lines of code that satisfy it, or say
"NOT MET" and explain what's missing. Be adversarial — assume it's broken and
try to prove it works.

Then check specifically:
- Does every Supabase query in the files you touched filter by restaurant_id?
- Is the service role key imported anywhere reachable from a 'use client' file?
- Is there any price arithmetic outside src/lib/pricing.ts?
```

---

## 5. When it gets stuck or produces a bug

```
The following is broken: [describe exactly what you did, what you expected,
and what actually happened. Paste the error and the relevant file.]

Before proposing a fix:
1. Explain the root cause in two sentences
2. Tell me which file is actually at fault
3. Propose the smallest possible fix

Do not rewrite unrelated code. Do not add defensive try/catch to hide the error.
```

The "smallest possible fix" line is doing real work here — without it, LLMs tend
to rewrite three files to fix a typo.

---

## 6. When it drifts from the spec

Paste one of these the moment you notice.

```
Stop. You've deviated from CLAUDE.md. Specifically: [what it did].
Revert that change and redo it following the rule. Explain what you'll do
differently before you touch the code.
```

```
You built features that aren't in task T15. Remove everything that isn't
required by T15's acceptance criteria, then show me the reduced diff.
```

```
You put business logic inside a React component. Move it to src/lib/ and have
the component call it. CLAUDE.md forbids this.
```

---

## 7. Tuned prompts for the four hard tasks

### T04 — Pricing engine tests

```
Execute task T04. src/lib/pricing.ts is already written — do not change its
logic, only add tests.

Write vitest tests in src/lib/pricing.test.ts covering exactly these cases:
1. Single item, no variant, no addons, quantity 1
2. Item with a variant price delta
3. Item with three addons, quantity 2 (addons are PER UNIT, not per line)
4. Two items with different tax rates: food at 5% and a beverage at 12%.
   Assert the tax is computed per item, NOT as a flat rate on the subtotal.
5. Dine-in: service charge applied, packing charge zero
6. Takeaway: packing charge applied, service charge zero
7. Rounding: a case where naive float math produces .005
8. Empty cart returns all zeros
9. buildLineId produces the same id when addon ids are passed in a different order

Show me the failing output first if any test fails, before fixing anything.
```

### T09 — Order creation API

```
Execute task T09. This is the most security-sensitive endpoint in the app.

Follow the 9-step server behaviour in docs/api-spec.md exactly and in order.

Critical requirements:
- Fetch ALL referenced items, variants and addons from the DB in ONE query.
  No N+1 loops.
- Recompute every price from DB values via src/lib/pricing.ts. Any price or
  total in the request body must be ignored entirely.
- Reject item IDs belonging to a different restaurant with 400.
- Reject items where is_available = false with 400 ITEM_UNAVAILABLE, naming the dish.
- Snapshot item_name, variant_name, unit_price, addons and tax_rate into order_items.
- Wrap the orders + order_items + order_events inserts so a partial order can
  never exist. Use a Postgres function if a transaction isn't available through
  the JS client.
- The idempotency_key path must return the EXISTING order with 200, not an error.

After implementing, write a test that posts the same idempotencyKey twice and
asserts one order exists.
```

### T13 — Kitchen display

```
Execute task T13. Read docs/ui-spec.md section 5 carefully first.

This screen is used on a 10-inch tablet in a hot kitchen, read from three feet
away by someone holding a ladle. Design accordingly:
- Base font 18px, order numbers 32px, buttons minimum 60px tall
- One primary action button per card. No dropdowns for the main flow.
- Item notes rendered in amber and visually prominent — this is where
  "no onion" lives and missing it means a remade dish

Implement in this order and show me each before moving on:
1. Static four-column layout with mock data
2. Real data fetch and the Realtime subscription
3. Optimistic status updates with rollback on failure
4. Elapsed timer with amber at 15 min, red at 25 min
5. The offline queue: persist pending changes to localStorage, show a banner
   with the pending count, sync on reconnect
6. Chime on new order, with a mute toggle

For step 5, tell me exactly how to test it before you write it.
```

### T20 — Security pass

```
Execute task T20. Act as a security auditor, not the person who wrote this code.

Do all of the following and report findings as a table with severity:

1. Grep every Supabase query in src/. List any that touch a tenant table
   (orders, order_items, menu_items, menu_categories, restaurant_tables, staff)
   without a restaurant_id filter.
2. Run `npm run build`, then grep .next/static for the service role key value
   and for the string "SUPABASE_SERVICE_ROLE". Report anything found.
3. List every API route and state whether it validates input with zod and
   whether it checks the caller's role.
4. Confirm the Razorpay webhook reads the RAW body before signature verification.
5. Confirm rate limits exist on POST /api/orders, PIN login, and service requests.
6. Confirm qr_token is generated with crypto randomness, not a sequence.
7. Try to construct a request that orders an item from restaurant A while
   posing as a customer of restaurant B. Show me whether it succeeds.

Report findings first. Do not fix anything until I approve the list.
```

---

## 8. End-of-phase review

Run after T11 and again after T19.

```
Do not write code. Review everything built so far against plan.md and CLAUDE.md.

Report:
1. Rule violations from CLAUDE.md, with file and line
2. Duplicated logic that should be extracted
3. Any place where money is calculated outside src/lib/pricing.ts
4. Any place a past order is priced by joining to menu_items
5. Components over 200 lines that should be split
6. Missing loading states, empty states, or error handling
7. The three highest-risk things in the codebase right now

Rank everything by severity. Propose a fix order. Do not implement yet.
```

---

## 9. Release 1 sign-off (T23)

```
Execute task T23. Walk the "Definition of done" list in plan.md section 8.

For each of the 10 criteria, tell me:
- How I test it manually (exact steps, which device)
- Whether you believe it currently passes, and your evidence
- What's missing if it doesn't

Then give me a single ordered checklist I can run through on a real phone and
a real tablet in under 30 minutes.
```

---

## Rules for driving the agent

1. **One task per session.** Context degrades; a fresh session per task keeps it sharp.
2. **Never let it run three tasks unattended.** A wrong decision in T03 gets baked into everything after it.
3. **Verify yourself.** Run `npm run dev` and `npm run build` with your own hands. An agent saying "acceptance criteria met" is a claim, not evidence.
4. **Commit after every green task.** `git commit -m "T09: order creation API"`. When something breaks later you can bisect.
5. **When it apologises and rewrites everything, stop it.** Revert to the last commit and re-prompt with a narrower scope.
6. **Paste errors in full.** Truncated stack traces produce guessed fixes.