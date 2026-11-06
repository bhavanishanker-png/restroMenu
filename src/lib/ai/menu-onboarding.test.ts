import { describe, expect, it } from "vitest";
import { normalizeName, reconcileDraft, type Extraction } from "@/lib/ai/menu-onboarding";
import { draftItemIsReady } from "@/lib/ai/draft";
import type { MenuCatalog } from "@/lib/queries/menu";

type RawItem = Extraction["categories"][number]["items"][number];

function item(overrides: Partial<RawItem> & { name: string }): RawItem {
  return {
    printedDescription: null,
    price: 200,
    foodType: "veg",
    foodTypeSource: "printed_marker",
    sizeOptionsText: null,
    suggestedDescription: null,
    ...overrides,
  };
}

function extraction(items: RawItem[], categoryName = "Starters"): Extraction {
  return { isMenu: true, categories: [{ name: categoryName, items }] };
}

const EMPTY: MenuCatalog = { categories: [], items: [] };

describe("normalizeName", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(normalizeName("  Paneer   TIKKA! ")).toBe(normalizeName("paneer-tikka"));
  });
});

describe("reconcileDraft — food type", () => {
  it("trusts a printed veg/non-veg marker", () => {
    const draft = reconcileDraft(extraction([item({ name: "Veg Cutlet" })]), EMPTY);
    expect(draft.categories[0].items[0].foodType).toBe("veg");
  });

  it("never accepts 'veg' guessed from the dish name", () => {
    const draft = reconcileDraft(
      extraction([item({ name: "Manchurian", foodType: "veg", foodTypeSource: "dish_name" })]),
      EMPTY
    );
    const dish = draft.categories[0].items[0];
    expect(dish.foodType).toBeNull();
    expect(dish.issues).toContain("unknown_food_type");
    expect(draftItemIsReady(dish)).toBe(false);
  });

  it("accepts non-veg inferred from an unambiguous name", () => {
    const draft = reconcileDraft(
      extraction([item({ name: "Chicken 65", foodType: "non_veg", foodTypeSource: "dish_name" })]),
      EMPTY
    );
    expect(draft.categories[0].items[0].foodType).toBe("non_veg");
  });

  it("drops a food type the model marked unsure", () => {
    const draft = reconcileDraft(
      extraction([item({ name: "Chef's Special", foodType: "non_veg", foodTypeSource: "unsure" })]),
      EMPTY
    );
    expect(draft.categories[0].items[0].foodType).toBeNull();
  });
});

describe("reconcileDraft — prices", () => {
  it("treats a missing, zero, negative or absurd price as missing", () => {
    const draft = reconcileDraft(
      extraction([
        item({ name: "A", price: null }),
        item({ name: "B", price: 0 }),
        item({ name: "C", price: -5 }),
        item({ name: "D", price: 1_000_000 }),
      ]),
      EMPTY
    );
    for (const dish of draft.categories[0].items) {
      expect(dish.basePrice, dish.name).toBeNull();
      expect(dish.issues).toContain("missing_price");
    }
  });

  it("rounds a valid price to paise", () => {
    const draft = reconcileDraft(extraction([item({ name: "A", price: 180.005 })]), EMPTY);
    expect(draft.categories[0].items[0].basePrice).toBe(180.01);
  });
});

describe("reconcileDraft — against the existing menu", () => {
  const catalog: MenuCatalog = {
    categories: [{ id: "cat-1", name: "starters" }],
    items: [{ id: "item-1", name: "Paneer Tikka", categoryId: "cat-1" }],
  };

  it("files dishes under an existing category instead of creating a twin", () => {
    const draft = reconcileDraft(extraction([item({ name: "Hara Bhara Kabab" })], "STARTERS"), catalog);
    expect(draft.categories[0].existingCategoryId).toBe("cat-1");
  });

  it("flags a dish that is already on the menu", () => {
    const draft = reconcileDraft(extraction([item({ name: "paneer  tikka" })]), catalog);
    const dish = draft.categories[0].items[0];
    expect(dish.duplicateOf).toBe("Paneer Tikka");
    expect(dish.issues).toContain("possible_duplicate");
  });

  it("flags a dish listed twice in the same upload", () => {
    const draft = reconcileDraft(
      extraction([item({ name: "Dal Makhani" }), item({ name: "Dal Makhani" })]),
      EMPTY
    );
    expect(draft.categories[0].items[0].duplicateOf).toBeNull();
    expect(draft.categories[0].items[1].duplicateOf).toBe("Dal Makhani");
  });
});

describe("reconcileDraft — descriptions", () => {
  it("prefers the printed description", () => {
    const draft = reconcileDraft(
      extraction([item({ name: "A", printedDescription: "As printed", suggestedDescription: "AI text" })]),
      EMPTY
    );
    expect(draft.categories[0].items[0]).toMatchObject({
      description: "As printed",
      descriptionSource: "menu",
    });
  });

  it("uses an AI description only when it makes no health claim", () => {
    const draft = reconcileDraft(
      extraction([
        item({ name: "A", suggestedDescription: "Creamy black lentils slow-cooked overnight." }),
        item({ name: "B", suggestedDescription: "A healthy, gluten-free favourite." }),
      ]),
      EMPTY
    );
    const [a, b] = draft.categories[0].items;
    expect(a).toMatchObject({ descriptionSource: "ai" });
    expect(a.issues).toContain("ai_description");
    expect(b.description).toBeNull();
  });
});

describe("reconcileDraft — shape", () => {
  it("skips nameless dishes and empty categories", () => {
    const draft = reconcileDraft(
      { isMenu: true, categories: [{ name: "Empty", items: [item({ name: "   " })] }] },
      EMPTY
    );
    expect(draft.categories).toHaveLength(0);
    expect(draft.totalItems).toBe(0);
  });
});
