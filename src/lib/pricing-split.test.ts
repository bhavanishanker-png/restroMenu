import { describe, expect, it } from "vitest";
import {
  remainingAfterShares,
  sharePaidPercent,
  shareProgress,
  sharesMatchTotal,
  splitEqually,
  sumMoney,
} from "./pricing";

describe("splitEqually", () => {
  it("splits an even total into identical shares", () => {
    expect(splitEqually(1200, 4)).toEqual([300, 300, 300, 300]);
  });

  it("gives leftover paise to the first shares and still adds up", () => {
    const shares = splitEqually(1000, 3);
    expect(shares).toEqual([333.34, 333.33, 333.33]);
    expect(sumMoney(shares)).toBe(1000);
  });

  it("handles a total with paise", () => {
    const shares = splitEqually(1234.57, 4);
    expect(shares).toEqual([308.65, 308.64, 308.64, 308.64]);
    expect(sumMoney(shares)).toBe(1234.57);
  });

  it("a 1-way split is the whole total", () => {
    expect(splitEqually(499.99, 1)).toEqual([499.99]);
  });

  it("always adds up exactly, for many totals and counts", () => {
    for (const total of [1, 9.99, 100.01, 333.33, 1005.05, 98765.43]) {
      for (let n = 1; n <= 10; n++) {
        expect(sumMoney(splitEqually(total, n))).toBe(total);
      }
    }
  });

  it("rejects a non-positive or fractional count", () => {
    expect(() => splitEqually(100, 0)).toThrow(RangeError);
    expect(() => splitEqually(100, 2.5)).toThrow(RangeError);
  });
});

describe("remainingAfterShares / sharesMatchTotal", () => {
  it("reports what is left to assign", () => {
    expect(remainingAfterShares(1000, [400, 250.5])).toBe(349.5);
  });

  it("is negative when shares exceed the total", () => {
    expect(remainingAfterShares(500, [300, 300])).toBe(-100);
  });

  it("does not drift on float sums (0.1 + 0.2)", () => {
    expect(sharesMatchTotal(0.3, [0.1, 0.2])).toBe(true);
    expect(sharesMatchTotal(1000, [333.34, 333.33, 333.33])).toBe(true);
  });

  it("rejects shares that are a paisa short", () => {
    expect(sharesMatchTotal(1000, [333.33, 333.33, 333.33])).toBe(false);
  });
});

describe("shareProgress", () => {
  it("reports partial payment", () => {
    expect(shareProgress(1300, [420, 380])).toEqual({ paid: 800, remaining: 500, fullyPaid: false });
  });

  it("is fully paid when paid shares cover the total", () => {
    expect(shareProgress(1000, [333.34, 333.33, 333.33])).toEqual({ paid: 1000, remaining: 0, fullyPaid: true });
  });

  it("never reports a negative remaining on overpayment", () => {
    expect(shareProgress(500, [300, 300]).remaining).toBe(0);
    expect(shareProgress(500, [300, 300]).fullyPaid).toBe(true);
  });

  it("nothing paid yet", () => {
    expect(shareProgress(750, [])).toEqual({ paid: 0, remaining: 750, fullyPaid: false });
  });
});

describe("sharePaidPercent", () => {
  it("caps at 100", () => {
    expect(sharePaidPercent(500, [300, 300])).toBe(100);
    expect(sharePaidPercent(1000, [250])).toBe(25);
  });
});
