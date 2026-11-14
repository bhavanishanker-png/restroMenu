import { describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import {
  MAX_ATTEMPTS,
  WRITING_CONCURRENCY,
  finishMenuWriting,
  getPendingMenuWriting,
  resumeMenuWriting,
  startMenuWriting,
  validateWritingDecisions,
} from "./menu-writing-graph";
import { startMenuImport } from "./menu-import-graph";
import type { DishInput, DishText, WriteDishResult } from "./dish-writing";

const R = "rest-a";

function dish(id: string, name: string, currentDescription: string | null = null): DishInput {
  return { itemId: id, name, category: "Starters", foodType: "veg", currentDescription };
}

const GOOD: DishText = {
  descriptionEn: "Cottage cheese cubes marinated in spices and grilled in a tandoor.",
  nameHi: "पनीर टिक्का",
  descriptionHi: "मसालों में लिपटे पनीर के टुकड़े, तंदूर में भुने हुए।",
};

/** A fake writer: per-dish list of answers, one per attempt (last one repeats). */
function fakeWriter(script: Record<string, (DishText | Error | "declined")[]>) {
  const calls: { id: string; feedback: string | null }[] = [];
  let running = 0;
  let peak = 0;
  const writeDish = async (d: DishInput, feedback: string | null): Promise<WriteDishResult> => {
    calls.push({ id: d.itemId, feedback });
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    const answers = script[d.itemId] ?? [GOOD];
    const n = calls.filter((c) => c.id === d.itemId).length;
    const answer = answers[Math.min(n, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    if (answer === "declined") return { ok: false, code: "AI_DECLINED" };
    return { ok: true, text: answer, usage: { inputTokens: 1, outputTokens: 1 } };
  };
  return { writeDish, calls, peak: () => peak };
}

async function start(cp: MemorySaver, dishes: DishInput[], script: Parameters<typeof fakeWriter>[0] = {}, now?: number) {
  const fake = fakeWriter(script);
  const pending = await startMenuWriting({
    checkpointer: cp,
    writeDish: fake.writeDish,
    threadId: "w-1",
    restaurantId: R,
    dishes,
    now,
  });
  return { pending, fake };
}

describe("dish subgraph: write → check → retry", () => {
  it("accepts clean text on the first attempt", async () => {
    const { pending, fake } = await start(new MemorySaver(), [dish("a", "Paneer Tikka")]);
    expect(pending.dishes[0]).toMatchObject({ nameHi: "पनीर टिक्का", attempts: 1, flags: [] });
    expect(fake.calls).toEqual([{ id: "a", feedback: null }]);
  });

  it("rewrites a description with a health claim, passing the problem back as feedback", async () => {
    const claim = { ...GOOD, descriptionEn: "A healthy, gluten-free starter." };
    const { pending, fake } = await start(new MemorySaver(), [dish("a", "Paneer Tikka")], { a: [claim, GOOD] });
    expect(pending.dishes[0]).toMatchObject({ descriptionEn: GOOD.descriptionEn, attempts: 2, flags: [] });
    expect(fake.calls[1].feedback).toMatch(/health, diet or allergy claim/);
  });

  it("catches a Hindi health claim too", async () => {
    const claim = { ...GOOD, descriptionHi: "एक हेल्दी और पौष्टिक व्यंजन।" };
    const { pending } = await start(new MemorySaver(), [dish("a", "Paneer Tikka")], { a: [claim, GOOD] });
    expect(pending.dishes[0].attempts).toBe(2);
    expect(pending.dishes[0].descriptionHi).toBe(GOOD.descriptionHi);
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts: drops only the bad field and flags the dish`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const claim = { ...GOOD, descriptionEn: "Healthy and sugar-free." };
    const { pending, fake } = await start(new MemorySaver(), [dish("a", "Paneer Tikka")], { a: [claim] });
    expect(fake.calls).toHaveLength(MAX_ATTEMPTS);
    expect(pending.dishes[0]).toMatchObject({
      descriptionEn: null, // never saved with the claim
      nameHi: "पनीर टिक्का", // the good fields survive
      attempts: MAX_ATTEMPTS,
      flags: ["health_claim"],
    });
  });

  it("retries a Hindi name that isn't in Devanagari", async () => {
    const roman = { ...GOOD, nameHi: "Paneer Tikka" };
    const { pending, fake } = await start(new MemorySaver(), [dish("a", "Paneer Tikka")], { a: [roman, GOOD] });
    expect(fake.calls[1].feedback).toMatch(/Devanagari/);
    expect(pending.dishes[0].nameHi).toBe("पनीर टिक्का");
  });

  it("never writes an English description for a dish that already has one", async () => {
    const { pending } = await start(new MemorySaver(), [dish("a", "Paneer Tikka", "Owner wrote this.")]);
    expect(pending.dishes[0].descriptionEn).toBeNull();
    expect(pending.dishes[0].currentDescription).toBe("Owner wrote this.");
  });

  it("marks a dish whose AI call failed, without sinking the others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { pending } = await start(
      new MemorySaver(),
      [dish("a", "Paneer Tikka"), dish("b", "Dal"), dish("c", "Naan")],
      { b: [new Error("network")], c: ["declined"] }
    );
    expect(pending.dishes.map((d) => [d.itemId, d.flags])).toEqual([
      ["a", []],
      ["b", ["ai_failed"]],
      ["c", ["ai_failed"]],
    ]);
  });
});

describe("fan-out", () => {
  it(`writes dishes in parallel, at most ${WRITING_CONCURRENCY} at a time, and keeps the owner's order`, async () => {
    const dishes = Array.from({ length: 12 }, (_, i) => dish(`d${i}`, `Dish ${i}`));
    const { pending, fake } = await start(new MemorySaver(), dishes);
    expect(fake.peak()).toBeGreaterThan(1);
    expect(fake.peak()).toBeLessThanOrEqual(WRITING_CONCURRENCY);
    expect(pending.dishes.map((d) => d.itemId)).toEqual(dishes.map((d) => d.itemId));
  });
});

describe("pause, resume and save", () => {
  it("returns the same results later without calling the AI again", async () => {
    const cp = new MemorySaver();
    const { pending, fake } = await start(cp, [dish("a", "Paneer Tikka")]);
    expect(await getPendingMenuWriting(cp, "w-1", R)).toEqual(pending);
    expect(fake.calls).toHaveLength(1);
  });

  it("hides the run from another restaurant and from the menu-import workflow", async () => {
    const cp = new MemorySaver();
    await start(cp, [dish("a", "Paneer Tikka")]);
    expect(await getPendingMenuWriting(cp, "w-1", "rest-b")).toBeNull();
    expect(await resumeMenuWriting(cp, "w-1", "rest-b", [])).toEqual({ status: "not_found" });

    // A menu-import thread id can't be read or resumed as a writing run.
    await startMenuImport({
      checkpointer: cp,
      extractPage: async (page) => ({ page, ok: false, code: "NOT_A_MENU" }),
      catalog: { categories: [], items: [] },
      threadId: "imp-1",
      restaurantId: R,
      pageCount: 1,
    });
    expect(await getPendingMenuWriting(cp, "imp-1", R)).toBeNull();
  });

  it("stays paused on invalid text, then approves; approval is repeatable until finished", async () => {
    const cp = new MemorySaver();
    const { fake } = await start(cp, [dish("a", "Paneer Tikka"), dish("b", "Dal Makhani", "Slow-cooked black lentils.")]);

    const bad = await resumeMenuWriting(cp, "w-1", R, [
      { itemId: "a", descriptionEn: GOOD.descriptionEn, nameHi: "  ", descriptionHi: null },
      { itemId: "b", descriptionEn: "Not allowed: b has one.", nameHi: "दाल मखनी", descriptionHi: null },
    ]);
    expect(bad.status).toBe("invalid");
    if (bad.status === "invalid") {
      expect(bad.errors).toEqual([
        "Paneer Tikka: needs a Hindi name.",
        "Dal Makhani: already has an English description. Edit it in the menu manager.",
      ]);
    }
    expect(await getPendingMenuWriting(cp, "w-1", R)).not.toBeNull();

    const decisions = [
      { itemId: "a", descriptionEn: GOOD.descriptionEn, nameHi: GOOD.nameHi, descriptionHi: GOOD.descriptionHi },
      { itemId: "b", descriptionEn: null, nameHi: "दाल मखनी", descriptionHi: null },
    ];
    const good = await resumeMenuWriting(cp, "w-1", R, decisions);
    expect(good.status).toBe("approved");
    if (good.status !== "approved") return;
    expect(good.approved.map((a) => [a.itemId, a.hiSource])).toEqual([
      ["a", "ai"], // unchanged AI text
      ["b", "owner"], // owner typed a different Hindi text
    ]);

    // Save failed? Retrying returns the same approval without re-running anything.
    expect(await resumeMenuWriting(cp, "w-1", R, [])).toEqual(good);
    expect(fake.calls).toHaveLength(2);

    expect(await finishMenuWriting(cp, "w-1", R)).toBe(true);
    expect(await resumeMenuWriting(cp, "w-1", R, decisions)).toEqual({ status: "not_found" });
  });
});

describe("validateWritingDecisions", () => {
  it("rejects dishes outside the run, duplicates and malformed input", () => {
    const results = [
      {
        itemId: "a", name: "Paneer Tikka", category: "Starters", currentDescription: null,
        descriptionEn: null, nameHi: "पनीर टिक्का", descriptionHi: null, attempts: 1, flags: [],
      },
    ];
    const one = { itemId: "a", descriptionEn: null, nameHi: "पनीर टिक्का", descriptionHi: null };
    expect(validateWritingDecisions(results, [{ ...one, itemId: "zzz" }]).ok).toBe(false);
    expect(validateWritingDecisions(results, [one, one]).ok).toBe(false);
    expect(validateWritingDecisions(results, "nope").ok).toBe(false);
    expect(validateWritingDecisions(results, [one]).ok).toBe(true);
  });
});
