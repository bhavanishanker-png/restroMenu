/**
 * AI menu import as a LangGraph workflow. SERVER-ONLY.
 *
 *   START ─┬─► extract_page (page 1) ─┐
 *          ├─► extract_page (page 2) ─┼─► merge ─► reconcile ─┬─► review ⏸ ─► validate ─┬─► END
 *          └─► extract_page (page N) ─┘                       └─► END (nothing read)   └─► review (errors)
 *
 * Why LangGraph here (and not for the diner chat agent):
 *  - The pages are independent, so they are read in parallel (Send fan-out).
 *  - `review` is a human step that can last hours: the graph pauses on an
 *    interrupt, its state is checkpointed, and the owner can close the dialog
 *    and continue later without a second (paid, ~25 s) AI call.
 *  - `validate` loops back to `review` until the owner's choices pass.
 *
 * What did NOT change (ADR 0009 — AI as an untrusted component):
 *  - Claude is called only through `extractMenu` (Anthropic SDK), the same
 *    function the eval in evals/menu-extract scores.
 *  - Code, not the model, checks the result (`reconcileDraft`) and the owner's
 *    decisions (`validateDecisions`).
 *  - Nothing here writes the menu. The approved list goes back to the dialog,
 *    which saves through /api/menu/categories and /api/menu/items.
 *
 * Raw page images are never put in graph state, so they are never written to
 * the checkpoint store: `extractPage` is a closure over the uploaded bytes,
 * and only its JSON result enters the state.
 */
import {
  Annotation,
  Command,
  END,
  interrupt,
  Send,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import * as z from "zod/v4";
import { roundMoney } from "@/lib/pricing";
import { normalizeName, reconcileDraft, type Extraction } from "@/lib/ai/menu-onboarding";
import type { MenuCatalog } from "@/lib/queries/menu";
import type {
  ApprovedMenuCategory,
  ApprovedMenuItem,
  MenuDraft,
  MenuImportFailureCode,
  MenuImportPageFailure,
  MenuImportPending,
} from "@/types";

// ---------------------------------------------------------------- limits

export { MAX_IMPORT_PAGES } from "@/lib/ai/draft";

/** A paused import older than this is discarded instead of resumed. */
export const IMPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_PRICE = 99_999;
const MAX_REVIEW_ERRORS = 10;

export const PAGE_FAILURE_MESSAGES: Record<MenuImportFailureCode, string> = {
  AI_DECLINED: "The AI couldn't process this page. Try a clearer photo.",
  MENU_TOO_LONG: "This page has too much to read in one go. Split it into smaller photos.",
  PARSE_ERROR: "The AI returned malformed data for this page. Try again.",
  SCHEMA_ERROR: "The AI returned unexpected data for this page. Try again.",
  NOT_A_MENU: "This page doesn't look like a menu.",
  AI_BUSY: "The AI service was busy. Try this page again in a minute.",
  AI_ERROR: "The AI couldn't read this page. Try again.",
};

// ---------------------------------------------------------------- state

export type PageExtraction =
  | { page: number; ok: true; extraction: Extraction }
  | { page: number; ok: false; code: MenuImportFailureCode };

/** The value the graph pauses with at owner review. */
export type ReviewInterrupt = { kind: "menu_review"; errors: string[] };

const replace = <T>(_prev: T, next: T): T => next;

const ImportState = Annotation.Root({
  restaurantId: Annotation<string>(),
  createdAt: Annotation<string>(),
  pageCount: Annotation<number>(),
  /** One entry per page; parallel extract_page nodes append. */
  pageResults: Annotation<PageExtraction[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  merged: Annotation<Extraction | null>({ reducer: replace, default: () => null }),
  failedPages: Annotation<MenuImportPageFailure[]>({ reducer: replace, default: () => [] }),
  draft: Annotation<MenuDraft | null>({ reducer: replace, default: () => null }),
  /** Raw resume payload; untrusted until `validate` has checked it. */
  decisions: Annotation<unknown>({ reducer: replace, default: () => null }),
  reviewErrors: Annotation<string[]>({ reducer: replace, default: () => [] }),
  approved: Annotation<ApprovedMenuCategory[] | null>({ reducer: replace, default: () => null }),
});

type ImportStateValues = typeof ImportState.State;

const PageInput = Annotation.Root({ page: Annotation<number>() });

// ---------------------------------------------------------------- pure steps

/** Combines pages into one extraction; a section split across pages becomes one category. */
export function mergeExtractions(pages: Extraction[]): Extraction {
  const byKey = new Map<string, Extraction["categories"][number]>();
  const ordered: Extraction["categories"] = [];
  for (const page of pages) {
    for (const cat of page.categories) {
      const key = normalizeName(cat.name) || "main menu";
      const existing = byKey.get(key);
      if (existing) {
        existing.items.push(...cat.items);
      } else {
        const copy = { name: cat.name, items: [...cat.items] };
        byKey.set(key, copy);
        ordered.push(copy);
      }
    }
  }
  return { isMenu: true, categories: ordered };
}

const DecisionsSchema = z
  .array(
    z.object({
      categoryIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      basePrice: z.number().nullable(),
      foodType: z.enum(["veg", "non_veg", "egg"]).nullable(),
    })
  )
  .min(1, "Select at least one dish to import.")
  .max(400);

export type DecisionResult =
  | { ok: true; approved: ApprovedMenuCategory[] }
  | { ok: false; errors: string[] };

/**
 * Checks the owner's choices against the draft the graph produced. The client
 * can only pick dishes that exist in the draft and fill in blanks; a price or
 * food type the AI read from the menu is kept as read.
 */
export function validateDecisions(draft: MenuDraft, raw: unknown): DecisionResult {
  const parsed = DecisionsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: [parsed.error.issues[0]?.message ?? "Invalid selection."] };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const picked = new Map<number, Map<number, ApprovedMenuItem>>();

  for (const d of parsed.data) {
    const key = `${d.categoryIndex}:${d.itemIndex}`;
    if (seen.has(key)) {
      errors.push("The same dish was selected twice.");
      continue;
    }
    seen.add(key);

    const item = draft.categories[d.categoryIndex]?.items[d.itemIndex];
    if (!item) {
      errors.push("A selected dish is not in this import.");
      continue;
    }

    const price = item.basePrice ?? d.basePrice;
    const foodType = item.foodType ?? d.foodType;
    if (price === null || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      errors.push(`${item.name}: needs a price between 1 and ${MAX_PRICE.toLocaleString("en-IN")}.`);
      continue;
    }
    if (foodType === null) {
      errors.push(`${item.name}: choose veg, non-veg or egg.`);
      continue;
    }

    const row = picked.get(d.categoryIndex) ?? new Map<number, ApprovedMenuItem>();
    row.set(d.itemIndex, { ...item, basePrice: roundMoney(price), foodType });
    picked.set(d.categoryIndex, row);
  }

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, MAX_REVIEW_ERRORS) };

  // Keep the draft's order, not the order the client sent.
  const approved: ApprovedMenuCategory[] = [];
  draft.categories.forEach((cat, ci) => {
    const row = picked.get(ci);
    if (!row) return;
    const items = cat.items.flatMap((_, ii) => {
      const item = row.get(ii);
      return item ? [item] : [];
    });
    approved.push({ name: cat.name, existingCategoryId: cat.existingCategoryId, items });
  });
  return { ok: true, approved };
}

