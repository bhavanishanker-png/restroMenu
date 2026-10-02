import { describe, expect, it } from "vitest";
import {
  averageMoney,
  percentChange,
  percentOf,
  sumMoney,
  toPaise,
  buildLineId,
  computeUnitPrice,
  priceCart,
  priceLine,
  roundMoney,
} from "./pricing";
import type { CartLine } from "@/types";

// ---------------------------------------------------------------- helpers

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "test-line",
    itemId: "item-1",
    itemName: "Test Item",
    imageUrl: null,
    foodType: "veg",
    basePrice: 100,
    taxRate: 5,
    prepMinutes: 15,
    variantId: null,
    variantName: null,
    variantPriceDelta: 0,
    addons: [],
    quantity: 1,
    notes: null,
    ...overrides,
  };
}

const DINE_IN_SETTINGS = { serviceChargePct: 0, packingCharge: 0 } as const;

// ---------------------------------------------------------------- roundMoney

describe("roundMoney", () => {
  it("rounds .005 up, not down (float trap)", () => {
    // Naive Math.round(5.005 * 100) / 100 = 5.00 due to IEEE 754
    expect(roundMoney(5.005)).toBe(5.01);
  });

  it("leaves an exact 2dp value unchanged", () => {
    expect(roundMoney(12.34)).toBe(12.34);
  });
});

// ---------------------------------------------------------------- computeUnitPrice

describe("computeUnitPrice", () => {
  it("base only — no variant, no addons", () => {
    expect(computeUnitPrice(200, 0, [])).toBe(200);
  });

  it("adds variant price delta", () => {
    expect(computeUnitPrice(200, 50, [])).toBe(250);
  });

  it("adds all addon prices", () => {
    const addons = [{ price: 20 }, { price: 30 }, { price: 10 }];
    expect(computeUnitPrice(150, 0, addons)).toBe(210);
  });

  it("handles a negative variant delta (smaller portion)", () => {
    expect(computeUnitPrice(300, -50, [])).toBe(250);
  });
});

// ---------------------------------------------------------------- priceLine

describe("priceLine", () => {
  it("single item, no variant, no addons, quantity 1", () => {
    const line = makeLine({ basePrice: 100, taxRate: 5, quantity: 1 });
    const result = priceLine(line);
    expect(result.unitPrice).toBe(100);
    expect(result.lineSubtotal).toBe(100);
    expect(result.lineTax).toBe(5);
    expect(result.lineTotal).toBe(105);
  });

  it("item with a variant price delta", () => {
    const line = makeLine({ basePrice: 200, variantPriceDelta: 50, taxRate: 5 });
    const result = priceLine(line);
    expect(result.unitPrice).toBe(250);
    expect(result.lineSubtotal).toBe(250);
    expect(result.lineTax).toBe(12.5);
    expect(result.lineTotal).toBe(262.5);
  });

  it("item with 3 addons, quantity 2 — addons are PER UNIT not per line", () => {
    const addons = [
      { id: "a1", name: "Extra Gravy", price: 20 },
      { id: "a2", name: "Extra Cheese", price: 30 },
      { id: "a3", name: "Extra Sauce", price: 10 },
    ];
    // unit price = 150 + 60 = 210; line subtotal = 210 × 2 = 420
    const line = makeLine({
      basePrice: 150,
      variantPriceDelta: 0,
      addons,
      quantity: 2,
      taxRate: 5,
    });
    const result = priceLine(line);
    expect(result.unitPrice).toBe(210);
    expect(result.lineSubtotal).toBe(420);
    expect(result.lineTax).toBe(21);
    expect(result.lineTotal).toBe(441);
  });

  it("rounding: tax on 100.10 at 5% = 5.005 → rounds to 5.01, not 5.00", () => {
    const line = makeLine({ basePrice: 100.1, taxRate: 5, quantity: 1 });
    const result = priceLine(line);
    expect(result.lineTax).toBe(5.01);
    expect(result.lineTotal).toBe(105.11);
  });
});

// ---------------------------------------------------------------- priceCart

