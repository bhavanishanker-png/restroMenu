import { describe, expect, it } from "vitest";
import { matchDishes, metrics, nameSimilarity, scoreCase, type CaseLabel, type PredictedDish } from "./score";

const label = (dishes: CaseLabel["dishes"]): CaseLabel => ({ hasVegMarkers: true, dishes });

describe("nameSimilarity / matchDishes", () => {
  it("treats case, spacing and punctuation as the same dish", () => {
    expect(nameSimilarity("Paneer  Tikka!", "paneer tikka")).toBe(1);
  });

  it("tolerates a one-letter OCR slip but not a different dish", () => {
    const { pairs, missed, extra } = matchDishes(
      [
        { name: "Paneer Tikka", price: 220, foodType: "veg" },
        { name: "Paneer Tikka Masala", price: 260, foodType: "veg" },
      ],
      [{ name: "Panner Tikka", price: 220, foodType: "veg" }]
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].label.name).toBe("Paneer Tikka");
    expect(missed.map((d) => d.name)).toEqual(["Paneer Tikka Masala"]);
    expect(extra).toEqual([]);
  });

  it("matches one-to-one: a dish extracted twice counts once", () => {
    const { pairs, extra } = matchDishes(
      [{ name: "Dal Makhani", price: 180, foodType: "veg" }],
      [
        { name: "Dal Makhani", price: 180, foodType: "veg" },
        { name: "Dal Makhani", price: 180, foodType: "veg" },
      ]
    );
    expect(pairs).toHaveLength(1);
    expect(extra).toHaveLength(1);
  });
});

describe("scoreCase", () => {
  const truth = label([
    { name: "Paneer Tikka", price: 220, foodType: "veg" },
    { name: "Chicken 65", price: 250, foodType: "non_veg" },
    { name: "Egg Curry", price: 160, foodType: "egg" },
    { name: "Veg Manchurian", price: null, foodType: "veg" },
  ]);

  it("counts dish precision and recall", () => {
    const preds: PredictedDish[] = [
      { name: "Paneer Tikka", price: 220, foodType: "veg" },
      { name: "Chicken 65", price: 250, foodType: "non_veg" },
      { name: "Gobi 65", price: 200, foodType: "veg" }, // invented
    ];
    const m = metrics(scoreCase(truth, preds).counts);
    expect(m.dishPrecision).toBeCloseTo(2 / 3);
    expect(m.dishRecall).toBeCloseTo(2 / 4);
  });

  it("splits price errors into wrong, missing and invented", () => {
    const preds: PredictedDish[] = [
      { name: "Paneer Tikka", price: 220, foodType: null }, // correct
      { name: "Chicken 65", price: 260, foodType: null }, // wrong
      { name: "Egg Curry", price: null, foodType: null }, // missing
      { name: "Veg Manchurian", price: 150, foodType: null }, // invented: none printed
    ];
    const { counts } = scoreCase(truth, preds);
    expect(counts).toMatchObject({ priceLabelled: 3, priceCorrect: 1, priceWrong: 1, priceMissing: 1, priceInvented: 1 });
    const m = metrics(counts);
    expect(m.priceAccuracy).toBeCloseTo(1 / 3);
    expect(m.pricePrecision).toBeCloseTo(1 / 2);
  });

  it("counts a non-veg or egg dish shown as veg as a veg false positive", () => {
    const preds: PredictedDish[] = [
      { name: "Paneer Tikka", price: 220, foodType: "veg" },
      { name: "Chicken 65", price: 250, foodType: "veg" }, // FP
      { name: "Egg Curry", price: 160, foodType: "veg" }, // FP
      { name: "Veg Manchurian", price: null, foodType: null }, // abstained
    ];
    const { counts, vegFalsePositives } = scoreCase(truth, preds);
    const m = metrics(counts);
    expect(m.vegFalsePositives).toBe(2);
    expect(m.vegFalsePositiveRate).toBe(1); // 2 of the 2 non-veg/egg dishes
    expect(m.vegPrecision).toBeCloseTo(1 / 3);
    expect(m.vegRecall).toBeCloseTo(1 / 2);
    expect(m.foodCoverage).toBeCloseTo(3 / 4);
    expect(vegFalsePositives.map((f) => f.name)).toEqual(["Chicken 65", "Egg Curry"]);
  });

  it("does not count an abstention (null) as a false positive", () => {
    const preds: PredictedDish[] = [{ name: "Chicken 65", price: 250, foodType: null }];
    const m = metrics(scoreCase(truth, preds).counts);
    expect(m.vegFalsePositives).toBe(0);
    expect(m.vegFalsePositiveRate).toBe(0);
    expect(m.foodAccuracyWhenSet).toBeNull();
  });

  it("reports n/a (null), not 0%, when there is nothing to measure", () => {
    const m = metrics(scoreCase(truth, []).counts);
    expect(m.dishPrecision).toBeNull();
    expect(m.dishRecall).toBe(0);
  });
});