// ---------------------------------------------------------------- graph

export type MenuImportGraphDeps = {
  checkpointer: BaseCheckpointSaver;
  /** Reads one page (1-based). Only needed when starting an import, not when resuming. */
  extractPage?: (page: number) => Promise<PageExtraction>;
  /** The restaurant's current menu, for duplicate detection. Only needed when starting. */
  catalog?: MenuCatalog;
};

export function buildMenuImportGraph(deps: MenuImportGraphDeps) {
  return new StateGraph(ImportState)
    .addNode(
      "extract_page",
      async ({ page }: typeof PageInput.State) => {
        if (!deps.extractPage) throw new Error("extract_page ran without an extractor (resume path?)");
        let result: PageExtraction;
        try {
          result = await deps.extractPage(page);
        } catch (err) {
          // One bad page must not sink the others.
          console.error(`[menu-import] page ${page} extractor threw`, err);
          result = { page, ok: false, code: "AI_ERROR" };
        }
        return { pageResults: [result] };
      },
      { input: PageInput }
    )
    .addNode("merge", (state: ImportStateValues) => {
      const results = [...state.pageResults].sort((a, b) => a.page - b.page);
      const failedPages: MenuImportPageFailure[] = results.flatMap((r) =>
        r.ok ? [] : [{ page: r.page, code: r.code, message: PAGE_FAILURE_MESSAGES[r.code] }]
      );
      const read = results.flatMap((r) => (r.ok ? [r.extraction] : []));
      return { failedPages, merged: read.length > 0 ? mergeExtractions(read) : null };
    })
    .addNode("reconcile", (state: ImportStateValues) => {
      if (!state.merged) return { draft: null };
      if (!deps.catalog) throw new Error("reconcile ran without a catalog (resume path?)");
      return { draft: reconcileDraft(state.merged, deps.catalog) };
    })
    .addNode("review", (state: ImportStateValues) => {
      // Pauses here. On resume, interrupt() returns the owner's decisions.
      const decisions: unknown = interrupt<ReviewInterrupt, unknown>({
        kind: "menu_review",
        errors: state.reviewErrors,
      });
      return { decisions };
    })
    .addNode("validate", (state: ImportStateValues) => {
      if (!state.draft) throw new Error("validate ran without a draft");
      const result = validateDecisions(state.draft, state.decisions);
      return result.ok
        ? { approved: result.approved, reviewErrors: [] }
        : { approved: null, reviewErrors: result.errors };
    })
    .addConditionalEdges(
      START,
      (state: ImportStateValues) =>
        Array.from({ length: state.pageCount }, (_, i) => new Send("extract_page", { page: i + 1 })),
      ["extract_page"]
    )
    .addEdge("extract_page", "merge")
    .addEdge("merge", "reconcile")
    .addConditionalEdges(
      "reconcile",
      (state: ImportStateValues) => (state.draft && state.draft.totalItems > 0 ? "review" : END),
      ["review", END]
    )
    .addEdge("review", "validate")
    .addConditionalEdges(
      "validate",
      (state: ImportStateValues) => (state.approved ? END : "review"),
      ["review", END]
    )
    .compile({ checkpointer: deps.checkpointer });
}

