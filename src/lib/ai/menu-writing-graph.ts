/**
 * AI dish writing (English descriptions + Hindi) as a LangGraph workflow (T34). SERVER-ONLY.
 *
 *   START ─┬─► [dish subgraph] ─┐
 *          ├─► [dish subgraph] ─┼─► review ⏸ ─► validate ─┬─► END
 *          └─► [dish subgraph] ─┘     ▲                   │
 *              (≤ 5 at a time)        └──── errors ───────┘
 *
 *   dish subgraph:  write ─► check ─┬─► finish
 *                     ▲             │ problem and attempts left
 *                     └─ feedback ──┘
 *
 * What makes this a graph and not a loop in a route handler:
 *  - Per-dish work fans out with bounded concurrency (`maxConcurrency`).
 *  - Each dish has its own cycle: when the guardrail (`checkDishText`) finds a
 *    health claim, a price or a non-Devanagari name, the dish is written again
 *    with that problem as feedback — at most MAX_ATTEMPTS calls, then the bad
 *    field is dropped and the dish flagged. Text with a claim is never saved.
 *  - The run pauses for owner review (interrupt), checkpointed, so the owner
 *    can close the dialog and continue later without paying for the AI again.
 *
 * Like menu import (ADR 0010): Claude is called only through the Anthropic SDK
 * (`writeDishText`), code decides what passes, and the graph never writes the
 * menu — the route saves the approved text, scoped by restaurant.
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
import {
  checkDishText,
  DISH_TEXT_LIMITS,
  type DishInput,
  type DishText,
  type DishTextProblems,
  type WriteDishResult,
} from "@/lib/ai/dish-writing";
import type {
  ApprovedDishText,
  DishWritingFlag,
  DishWritingResult,
  MenuWritingPending,
} from "@/types";

export const MAX_WRITING_DISHES = 40;
/** First try plus two rewrites. */
export const MAX_ATTEMPTS = 3;
/** Dishes written at the same time; keeps one run well inside API rate limits. */
export const WRITING_CONCURRENCY = 5;
export const WRITING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const replace = <T>(_prev: T, next: T): T => next;
const append = <T>(prev: T[], next: T[]): T[] => prev.concat(next);

// ---------------------------------------------------------------- dish subgraph

const DishState = Annotation.Root({
  dish: Annotation<DishInput>(),
  attempt: Annotation<number>({ reducer: replace, default: () => 0 }),
  text: Annotation<DishText | null>({ reducer: replace, default: () => null }),
  problems: Annotation<DishTextProblems>({ reducer: replace, default: () => ({}) }),
  failed: Annotation<boolean>({ reducer: replace, default: () => false }),
  /** Shared with the parent graph: each finished dish appends one result. */
  results: Annotation<DishWritingResult[]>({ reducer: append, default: () => [] }),
});

type DishStateValues = typeof DishState.State;

function feedbackFrom(problems: DishTextProblems): string | null {
  const list = Object.values(problems).filter((p): p is string => Boolean(p));
  return list.length > 0 ? list.join("; ") + "." : null;
}

/** Turns the last attempt into what the owner reviews. Fields that still fail are dropped. */
export function finishDish(state: Pick<DishStateValues, "dish" | "attempt" | "text" | "problems" | "failed">): DishWritingResult {
  const { dish } = state;
  const base = {
    itemId: dish.itemId,
    name: dish.name,
    category: dish.category,
    currentDescription: dish.currentDescription,
    attempts: state.attempt,
  };
  if (state.failed || !state.text) {
    return { ...base, descriptionEn: null, nameHi: null, descriptionHi: null, flags: ["ai_failed"] };
  }

  const p = state.problems;
  const flags = new Set<DishWritingFlag>();
  for (const msg of Object.values(p)) {
    if (!msg) continue;
    flags.add(msg.includes("health, diet or allergy claim") ? "health_claim" : "ai_failed");
  }
  return {
    ...base,
    descriptionEn: p.descriptionEn ? null : state.text.descriptionEn,
    nameHi: p.nameHi ? null : state.text.nameHi,
    descriptionHi: p.descriptionHi ? null : state.text.descriptionHi,
    flags: Array.from(flags),
  };
}

type WriteDish = (dish: DishInput, feedback: string | null) => Promise<WriteDishResult>;

function buildDishGraph(writeDish: WriteDish | undefined) {
  return new StateGraph(DishState)
    .addNode("write", async (state: DishStateValues) => {
      if (!writeDish) throw new Error("write ran without a writer (resume path?)");
      const attempt = state.attempt + 1;
      try {
        const result = await writeDish(state.dish, feedbackFrom(state.problems));
        if (!result.ok) {
          console.error(`[menu-writing] ${state.dish.itemId} attempt ${attempt}: ${result.code}`);
          return { attempt, failed: true };
        }
        return { attempt, text: result.text };
      } catch (err) {
        console.error(`[menu-writing] ${state.dish.itemId} attempt ${attempt} threw`, err);
        return { attempt, failed: true };
      }
    })
    .addNode("check", (state: DishStateValues) => {
      if (state.failed || !state.text) return {};
      const checked = checkDishText(state.dish, state.text);
      return { text: checked.text, problems: checked.problems };
    })
    .addNode("finish", (state: DishStateValues) => ({ results: [finishDish(state)] }))
    .addEdge(START, "write")
    .addEdge("write", "check")
    .addConditionalEdges(
      "check",
      (state: DishStateValues) =>
        !state.failed && feedbackFrom(state.problems) && state.attempt < MAX_ATTEMPTS ? "write" : "finish",
      ["write", "finish"]
    )
    .addEdge("finish", END)
    .compile();
}

