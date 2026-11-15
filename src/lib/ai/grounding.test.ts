import { describe, expect, it } from "vitest";
import { buildGroundingSet, extractReplyFigures, findUngroundedFigures, groundingFeedback } from "./grounding";

const SALES_TODAY = {
  restaurant: "Test Kitchen",
  orders: 4,
  revenue: 1250,
  revenueFormatted: "₹1,250",
  averageOrderValue: 312.5,
  averageOrderValueFormatted: "₹312.50",
  cancelledOrders: 1,
};
const SALES_YESTERDAY = { ...SALES_TODAY, orders: 5, revenue: 1000, revenueFormatted: "₹1,000", averageOrderValue: 200 };

const check = (reply: string, tools: unknown[], question = "How were sales?") =>
  findUngroundedFigures(reply, buildGroundingSet(tools, question)).map((f) => f.text);

describe("extractReplyFigures", () => {
  it("reads money, counts and percentages", () => {
    expect(extractReplyFigures("4 orders, ₹1,250 total, up 25%").map((f) => [f.value, f.isPercent])).toEqual([
      [4, false],
      [1250, false],
      [25, true],
    ]);
  });

  it("skips dates and times of day", () => {
    const text = "On 15 November 2026 at 8:30 pm, and on Nov 14 at 9 am, also 2026-11-13T10:00:00Z and 13/11/2026.";
    expect(extractReplyFigures(text)).toEqual([]);
  });

  it("doesn't treat digits inside words as figures", () => {
    expect(extractReplyFigures("Table T1 ordered ORD-0042")).toEqual([{ text: "0042", value: 42, isPercent: false }]);
  });
});

describe("findUngroundedFigures", () => {
  it("accepts figures copied from the tools, in either format", () => {
    expect(check("Today: 4 orders worth ₹1,250 (average ₹312.50), 1 cancelled.", [SALES_TODAY])).toEqual([]);
  });

  it("catches a mis-stated figure", () => {
    expect(check("Today: 4 orders worth ₹1,520.", [SALES_TODAY])).toEqual(["1,520"]);
  });

  it("accepts a difference and a percentage change the code can recompute", () => {
    const reply = "Revenue is ₹250 higher than yesterday (up 25%), with 1 order fewer.";
    expect(check(reply, [SALES_TODAY, SALES_YESTERDAY])).toEqual([]);
  });

  it("catches wrong arithmetic", () => {
    expect(check("Revenue is up 40% on yesterday.", [SALES_TODAY, SALES_YESTERDAY])).toEqual(["40%"]);
    expect(check("Revenue is ₹300 higher than yesterday.", [SALES_TODAY, SALES_YESTERDAY])).toEqual(["300"]);
  });

  it("accepts numbers from the owner's own question", () => {
    expect(check("Here are your top 5 dishes over the last 14 days.", [{ items: [] }], "top 5 dishes, last 14 days")).toEqual([]);
  });

  it("fails a reply with figures but no tool data at all (no guessing)", () => {
    expect(check("Your profit today is about ₹4,800.", [])).toEqual(["4,800"]);
  });

  it("passes a reply with no figures, like 'QBite doesn't track that yet'", () => {
    expect(check("QBite doesn't track profit yet, because dish costs aren't recorded.", [])).toEqual([]);
  });

  it("accepts order numbers and table names that appear in tool strings", () => {
    const orders = { count: 1, orders: [{ orderNumber: "ORD-0042", table: "T12", total: 320 }] };
    expect(check("Order ORD-0042 at table T12 is ₹320.", [orders])).toEqual([]);
  });
});

describe("groundingFeedback", () => {
  it("names each unverified figure once", () => {
    const bad = extractReplyFigures("₹1,520 and again ₹1,520");
    expect(groundingFeedback(bad)).toMatch(/stated 1,520, which does not match/);
  });
});

describe("no false alarms on normal formatting", () => {
  const top = { days: 7, items: [{ name: "Paneer Tikka", quantity: 6 }, { name: "Dal", quantity: 5 }, { name: "Naan", quantity: 4 }] };

  it("ignores numbered-list markers", () => {
    expect(check("Top dishes:\n1. Paneer Tikka (6)\n2. Dal (5)\n3. Naan (4)", [top])).toEqual([]);
  });

  it("accepts a list's size and positions", () => {
    expect(check("Your top 3 dishes this week: Paneer Tikka is #1 and Dal is #2.", [top])).toEqual([]);
  });

  it("still catches a made-up count", () => {
    expect(check("You sold 9 Paneer Tikka this week.", [top])).toEqual(["9"]);
  });
});