// ---------------------------------------------------------------- operations used by the routes

function threadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

type ThreadView =
  | { kind: "missing" }
  | { kind: "pending"; values: ImportStateValues; errors: string[] }
  | { kind: "finished"; values: ImportStateValues };

/**
 * Loads a thread and enforces the tenant check: a thread that belongs to
 * another restaurant is reported as missing, never as forbidden, so thread
 * ids can't be probed.
 */
async function loadThread(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  now: number
): Promise<ThreadView> {
  const graph = buildMenuImportGraph({ checkpointer });
  const snapshot = await graph.getState(threadConfig(threadId));
  const values = snapshot.values as Partial<ImportStateValues>;

  if (!values.restaurantId || values.restaurantId !== restaurantId) return { kind: "missing" };

  if (values.createdAt && now - Date.parse(values.createdAt) > IMPORT_TTL_MS) {
    await checkpointer.deleteThread(threadId);
    return { kind: "missing" };
  }

  const full = values as ImportStateValues;
  if (!snapshot.next.includes("review")) return { kind: "finished", values: full };

  const pause = snapshot.tasks
    .flatMap((t) => t.interrupts)
    .map((i) => i.value as ReviewInterrupt | undefined)
    .find((v) => v?.kind === "menu_review");
  return { kind: "pending", values: full, errors: pause?.errors ?? [] };
}

function toPending(threadId: string, values: ImportStateValues): MenuImportPending | null {
  if (!values.draft) return null;
  return {
    threadId,
    draft: values.draft,
    pageCount: values.pageCount,
    failedPages: values.failedPages,
    createdAt: values.createdAt,
  };
}

export type StartImportResult =
  | { status: "review"; pending: MenuImportPending }
  | { status: "failed"; failedPages: MenuImportPageFailure[] };

export async function startMenuImport(
  deps: Required<MenuImportGraphDeps> & {
    threadId: string;
    restaurantId: string;
    pageCount: number;
    now?: number;
  }
): Promise<StartImportResult> {
  const graph = buildMenuImportGraph(deps);
  await graph.invoke(
    {
      restaurantId: deps.restaurantId,
      createdAt: new Date(deps.now ?? Date.now()).toISOString(),
      pageCount: deps.pageCount,
    },
    threadConfig(deps.threadId)
  );

  const view = await loadThread(deps.checkpointer, deps.threadId, deps.restaurantId, deps.now ?? Date.now());
  const pending = view.kind === "pending" ? toPending(deps.threadId, view.values) : null;
  if (pending) return { status: "review", pending };

  // Nothing readable: no point keeping the thread.
  const failedPages = view.kind === "missing" ? [] : view.values.failedPages;
  await deps.checkpointer.deleteThread(deps.threadId);
  return { status: "failed", failedPages };
}

export async function getPendingMenuImport(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  now: number = Date.now()
): Promise<MenuImportPending | null> {
  const view = await loadThread(checkpointer, threadId, restaurantId, now);
  return view.kind === "pending" ? toPending(threadId, view.values) : null;
}

export type ResumeImportResult =
  | { status: "approved"; categories: ApprovedMenuCategory[] }
  | { status: "invalid"; errors: string[] }
  | { status: "not_found" };

export async function resumeMenuImport(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  decisions: unknown,
  now: number = Date.now()
): Promise<ResumeImportResult> {
  const before = await loadThread(checkpointer, threadId, restaurantId, now);
  if (before.kind !== "pending") return { status: "not_found" };

  const graph = buildMenuImportGraph({ checkpointer });
  await graph.invoke(new Command({ resume: decisions }), threadConfig(threadId));

  const after = await loadThread(checkpointer, threadId, restaurantId, now);
  if (after.kind === "pending") return { status: "invalid", errors: after.errors };
  if (after.kind === "finished" && after.values.approved) {
    // The dialog saves from the approved list; the paused state is no longer needed.
    await checkpointer.deleteThread(threadId);
    return { status: "approved", categories: after.values.approved };
  }
  return { status: "not_found" };
}

export async function discardMenuImport(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  now: number = Date.now()
): Promise<boolean> {
  const view = await loadThread(checkpointer, threadId, restaurantId, now);
  if (view.kind === "missing") return false;
  await checkpointer.deleteThread(threadId);
  return true;
}