// ---------------------------------------------------------------- parent graph

/** The value the run pauses with at owner review. */
export type WritingReviewInterrupt = { kind: "menu_writing_review"; errors: string[] };

const WritingState = Annotation.Root({
  /** Which workflow wrote this thread, so a menu-import thread id can't be resumed here. */
  workflow: Annotation<"menu_writing">(),
  restaurantId: Annotation<string>(),
  createdAt: Annotation<string>(),
  dishes: Annotation<DishInput[]>(),
  results: Annotation<DishWritingResult[]>({ reducer: append, default: () => [] }),
  decisions: Annotation<unknown>({ reducer: replace, default: () => null }),
  reviewErrors: Annotation<string[]>({ reducer: replace, default: () => [] }),
  approved: Annotation<ApprovedDishText[] | null>({ reducer: replace, default: () => null }),
});

type WritingStateValues = typeof WritingState.State;

const DecisionsSchema = z
  .array(
    z.object({
      itemId: z.string().max(64),
      descriptionEn: z.string().nullable(),
      nameHi: z.string(),
      descriptionHi: z.string().nullable(),
    })
  )
  .min(1, "Select at least one dish to save.")
  .max(MAX_WRITING_DISHES);

function cleanOwnerText(text: string | null): string | null {
  if (text === null) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

export type WritingDecisionResult =
  | { ok: true; approved: ApprovedDishText[] }
  | { ok: false; errors: string[] };

/**
 * Checks the owner's final text against this run. Only dishes from the run;
 * an English description only for dishes that have none; lengths that fit the
 * database. Text the owner typed is the owner's (it isn't re-filtered), but it
 * is marked `owner` so it's never presented as AI output.
 */
export function validateWritingDecisions(results: DishWritingResult[], raw: unknown): WritingDecisionResult {
  const parsed = DecisionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: [parsed.error.issues[0]?.message ?? "Invalid selection."] };

  const byId = new Map(results.map((r) => [r.itemId, r] as const));
  const seen = new Set<string>();
  const errors: string[] = [];
  const approved: ApprovedDishText[] = [];

  for (const d of parsed.data) {
    const result = byId.get(d.itemId);
    if (!result) {
      errors.push("A selected dish is not in this run.");
      continue;
    }
    if (seen.has(d.itemId)) {
      errors.push(`${result.name}: selected twice.`);
      continue;
    }
    seen.add(d.itemId);

    const descriptionEn = cleanOwnerText(d.descriptionEn);
    const nameHi = cleanOwnerText(d.nameHi);
    const descriptionHi = cleanOwnerText(d.descriptionHi);

    if (descriptionEn && result.currentDescription) {
      errors.push(`${result.name}: already has an English description. Edit it in the menu manager.`);
      continue;
    }
    if (descriptionEn && descriptionEn.length > DISH_TEXT_LIMITS.descriptionEn) {
      errors.push(`${result.name}: English description is too long (max ${DISH_TEXT_LIMITS.descriptionEn}).`);
      continue;
    }
    if (!nameHi) {
      errors.push(`${result.name}: needs a Hindi name.`);
      continue;
    }
    if (nameHi.length > DISH_TEXT_LIMITS.nameHi) {
      errors.push(`${result.name}: Hindi name is too long (max ${DISH_TEXT_LIMITS.nameHi}).`);
      continue;
    }
    if (descriptionHi && descriptionHi.length > DISH_TEXT_LIMITS.descriptionHi) {
      errors.push(`${result.name}: Hindi description is too long (max ${DISH_TEXT_LIMITS.descriptionHi}).`);
      continue;
    }

    const unchanged = nameHi === result.nameHi && descriptionHi === result.descriptionHi;
    approved.push({
      itemId: d.itemId,
      descriptionEn,
      nameHi,
      descriptionHi,
      hiSource: unchanged ? "ai" : "owner",
    });
  }

  return errors.length > 0 ? { ok: false, errors: errors.slice(0, 10) } : { ok: true, approved };
}

export type MenuWritingGraphDeps = {
  checkpointer: BaseCheckpointSaver;
  /** Only needed when starting a run, not when resuming. */
  writeDish?: WriteDish;
};

