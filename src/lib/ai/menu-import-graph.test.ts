import { describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import {
  IMPORT_TTL_MS,
  discardMenuImport,
  getPendingMenuImport,
  mergeExtractions,
  resumeMenuImport,
  startMenuImport,
  validateDecisions,
  type PageExtraction,
} from "./menu-import-graph";
import type { Extraction } from "./menu-onboarding";
import type { MenuCatalog } from "@/lib/queries/menu";
import type { MenuDraft } from "@/types";

type RawItem = Extraction["categories"][number]["items"][number];

function dish(name: string, price: number | null, foodType: RawItem["foodType"] = "veg"): RawItem {
  return {
    name,
    printedDescription: null,
    price,
    foodType,
    foodTypeSource: foodType ? "printed_marker" : "unsure",
    sizeOptionsText: null,
    suggestedDescription: null,
  };
}

function page(...categories: [string, RawItem[]][]): Extraction {
  return { isMenu: true, categories: categories.map(([name, items]) => ({ name, items })) };
}

const EMPTY_CATALOG: MenuCatalog = { categories: [], items: [] };
const RESTAURANT = "rest-a";

/** A fake extractor: page number → canned result, and a call counter. */
function fakeExtractor(pages: Record<number, PageExtraction | Error>) {
  const calls: number[] = [];
  const extractPage = async (n: number): Promise<PageExtraction> => {
    calls.push(n);
    const r = pages[n];
    if (r instanceof Error) throw r;
    return r;
  };
  return { extractPage, calls };
}

async function start(
  checkpointer: MemorySaver,
  pages: Record<number, PageExtraction | Error>,
  opts: { threadId?: string; now?: number; catalog?: MenuCatalog } = {}
) {
  const fake = fakeExtractor(pages);
  const result = await startMenuImport({
    checkpointer,
    extractPage: fake.extractPage,
    catalog: opts.catalog ?? EMPTY_CATALOG,
    threadId: opts.threadId ?? "thread-1",
    restaurantId: RESTAURANT,
    pageCount: Object.keys(pages).length,
    now: opts.now,
  });
  return { result, calls: fake.calls };
}

describe("mergeExtractions", () => {
  it("joins a section split across pages and keeps first-seen order", () => {
    const merged = mergeExtractions([
      page(["Starters", [dish("Paneer Tikka", 220)]], ["Mains", [dish("Dal", 160)]]),
      page(["starters", [dish("Spring Roll", 150)]], ["Desserts", [dish("Gulab Jamun", 90)]]),
    ]);
    expect(merged.categories.map((c) => c.name)).toEqual(["Starters", "Mains", "Desserts"]);
    expect(merged.categories[0].items.map((i) => i.name)).toEqual(["Paneer Tikka", "Spring Roll"]);
  });
});

describe("startMenuImport", () => {
  it("reads every page in parallel and pauses at owner review with one merged draft", async () => {
    const cp = new MemorySaver();
    const { result, calls } = await start(cp, {
      1: { page: 1, ok: true, extraction: page(["Starters", [dish("Paneer Tikka", 220)]]) },
      2: { page: 2, ok: true, extraction: page(["Mains", [dish("Dal", 160)]]) },
    });
    expect(calls.sort()).toEqual([1, 2]);
    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.pending.draft.totalItems).toBe(2);
    expect(result.pending.pageCount).toBe(2);
    expect(result.pending.failedPages).toEqual([]);
  });

  it("reports a failed page by number and still imports the rest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cp = new MemorySaver();
    const { result } = await start(cp, {
      1: { page: 1, ok: true, extraction: page(["Starters", [dish("Paneer Tikka", 220)]]) },
      2: { page: 2, ok: false, code: "NOT_A_MENU" },
      3: new Error("network down"),
    });
    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.pending.failedPages.map((f) => [f.page, f.code])).toEqual([
      [2, "NOT_A_MENU"],
      [3, "AI_ERROR"],
    ]);
    expect(result.pending.draft.totalItems).toBe(1);
  });

  it("finishes without review, and keeps no thread, when no page could be read", async () => {
    const cp = new MemorySaver();
    const { result } = await start(cp, { 1: { page: 1, ok: false, code: "AI_DECLINED" } });
    expect(result).toEqual({
      status: "failed",
      failedPages: [expect.objectContaining({ page: 1, code: "AI_DECLINED" })],
    });
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT)).toBeNull();
  });

  it("flags a dish already on the menu as a duplicate (code check, not the model)", async () => {
    const cp = new MemorySaver();
    const catalog: MenuCatalog = { categories: [], items: [{ id: "x", name: "Paneer Tikka", categoryId: null }] };
    const { result } = await start(
      cp,
      { 1: { page: 1, ok: true, extraction: page(["Starters", [dish("paneer  tikka", 220)]]) } },
      { catalog }
    );
    if (result.status !== "review") throw new Error("expected review");
    expect(result.pending.draft.categories[0].items[0].duplicateOf).toBe("Paneer Tikka");
  });
});