describe("priceCart", () => {
  it("empty cart returns all zeros", () => {
    const result = priceCart([], {
      orderType: "dine_in",
      settings: { serviceChargePct: 10, packingCharge: 20 },
    });
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.serviceCharge).toBe(0);
    expect(result.packingCharge).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("two items with different tax rates compute tax per item, not flat on subtotal", () => {
    const food = makeLine({
      lineId: "food",
      itemId: "i1",
      basePrice: 200,
      taxRate: 5,
      quantity: 1,
    });
    const beverage = makeLine({
      lineId: "bev",
      itemId: "i2",
      basePrice: 100,
      taxRate: 12,
      quantity: 1,
    });

    const result = priceCart([food, beverage], {
      orderType: "dine_in",
      settings: DINE_IN_SETTINGS,
    });

    // subtotal = 300; wrong flat tax at 5% would be 15, at 12% would be 36
    // correct: 200×5% + 100×12% = 10 + 12 = 22
    expect(result.subtotal).toBe(300);
    expect(result.taxTotal).toBe(22);
    expect(result.total).toBe(322);
  });

  it("dine-in applies service charge; packing charge is zero", () => {
    const line = makeLine({ basePrice: 100, taxRate: 0, quantity: 1 });

    const result = priceCart([line], {
      orderType: "dine_in",
      settings: { serviceChargePct: 10, packingCharge: 20 },
    });

    expect(result.serviceCharge).toBe(10); // 10% of 100
    expect(result.packingCharge).toBe(0);
    expect(result.total).toBe(110);
  });

  it("takeaway applies packing charge; service charge is zero", () => {
    const line = makeLine({ basePrice: 100, taxRate: 0, quantity: 1 });

    const result = priceCart([line], {
      orderType: "takeaway",
      settings: { serviceChargePct: 10, packingCharge: 20 },
    });

    expect(result.serviceCharge).toBe(0);
    expect(result.packingCharge).toBe(20);
    expect(result.total).toBe(120);
  });

  it("discount is subtracted from gross and total is floored at 0", () => {
    const line = makeLine({ basePrice: 100, taxRate: 0, quantity: 1 });

    const regular = priceCart([line], {
      orderType: "dine_in",
      settings: DINE_IN_SETTINGS,
      discount: 30,
    });
    expect(regular.discount).toBe(30);
    expect(regular.total).toBe(70);

    // discount > total → total clamps to 0
    const overDiscount = priceCart([line], {
      orderType: "dine_in",
      settings: DINE_IN_SETTINGS,
      discount: 200,
    });
    expect(overDiscount.total).toBe(0);
  });

  it("pre_order behaves like takeaway: packing charge applies, service charge does not", () => {
    const line = makeLine({ basePrice: 100, taxRate: 0, quantity: 1 });

    const result = priceCart([line], {
      orderType: "pre_order",
      settings: { serviceChargePct: 10, packingCharge: 15 },
    });

    expect(result.serviceCharge).toBe(0);
    expect(result.packingCharge).toBe(15);
  });
});

// ---------------------------------------------------------------- buildLineId

describe("buildLineId", () => {
  it("same id regardless of addon id order", () => {
    const a = buildLineId("item-1", null, ["addon-c", "addon-a", "addon-b"], null);
    const b = buildLineId("item-1", null, ["addon-a", "addon-b", "addon-c"], null);
    expect(a).toBe(b);
  });

  it("different items produce different ids", () => {
    const a = buildLineId("item-1", null, [], null);
    const b = buildLineId("item-2", null, [], null);
    expect(a).not.toBe(b);
  });

  it("different variants produce different ids", () => {
    const a = buildLineId("item-1", "variant-half", [], null);
    const b = buildLineId("item-1", "variant-full", [], null);
    expect(a).not.toBe(b);
  });

  it("different notes produce different ids", () => {
    const a = buildLineId("item-1", null, [], "less spicy");
    const b = buildLineId("item-1", null, [], "no onion");
    expect(a).not.toBe(b);
  });

  it("note comparison is case-insensitive and trims whitespace", () => {
    const a = buildLineId("item-1", null, [], "  Less Spicy  ");
    const b = buildLineId("item-1", null, [], "less spicy");
    expect(a).toBe(b);
  });
});

describe("sumMoney", () => {
  it("adds in paise, so two-decimal amounts don't drift", () => {
    // Plain float addition gives 0.30000000000000004.
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(814.1))).toBe(8141);
  });

  it("is 0 for no orders", () => {
    expect(sumMoney([])).toBe(0);
  });

  it("handles a typical day of mixed totals", () => {
    expect(sumMoney([814.1, 1083.6, 745.5, 588])).toBe(3231.2);
  });
});

describe("averageMoney", () => {
  it("rounds to two decimals", () => {
    expect(averageMoney(100, 3)).toBe(33.33);
  });

  it("is 0, not NaN, for a zero count", () => {
    expect(averageMoney(0, 0)).toBe(0);
    expect(averageMoney(500, 0)).toBe(0);
  });
});

describe("toPaise", () => {
  it("converts whole and fractional rupees", () => {
    expect(toPaise(920)).toBe(92000);
    expect(toPaise(814.1)).toBe(81410);
  });

  it("does not lose a paisa on float boundaries", () => {
    // 1.005 * 100 === 100.49999999999999 — a bare Math.round gives 100.
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(1083.6)).toBe(108360);
  });

  it("is 0 for a free order", () => {
    expect(toPaise(0)).toBe(0);
  });
});

describe("percentChange", () => {
  it("is signed and rounded to one decimal", () => {
    expect(percentChange(1500, 1000)).toBe(50);
    expect(percentChange(900, 1200)).toBe(-25);
    expect(percentChange(1000, 3000)).toBe(-66.7);
  });

  it("is null with nothing to compare against", () => {
    expect(percentChange(500, 0)).toBeNull();
  });
});

describe("percentOf", () => {
  it("is a 0-100 share", () => {
    expect(percentOf(171.2, 3231.2)).toBe(5.3);
    expect(percentOf(0, 100)).toBe(0);
  });

  it("is 0 for an empty whole", () => {
    expect(percentOf(10, 0)).toBe(0);
  });
});
