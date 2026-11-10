/**
 * Scoring for the menu-import eval. Pure functions: no I/O, no model calls.
 *
 * A "prediction" is one dish the pipeline produced. We score two stages of
 * the same run, so the effect of the code guardrails is measurable on its own:
 *   - raw:   the model's structured output, before any code checks
 *   - gated: the draft after reconcileDraft (what the owner actually sees)
 */
import * as z from "zod/v4";
import { normalizeName } from "@/lib/ai/menu-onboarding";
import type { FoodType } from "@/types";

// ---------------------------------------------------------------- label format

export const LabelSchema = z.object({
  /** Where the photo came from, for your own records. */
  source: z.string().optional(),
  /** Does the menu print veg / non-veg symbols or labels? Explains food-type coverage per case. */
  hasVegMarkers: z.boolean(),
  dishes: z
    .array(
      z.object({
        name: z.string().min(1),
        /** Lowest printed price if there are several sizes; null if no price is printed. */
        price: z.number().positive().nullable(),
        /** The TRUE food type of the dish, from your own knowledge — not only what is printed. null = you don't know. */
        foodType: z.enum(["veg", "non_veg", "egg"]).nullable(),
      })
    )
    .min(1),
});

export type CaseLabel = z.infer<typeof LabelSchema>;
export type LabelDish = CaseLabel["dishes"][number];

export type PredictedDish = {
  name: string;
  price: number | null;
  foodType: FoodType | null;
};

// ---------------------------------------------------------------- matching

/** Levenshtein distance on normalised names. Menus are small, so O(n·m) is fine. */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 0 : 1 - editDistance(x, y) / longest;
}

/**
 * Small OCR-level slips ("Panner Tikka") still count as the same dish; a
 * different dish ("Paneer Tikka" vs "Paneer Tikka Masala") does not.
 * Chosen by eye on Indian menu names — reported in the output so it is not hidden.
 */
export const MATCH_THRESHOLD = 0.85;

export type MatchedPair = { label: LabelDish; pred: PredictedDish; similarity: number };

/** Greedy one-to-one matching, best similarity first. */
export function matchDishes(
  labels: LabelDish[],
  preds: PredictedDish[]
): { pairs: MatchedPair[]; missed: LabelDish[]; extra: PredictedDish[] } {
  const candidates: { li: number; pi: number; s: number }[] = [];
  labels.forEach((l, li) =>
    preds.forEach((p, pi) => {
      const s = nameSimilarity(l.name, p.name);
      if (s >= MATCH_THRESHOLD) candidates.push({ li, pi, s });
    })
  );
  candidates.sort((a, b) => b.s - a.s);

  const usedL = new Set<number>();
  const usedP = new Set<number>();
  const pairs: MatchedPair[] = [];
  for (const c of candidates) {
    if (usedL.has(c.li) || usedP.has(c.pi)) continue;
    usedL.add(c.li);
    usedP.add(c.pi);
    pairs.push({ label: labels[c.li], pred: preds[c.pi], similarity: c.s });
  }
  return {
    pairs,
    missed: labels.filter((_, i) => !usedL.has(i)),
    extra: preds.filter((_, i) => !usedP.has(i)),
  };
}

// ---------------------------------------------------------------- counts

/** Raw counts, so cases can be summed before ratios are taken (micro-average). */
export type Counts = {
  labelled: number;
  predicted: number;
  matched: number;

  /** Matched dishes whose label has a printed price. */
  priceLabelled: number;
  priceCorrect: number;
  /** Pipeline gave a price, and it was wrong. */
  priceWrong: number;
  /** Pipeline gave no price where one is printed. */
  priceMissing: number;
  /** Pipeline gave a price where none is printed (invented). */
  priceInvented: number;

  /** Matched dishes whose label has a known food type. */
  foodLabelled: number;
  foodPredicted: number;
  foodCorrect: number;
  /** Labelled veg / predicted veg / both. */
  vegLabelled: number;
  vegPredicted: number;
  vegTruePos: number;
  /** Labelled non_veg or egg. The denominator of the veg false-positive rate. */
  notVegLabelled: number;
  /** Predicted veg, actually non_veg or egg. The food-safety error. */
  vegFalsePos: number;
};