describe("pause and resume", () => {
  const PAGES = {
    1: {
      page: 1,
      ok: true as const,
      extraction: page(["Starters", [dish("Paneer Tikka", 220), dish("Mystery Cutlet", null, null)]]),
    },
  };

  it("returns the same draft later, without reading the menu again", async () => {
    const cp = new MemorySaver();
    const { result, calls } = await start(cp, PAGES);
    if (result.status !== "review") throw new Error("expected review");

    const later = await getPendingMenuImport(cp, "thread-1", RESTAURANT);
    expect(later?.draft).toEqual(result.pending.draft);
    expect(calls).toEqual([1]); // no second AI call
  });

  it("hides another restaurant's thread (tenant check)", async () => {
    const cp = new MemorySaver();
    await start(cp, PAGES);
    expect(await getPendingMenuImport(cp, "thread-1", "rest-b")).toBeNull();
    expect(await resumeMenuImport(cp, "thread-1", "rest-b", [])).toEqual({ status: "not_found" });
    expect(await discardMenuImport(cp, "thread-1", "rest-b")).toBe(false);
    // Still there for its owner.
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT)).not.toBeNull();
  });

  it("rejects invalid choices and stays paused, then approves once they are fixed", async () => {
    const cp = new MemorySaver();
    const { calls } = await start(cp, PAGES);

    // Mystery Cutlet has no price and no food type; the owner forgot both.
    const bad = await resumeMenuImport(cp, "thread-1", RESTAURANT, [
      { categoryIndex: 0, itemIndex: 1, basePrice: null, foodType: null },
    ]);
    expect(bad.status).toBe("invalid");
    if (bad.status === "invalid") expect(bad.errors[0]).toMatch(/Mystery Cutlet: needs a price/);
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT)).not.toBeNull();

    const good = await resumeMenuImport(cp, "thread-1", RESTAURANT, [
      { categoryIndex: 0, itemIndex: 0, basePrice: 999, foodType: "non_veg" }, // AI-read values win
      { categoryIndex: 0, itemIndex: 1, basePrice: 149.999, foodType: "egg" },
    ]);
    expect(good.status).toBe("approved");
    if (good.status !== "approved") return;
    expect(good.categories[0].items.map((i) => [i.name, i.basePrice, i.foodType])).toEqual([
      ["Paneer Tikka", 220, "veg"],
      ["Mystery Cutlet", 150, "egg"],
    ]);
    expect(calls).toEqual([1]); // resumes never re-read the menu
    // Approved threads are cleaned up.
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT)).toBeNull();
  });

  it("expires imports older than the TTL", async () => {
    const cp = new MemorySaver();
    await start(cp, PAGES, { now: 0 });
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT, IMPORT_TTL_MS + 1)).toBeNull();
  });

  it("discard removes the paused import", async () => {
    const cp = new MemorySaver();
    await start(cp, PAGES);
    expect(await discardMenuImport(cp, "thread-1", RESTAURANT)).toBe(true);
    expect(await getPendingMenuImport(cp, "thread-1", RESTAURANT)).toBeNull();
  });
});

describe("validateDecisions", () => {
  const draft: MenuDraft = {
    totalItems: 1,
    categories: [
      {
        name: "Starters",
        existingCategoryId: null,
        items: [
          {
            name: "Paneer Tikka",
            description: null,
            descriptionSource: null,
            basePrice: 220,
            foodType: "veg",
            sizeOptionsText: null,
            duplicateOf: null,
            issues: [],
          },
        ],
      },
    ],
  };

  it("rejects dishes that are not in the draft", () => {
    const r = validateDecisions(draft, [{ categoryIndex: 3, itemIndex: 0, basePrice: 1, foodType: "veg" }]);
    expect(r).toEqual({ ok: false, errors: ["A selected dish is not in this import."] });
  });

  it("rejects the same dish twice and malformed payloads", () => {
    const twice = { categoryIndex: 0, itemIndex: 0, basePrice: null, foodType: null };
    expect(validateDecisions(draft, [twice, twice]).ok).toBe(false);
    expect(validateDecisions(draft, "drop table").ok).toBe(false);
    expect(validateDecisions(draft, []).ok).toBe(false);
  });
});
