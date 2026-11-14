# 0011 — AI dish writing and translations

**Status:** Accepted (task T34)

## Context

Many dishes have no description, and many diners in India read Hindi more comfortably than English. Writing descriptions and translating a 60-dish menu by hand is the kind of chore owners skip. The plan lists "menu description generation, Hindi translation" as a Release 3 AI feature. The owner chose to build it early.

Two risks shape the design:
- **Health claims.** A model asked to "make it appetising" drifts into "healthy", "gluten-free" or "पौष्टिक". The menu has no allergen data, so any such claim is invented (ADR 0009).
- **Bulk work.** Up to 40 dishes per run is 40+ model calls, which has to stay inside rate limits and must not lose finished work if the owner leaves.

## Decisions

### Data model: a translations table (owner's choice)

`menu_item_translations (restaurant_id, item_id, locale, name, description, source)`, unique per `(item_id, locale)`.
- A new language is a new `locale` value (and a widened check constraint), not a migration per language.
- `restaurant_id` is stored, so every query is scoped like any other tenant table, and RLS uses `is_staff_of(restaurant_id)` directly.
- `source` records whether the owner changed the AI's text before approving it.
- Order lines keep the English name: the order route snapshots `menu_items.name`, so the kitchen and the bill are unaffected by the diner's language.

Rejected: `name_hi` and `description_hi` columns. They're simpler, but every further language is a migration.

### Workflow: LangGraph, same pattern as menu import (ADR 0010)

```
START ─► [dish subgraph] ×N (≤ 5 at a time) ─► review ⏸ ─► validate ─► END
dish subgraph:  write ─► check ─┬─► finish
                  ▲             │ problem + attempts left
                  └─ feedback ──┘
```

- **One call per dish** (`writeDishText`, Anthropic SDK, structured output, effort `low`) returns an English description (only when the dish has none), a Hindi name and a Hindi description.
- **The guardrail is a graph edge.** `checkDishText` rejects health or allergy claims in English and Hindi, prices, over-long text and a Hindi name not in Devanagari. A rejected dish goes back to `write` with the problem as feedback, at most 3 calls. After that, the failing field is **dropped** and the dish flagged for the owner. Text with a claim is never saved.
- **Bounded fan-out:** `maxConcurrency: 5`.
- **Review pause** with a checkpoint, so the owner can close the dialog and continue later without another AI call.
- **`validate`** checks the owner's decisions: only dishes from this run, an English description only for dishes that still have none, and lengths that fit the database. It loops back to `review` on errors.
- **The route saves, not the graph.** It saves only dishes still on the menu, writes an English description only `where description is null` (never overwriting an edit made meanwhile), upserts translations, then clears the menu cache. The approval is kept until the save succeeds, so a failed save can be retried without a new AI call.

### Hindi health-claim filter

The claim filter in `guardrails.ts` now also matches Hindi terms (ग्लूटेन, एलर्जी, हेल्दी, पौष्टिक, शुगर फ्री, जैन and others). This also strengthens the diner chat assistant, whose code backstop was English-only.

### Diner side

The menu shows a हिं / EN switch when the restaurant has any translation. Dishes without one stay in English. Search matches both languages. The choice is a per-device `localStorage` preference. Translations come in the same cached menu query, so there's no extra request.

## Consequences

- ✅ A safety rule that's enforced by the workflow's structure, not just asked for in the prompt, and that's tested.
- ✅ More languages need no schema change.
- ⚠️ The Hindi filter is a word list. It catches common claims, not every phrasing. The prompt covers the rest, and the owner reviews everything.
- ⚠️ The public menu's cache key is now versioned (`public-menu:v2`). Entries written before translations existed were served to new code and crashed the diner menu during development. Bump the version whenever the cached shape changes.
- ⚠️ No eval set yet for translation quality or the health-claim rate. That's the next step before changing the prompt or model.

## Where it lives

- `src/lib/ai/dish-writing.ts`: the model call and `checkDishText`
- `src/lib/ai/menu-writing-graph.ts`: graph, validation, start/get/resume/finish
- `src/app/api/ai/menu-writing/route.ts` and `[threadId]/route.ts`
- `src/components/menu-manager/MenuWritingDialog.tsx`, `src/components/menu/MenuClientLayout.tsx`, `MenuHeader.tsx`
- `docs/migrations/010_menu_item_translations.sql`
