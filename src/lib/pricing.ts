/**
 * pricing.ts — the ONLY place in this codebase where money is calculated.
 *
 * Rules:
 *  - No arithmetic on prices anywhere else. Not in components, not in route handlers.
 *  - The server recomputes every total from database prices. A client-supplied
 *    total is a display value and is always ignored.
 *  - Tax is applied PER ITEM. Food is typically 5% GST, beverages 12%. A flat
 *    rate on the subtotal produces a wrong bill.
 *  - Round once, at each defined boundary, using roundMoney.
 */

import type {
  CartLine,
  OrderType,
  PriceBreakdown,
  PricedLine,
  RestaurantSettings,
  SelectedAddon,
} from '@/types';

/** Round to 2 decimals, half away from zero. Avoids the 1.005 float trap. */
export function roundMoney(value: number): number {
  const shifted = Math.round((value + Number.EPSILON) * 100);
  return shifted / 100;
}

/** Format for display. Amounts are stored as numbers, never as formatted strings. */
export function formatMoney(value: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Unit price = base + variant delta + sum of add-on prices.
 * Add-ons are per unit, not per line — two Paneer Tikkas with extra gravy
 * means two portions of extra gravy.
 */
export function computeUnitPrice(
  basePrice: number,
  variantPriceDelta: number,
  addons: Pick<SelectedAddon, 'price'>[]
): number {
  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  return roundMoney(basePrice + variantPriceDelta + addonTotal);
}

/** Price a single cart line, including its own tax at its own rate. */
export function priceLine(line: CartLine): PricedLine {
  const unitPrice = computeUnitPrice(
    line.basePrice,
    line.variantPriceDelta,
    line.addons
  );
  const lineSubtotal = roundMoney(unitPrice * line.quantity);
  const lineTax = roundMoney((lineSubtotal * line.taxRate) / 100);

  return {
    lineId: line.lineId,
    unitPrice,
    quantity: line.quantity,
    lineSubtotal,
    taxRate: line.taxRate,
    lineTax,
    lineTotal: roundMoney(lineSubtotal + lineTax),
  };
}

export type PriceCartOptions = {
  orderType: OrderType;
  settings: Pick<RestaurantSettings, 'serviceChargePct' | 'packingCharge'>;
  /** Flat discount amount, already validated. Defaults to 0. */
  discount?: number;
};

/**
 * Price a whole cart.
 *
 * Order of operations:
 *   1. subtotal      = sum of line subtotals (pre-tax)
 *   2. taxTotal      = sum of per-line tax
 *   3. serviceCharge = serviceChargePct % of subtotal (dine-in only, pre-tax base)
 *   4. packingCharge = flat, takeaway and pre-order only
 *   5. total         = subtotal + tax + service + packing − discount, floored at 0
 */
export function priceCart(
  lines: CartLine[],
  { orderType, settings, discount = 0 }: PriceCartOptions
): PriceBreakdown {
  const priced = lines.map(priceLine);

  const subtotal = roundMoney(
    priced.reduce((sum, l) => sum + l.lineSubtotal, 0)
  );
  const taxTotal = roundMoney(priced.reduce((sum, l) => sum + l.lineTax, 0));

  const isDineIn = orderType === 'dine_in';
  const serviceCharge = isDineIn
    ? roundMoney((subtotal * settings.serviceChargePct) / 100)
    : 0;

  const packingCharge = isDineIn ? 0 : roundMoney(settings.packingCharge);

  const safeDiscount = roundMoney(Math.max(0, discount));
  const gross = subtotal + taxTotal + serviceCharge + packingCharge;
  const total = roundMoney(Math.max(0, gross - safeDiscount));

  return {
    subtotal,
    taxTotal,
    serviceCharge,
    packingCharge,
    discount: safeDiscount,
    total,
    lines: priced,
  };
}

/** Estimated ready time = placed time + the longest prep time in the order. */
export function estimateReadyAt(lines: CartLine[], placedAt: Date): Date {
  const maxPrep = lines.reduce((max, l) => Math.max(max, l.prepMinutes), 0);
  return new Date(placedAt.getTime() + maxPrep * 60_000);
}

/**
 * Stable identity for a cart line. Two additions collapse into one line only
 * when the item, variant, add-on set and notes are all identical.
 * Add-on IDs are sorted so selection order never creates a duplicate line.
 */
export function buildLineId(
  itemId: string,
  variantId: string | null,
  addonIds: string[],
  notes: string | null
): string {
  const addons = [...addonIds].sort().join(',');
  const note = (notes ?? '').trim().toLowerCase();
  return `${itemId}|${variantId ?? ''}|${addons}|${note}`;
}

/**
 * GST split for the printed bill. Intra-state orders split evenly into CGST
 * and SGST; inter-state uses a single IGST line. Restaurants serving dine-in
 * are always intra-state.
 */
export function splitGst(taxTotal: number, interState = false) {
  if (interState) return { igst: roundMoney(taxTotal), cgst: 0, sgst: 0 };
  const half = roundMoney(taxTotal / 2);
  return { igst: 0, cgst: half, sgst: roundMoney(taxTotal - half) };
}
