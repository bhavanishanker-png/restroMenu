/**
 * Number grounding for the owner "Ask AI" assistant (T37). Pure functions, no I/O.
 *
 * The rule: every figure the model writes must come from the data. The model
 * drafts; code checks (ADR 0009). A figure is "grounded" when it equals:
 *  - a number in a tool result (including digits inside strings such as
 *    "ORD-0042" or a formatted "₹1,250"), or
 *  - a number in the owner's own question ("top 5", "last 2 weeks"), or
 *  - the difference or percentage change of two tool numbers, recomputed
 *    here with pricing.ts, so the model's arithmetic is checked rather than trusted.
 * Dates and times of day are skipped: they are formatting, not figures.
 */
import { percentChange, percentOf, roundMoney } from "@/lib/pricing";

/** A figure as written in the reply. */
export type ReplyFigure = { text: string; value: number; isPercent: boolean };

/** Numbers that need no source: "1 order", "0 cancelled". */
const ALWAYS_ALLOWED = [0, 1];

/** Pairwise derivation is O(n²); beyond this many base numbers only the first are combined. */
const MAX_DERIVATION_BASE = 200;

const MONEY_TOLERANCE = 0.01;
const PERCENT_TOLERANCE = 0.6;

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** Patterns removed before figures are read: dates and clock times. */
const SKIP_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?/g, // ISO dates / timestamps
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, // 15/11/2026
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?:,?\\s+\\d{4})?\\b`, "gi"), // 15 November 2026
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"), // November 15, 2026
  /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi, // 8:30 pm
  /\b\d{1,2}\s?(?:am|pm)\b/gi, // 8 pm
  /^\s*\d{1,2}[.)]\s+/gm, // numbered-list markers: "1. Paneer Tikka"
];

const FIGURE_RE = /(?<![\w.])\d[\d,]*(?:\.\d+)?(\s?%)?/g;

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The figures a reply states, with dates and times removed first. */
export function extractReplyFigures(reply: string): ReplyFigure[] {
  let text = reply;
  for (const re of SKIP_PATTERNS) text = text.replace(re, " ");
  const figures: ReplyFigure[] = [];
  for (const m of Array.from(text.matchAll(FIGURE_RE))) {
    const value = toNumber(m[0].replace(/\s?%$/, ""));
    if (value === null) continue;
    figures.push({ text: m[0].trim(), value, isPercent: Boolean(m[1]) });
  }
  return figures;
}

/** Every number in a value: numbers directly, and digit runs inside strings. */
export function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === "number") {
    if (Number.isFinite(value)) into.add(Math.abs(value));
  } else if (typeof value === "string") {
    for (const m of Array.from(value.matchAll(/\d[\d,]*(?:\.\d+)?/g))) {
      const n = toNumber(m[0]);
      if (n !== null) into.add(n);
    }
  } else if (Array.isArray(value)) {
    // A list's size and positions are grounded too: "your top 3 dishes", "#2 is Dal".
    for (let i = 1; i <= value.length; i++) into.add(i);
    for (const v of value) collectNumbers(v, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
  return into;
}

export type GroundingSet = { values: number[]; percents: number[] };

/** What a reply may state, given the tool results and the owner's question. */
export function buildGroundingSet(toolResults: unknown[], question: string): GroundingSet {
  const base = new Set<number>(ALWAYS_ALLOWED);
  for (const r of toolResults) collectNumbers(r, base);
  for (const f of extractReplyFigures(question)) base.add(f.value);

  const values = new Set(base);
  const percents = new Set<number>();
  const list = Array.from(base).slice(0, MAX_DERIVATION_BASE);
  for (const a of list) {
    for (const b of list) {
      if (a === b) continue;
      // Differences only, not sums: sums of arbitrary pairs would "ground" too
      // many small numbers (4 + 5 = 9 made a made-up "9 sold" pass).
      values.add(roundMoney(Math.abs(a - b)));
      const change = percentChange(a, b);
      if (change !== null) percents.add(Math.abs(change));
      percents.add(percentOf(a, b));
    }
  }
  // A percentage can also be read straight from the data (e.g. a "%"-valued field).
  base.forEach((v) => percents.add(v));
  return { values: Array.from(values), percents: Array.from(percents) };
}

function within(value: number, pool: number[], tolerance: number): boolean {
  return pool.some((p) => Math.abs(p - value) <= tolerance);
}

/** Figures in the reply that the data doesn't support. Empty means every figure checked out. */
export function findUngroundedFigures(reply: string, grounding: GroundingSet): ReplyFigure[] {
  return extractReplyFigures(reply).filter((f) =>
    f.isPercent
      ? !within(f.value, grounding.percents, PERCENT_TOLERANCE)
      : !within(f.value, grounding.values, MONEY_TOLERANCE)
  );
}

/** Feedback for the one regeneration attempt. */
export function groundingFeedback(bad: ReplyFigure[]): string {
  const list = Array.from(new Set(bad.map((f) => f.text))).join(", ");
  return (
    `Your previous answer stated ${list}, which does not match the data the tools returned. ` +
    "Answer again using only figures exactly as the tools return them. Call the tools again if you need " +
    "another period. If the data doesn't contain what was asked, say so instead of estimating."
  );
}
