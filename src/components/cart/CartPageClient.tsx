"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BillSummary } from "./BillSummary";
import { CartLineItem } from "./CartLineItem";
import { useCartStore } from "@/store/cart";
import type { OrderType, RestaurantSettings } from "@/types";

type Props = {
  slug: string;
  token: string;
  tableLabel: string | null;
  orderType: OrderType;
  settings: Pick<RestaurantSettings, "serviceChargePct" | "packingCharge">;
};

export function CartPageClient({
  slug,
  token,
  tableLabel,
  orderType,
  settings,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    useCartStore.persist.rehydrate();
    setMounted(true);
  }, []);

  const lines = useCartStore((s) => s.lines);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  const menuHref = `/r/${slug}/t/${token}`;
  const checkoutHref = `/r/${slug}/t/${token}/checkout`;

  if (lines.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
        <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: 72 }}>
          shopping_bag
        </span>
        <p className="font-headline-sm text-on-surface">Your cart is empty</p>
        <p className="text-body-md text-on-surface-variant">Add items from the menu to get started.</p>
        <Link
          href={menuHref}
          className="mt-2 inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-primary text-on-primary font-headline-sm hover:bg-primary-container transition-colors active:translate-y-[2px]"
          style={{ fontSize: 16 }}
        >
          Browse menu
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-[64px] items-center gap-3 bg-surface-container-low px-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <Link
          href={menuHref}
          aria-label="Back to menu"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
        </Link>
        <h1 className="font-headline-sm text-on-surface flex-1" style={{ fontSize: 18 }}>Your cart</h1>
        {tableLabel && (
          <span className="shrink-0 rounded-full bg-primary-container px-3 py-1 font-label-bold text-on-primary-container" style={{ fontSize: 12 }}>
            Table {tableLabel}
          </span>
        )}
      </header>

      <div className="space-y-4 p-4 pb-36">
        {/* Line items */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-level-1 divide-y divide-outline-variant/30 px-4">
          {lines.map((line) => (
            <CartLineItem key={line.lineId} line={line} />
          ))}
        </div>

        {/* Add more */}
        <Link
          href={menuHref}
          className="flex items-center justify-center gap-1 font-label-bold text-label-bold text-primary"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Add more items
        </Link>

        {/* Bill summary */}
        <BillSummary lines={lines} orderType={orderType} settings={settings} />
      </div>

      {/* Sticky proceed button */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-outline-variant/30 bg-surface-container-lowest px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(32,26,23,0.08)]">
        <Link
          href={checkoutHref}
          className="flex w-full h-12 items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-headline-sm shadow-[0_8px_24px_rgba(167,52,0,0.3)] hover:bg-primary-container transition-colors active:translate-y-[2px]"
          style={{ fontSize: 16 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