export function buildMenuWritingGraph(deps: MenuWritingGraphDeps) {
  return new StateGraph(WritingState)
    .addNode("dish", buildDishGraph(deps.writeDish))
    .addNode("review", (state: WritingStateValues) => {
      const decisions: unknown = interrupt<WritingReviewInterrupt, unknown>({
        kind: "menu_writing_review",
        errors: state.reviewErrors,
      });
      return { decisions };
    })
    .addNode("validate", (state: WritingStateValues) => {
      const result = validateWritingDecisions(state.results, state.decisions);
      return result.ok
        ? { approved: result.approved, reviewErrors: [] }
        : { approved: null, reviewErrors: result.errors };
    })
    .addConditionalEdges(
      START,
      (state: WritingStateValues) => state.dishes.map((dish) => new Send("dish", { dish })),
      ["dish"]
    )
    .addEdge("dish", "review")
    .addEdge("review", "validate")
    .addConditionalEdges(
      "validate",
      (state: WritingStateValues) => (state.approved ? END : "review"),
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
  | { kind: "pending"; values: WritingStateValues; errors: string[] }
  | { kind: "finished"; values: WritingStateValues };

/** Same tenant rule as menu import: another restaurant's thread reads as missing. */
async function loadThread(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  now: number
): Promise<ThreadView> {
  const snapshot = await buildMenuWritingGraph({ checkpointer }).getState(threadConfig(threadId));
  const values = snapshot.values as Partial<WritingStateValues>;

  if (values.workflow !== "menu_writing") return { kind: "missing" };
  if (!values.restaurantId || values.restaurantId !== restaurantId) return { kind: "missing" };
  if (values.createdAt && now - Date.parse(values.createdAt) > WRITING_TTL_MS) {
    await checkpointer.deleteThread(threadId);
    return { kind: "missing" };
  }

  const full = values as WritingStateValues;
  if (!snapshot.next.includes("review")) return { kind: "finished", values: full };
  const pause = snapshot.tasks
    .flatMap((t) => t.interrupts)
    .map((i) => i.value as WritingReviewInterrupt | undefined)
    .find((v) => v?.kind === "menu_writing_review");
  return { kind: "pending", values: full, errors: pause?.errors ?? [] };
}

function toPending(threadId: string, values: WritingStateValues): MenuWritingPending {
  // Parallel dishes finish in any order; show them in the order the owner picked.
  const order = new Map(values.dishes.map((d, i) => [d.itemId, i] as const));
  const dishes = [...values.results].sort(
    (a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0)
  );
  return { threadId, dishes, createdAt: values.createdAt };
}

export async function startMenuWriting(
  deps: Required<MenuWritingGraphDeps> & {
    threadId: string;
    restaurantId: string;
    dishes: DishInput[];
    now?: number;
  }
): Promise<MenuWritingPending> {
  if (deps.dishes.length === 0 || deps.dishes.length > MAX_WRITING_DISHES) {
    throw new Error(`startMenuWriting needs 1–${MAX_WRITING_DISHES} dishes`);
  }
  const now = deps.now ?? Date.now();
  await buildMenuWritingGraph(deps).invoke(
    {
      workflow: "menu_writing",
      restaurantId: deps.restaurantId,
      createdAt: new Date(now).toISOString(),
      dishes: deps.dishes,
    },
    { ...threadConfig(deps.threadId), maxConcurrency: WRITING_CONCURRENCY }
  );
  const view = await loadThread(deps.checkpointer, deps.threadId, deps.restaurantId, now);
  if (view.kind !== "pending") throw new Error("menu writing run did not reach review");
  return toPending(deps.threadId, view.values);
}

export async function getPendingMenuWriting(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  now: number = Date.now()
): Promise<MenuWritingPending | null> {
  const view = await loadThread(checkpointer, threadId, restaurantId, now);
  return view.kind === "pending" ? toPending(threadId, view.values) : null;
}

export type ResumeWritingResult =
  | { status: "approved"; approved: ApprovedDishText[] }
  | { status: "invalid"; errors: string[] }
  | { status: "not_found" };

/**
 * Resumes with the owner's decisions. Idempotent once approved: if saving
 * failed and the owner retries, the same approved text comes back, so the
 * thread is only deleted by `finishMenuWriting` after a successful save.
 */
export async function resumeMenuWriting(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  restaurantId: string,
  decisions: unknown,
  now: number = Date.now()
): Promise<ResumeWritingResult> {
  const before = await loadThread(checkpointer, threadId, restaurantId, now);
  if (before.kind === "missing") return { status: "not_found" };
  if (before.kind === "finished") {
    return before.values.approved
      ? { status: "approved", approved: before.values.approved }
      : { status: "not_found" };
  }

  await buildMenuWritingGraph({ checkpointer }).invoke(new Command({ resume: decisions }), threadConfig(threadId));

  const after = await loadThread(checkpointer, threadId, restaurantId, now);
  if (after.kind === "pending") return { status: "invalid", errors: after.errors };
  if (after.kind === "finished" && after.values.approved) {
    return { status: "approved", approved: after.values.approved };
  }
  return { status: "not_found" };
}

/** Deletes the thread. Call after the approved text is saved, or to discard a run. */
export async function finishMenuWriting(
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
