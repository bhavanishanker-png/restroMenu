# 0010 — Menu import as a LangGraph workflow

**Status:** Accepted (task T33)

## Context

AI menu import started as one request: upload a photo, one Claude call, code checks (`reconcileDraft`), and a draft returned to the dialog. Two limits showed up:

- **One page per upload.** Real menus are several photos. Uploading them one by one meant several reviews and duplicate detection that couldn't see across pages.
- **Review lived only in the browser.** The extraction (~25 s and paid) was thrown away if the owner closed the dialog before saving, and the owner's choices were only checked by the dialog itself.

Review is a human step that can take minutes or hours, and pages are independent work that can run in parallel. That is a workflow with state, not a single call.

## Options considered

1. **Keep one call, loop in the client.** The dialog uploads pages one after another and merges drafts in the browser. No server state, so "continue later" still loses the work, and validation stays client-side.
2. **Hand-rolled state machine.** Store a draft row per import in our own table and write the step logic ourselves. Workable, but we'd rebuild checkpointing, interrupts and resume.
3. **LangGraph `StateGraph` with a Postgres checkpointer.** Parallel fan-out (`Send`), a human-in-the-loop pause (`interrupt` + `Command({ resume })`), and durable state per thread, which are the three things we need.
4. **Rewrite the AI calls with LangChain model wrappers too.** Adds a second way to call Claude. The wrapper can lag behind API features we use (server-side refusal fallback, `effort`), and the eval would no longer measure the shipped call.

## Decision

Option 3, for **orchestration only**:

```
START ─┬─► extract_page ×N (parallel) ─► merge ─► reconcile ─┬─► review ⏸ ─► validate ─┬─► END
                                                             └─► END                  └─► review
```

- Each `extract_page` calls the existing `extractMenu`, so it still goes through the Anthropic SDK and is the exact function `evals/menu-extract` scores. A failed page is reported by number and the others continue.
- `merge` joins sections split across pages. `reconcile` is the existing `reconcileDraft`, so duplicate detection now covers every page.
- `review` pauses on an `interrupt`. The state is checkpointed, so the owner can close the dialog and continue later without a second AI call.
- `validate` checks the owner's decisions in code: only dishes in the draft, prices 1–99,999, a food type for every dish. A value the AI read from the menu is kept. On failure it loops back to `review`, so the thread stays paused and the owner can fix and resend.
- The approved list goes back to the dialog, which saves through `/api/menu/categories` and `/api/menu/items`. The graph never writes the menu.

The diner chat assistant stays on the Anthropic SDK's tool runner. It is a short model-driven loop with no human pause or saved state, so LangGraph would add code without adding capability.

## Security and data handling

- **Tenant scope:** the thread's `restaurantId` is written by the server from the staff session. Every read, resume and discard compares it with the caller's session. A mismatch is a 404, not a 403, so thread ids can't be probed.
- **Images are never checkpointed.** `extractPage` is a closure over the uploaded bytes, and only its JSON result enters graph state.
- **Not in `public`.** Checkpoint tables live in the `langgraph` schema (migration 009), which Supabase's REST API does not expose to the anon key.
- Paused imports expire after 7 days and are deleted when approved or discarded.

## Consequences

- ✅ Multi-page imports with one review, and pages read in parallel, so wall time is about the slowest page.
- ✅ "Continue your last import" costs no AI call.
- ✅ Owner decisions are validated on the server, not only in the dialog.
- ✅ Tested without network calls (`menu-import-graph.test.ts`: fan-out, partial failure, pause/resume without re-extraction, tenant check, validation loop, expiry).
- ⚠️ New dependencies: `@langchain/langgraph`, `@langchain/core`, `@langchain/langgraph-checkpoint-postgres`.
- ⚠️ Needs `DATABASE_URL` (pooled connection string) in production. Without it, state is in memory, and on serverless a paused import can expire between instances. It degrades to "upload again", not to an error.
- ⚠️ Expired threads are deleted when someone opens them, not on a schedule. A periodic cleanup job is a follow-up.
- ⚠️ Vercel limits a function's request body to about 4.5 MB, below the 10 MB per-file limit, so large photos need compressing (or direct-to-storage uploads) on Vercel.

## Where it lives

- `src/lib/ai/menu-import-graph.ts`: graph, `mergeExtractions`, `validateDecisions`, start/get/resume/discard
- `src/lib/ai/menu-import-checkpointer.ts`: Postgres or in-memory checkpointer
- `src/app/api/ai/menu-extract/route.ts` (start) and `src/app/api/ai/menu-extract/[threadId]/route.ts` (get, resume, discard)
- `src/components/menu-manager/MenuExtractDialog.tsx`
- `docs/migrations/009_langgraph_schema.sql`