export function emptyCounts(): Counts {
  return {
    labelled: 0, predicted: 0, matched: 0,
    priceLabelled: 0, priceCorrect: 0, priceWrong: 0, priceMissing: 0, priceInvented: 0,
    foodLabelled: 0, foodPredicted: 0, foodCorrect: 0,
    vegLabelled: 0, vegPredicted: 0, vegTruePos: 0, notVegLabelled: 0, vegFalsePos: 0,
  };
}

export function addCounts(a: Counts, b: Counts): Counts {
  const out = emptyCounts();
  for (const k of Object.keys(out) as (keyof Counts)[]) out[k] = a[k] + b[k];
  return out;
}

const samePrice = (a: number, b: number) => Math.abs(a - b) < 0.005;

export type VegFalsePositive = { name: string; truth: FoodType; predictedAs: string };

export function scoreCase(
  label: CaseLabel,
  preds: PredictedDish[]
): { counts: Counts; vegFalsePositives: VegFalsePositive[]; missed: string[]; extra: string[] } {
  const { pairs, missed, extra } = matchDishes(label.dishes, preds);
  const c = emptyCounts();
  c.labelled = label.dishes.length;
  c.predicted = preds.length;
  c.matched = pairs.length;
  const vegFalsePositives: VegFalsePositive[] = [];

  for (const { label: l, pred: p } of pairs) {
    if (l.price !== null) {
      c.priceLabelled++;
      if (p.price === null) c.priceMissing++;
      else if (samePrice(l.price, p.price)) c.priceCorrect++;
      else c.priceWrong++;
    } else if (p.price !== null) {
      c.priceInvented++;
    }

    if (l.foodType !== null) {
      c.foodLabelled++;
      if (l.foodType === "veg") c.vegLabelled++;
      else c.notVegLabelled++;
      if (p.foodType !== null) {
        c.foodPredicted++;
        if (p.foodType === l.foodType) c.foodCorrect++;
        if (p.foodType === "veg") {
          c.vegPredicted++;
          if (l.foodType === "veg") c.vegTruePos++;
          else {
            c.vegFalsePos++;
            vegFalsePositives.push({ name: l.name, truth: l.foodType, predictedAs: p.foodType });
          }
        }
      }
    }
  }

  return {
    counts: c,
    vegFalsePositives,
    missed: missed.map((d) => d.name),
    extra: extra.map((d) => d.name),
  };
}

// ---------------------------------------------------------------- metrics

/** null when the denominator is 0, so "no data" is never printed as 0% or 100%. */
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export type Metrics = ReturnType<typeof metrics>;

export function metrics(c: Counts) {
  const dishPrecision = ratio(c.matched, c.predicted);
  const dishRecall = ratio(c.matched, c.labelled);
  const dishF1 =
    dishPrecision !== null && dishRecall !== null && dishPrecision + dishRecall > 0
      ? (2 * dishPrecision * dishRecall) / (dishPrecision + dishRecall)
      : null;
  return {
    dishPrecision,
    dishRecall,
    dishF1,
    /** Of printed prices on matched dishes, how many came out exactly right. */
    priceAccuracy: ratio(c.priceCorrect, c.priceLabelled),
    /** Of prices the pipeline gave, how many were right (a null is not counted as wrong). */
    pricePrecision: ratio(c.priceCorrect, c.priceCorrect + c.priceWrong),
    priceInvented: c.priceInvented,
    /** Share of dishes the pipeline gave any food type (the rest the owner sets). */
    foodCoverage: ratio(c.foodPredicted, c.foodLabelled),
    /** Of food types the pipeline gave, how many were right. */
    foodAccuracyWhenSet: ratio(c.foodCorrect, c.foodPredicted),
    vegPrecision: ratio(c.vegTruePos, c.vegPredicted),
    vegRecall: ratio(c.vegTruePos, c.vegLabelled),
    /** Non-veg / egg dishes shown as veg ÷ all non-veg / egg dishes. */
    vegFalsePositiveRate: ratio(c.vegFalsePos, c.notVegLabelled),
    vegFalsePositives: c.vegFalsePos,
  };
}
