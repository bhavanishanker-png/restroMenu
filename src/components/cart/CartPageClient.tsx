"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BillSummary } from "./BillSummary";
import { CartLineItem } from "./CartLineItem";
import { CartPageSkeleton } from "./CartPageSkeleton";
import { CustomerSubHeader } from "./CustomerSubHeader";
import { formatMoney, priceCart } from "@/lib/pricing";
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

  const menuHref = `/r/${slug}/t/${token}`;
  const checkoutHref = `/r/${slug}/t/${token}/checkout`;

  // Was a centred spinner. The cart is read from localStorage, so the wait is
  // a frame or two — a skeleton holds the layout so nothing jumps.
  if (!mounted) return <CartPageSkeleton />;

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="min-h-screen bg-surface">
      <CustomerSubHeader
        backHref={menuHref}
        backLabel="Back to menu"
        title="Your cart"
        subtitle={lines.length > 0 ? `${itemCount} ${itemCount === 1 ? "item" : "items"}` : null}
        tableLabel={tableLabel}
      />

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-margin-mobile py-xl text-center">
          <div
            className="grid h-20 w-20 place-items-center rounded-full border border-outline-variant bg-surface-container"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 36 }}>
              shopping_bag
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-display text-headline-sm text-on-surface">Your cart is empty</p>
            <p className="measure-sm text-body-sm text-on-surface-variant">
              Pick a few dishes from the menu and they&rsquo;ll show up here.
            </p>
          </div>
          <Link
            href={menuHref}
            className="mt-1 inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-brand-foreground shadow-glow transition-transform active:scale-[0.98]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
              restaurant_menu
            </span>
            Browse the menu
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4 px-margin-mobile pb-36 pt-4">
            {/* Line items */}
            <section
              aria-label="Items in your cart"
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 shadow-level-1"
            >
              <ul className="divide-y divide-outline-variant/60">
                {lines.map((line) => (
                  <CartLineItem key={line.lineId} line={line} />
                ))}
              </ul>
              <Link
                href={menuHref}
                className="-mx-4 flex min-h-[48px] items-center gap-2 border-t border-outline-variant/60 px-4 text-body-sm font-semibold text-brand-text transition-colors hover:bg-brand-subtle"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">add_circle</span>
                Add more items
              </Link>
            </section>

            <BillSummary lines={lines} orderType={orderType} settings={settings} />

            <p className="flex items-start gap-2 px-1 text-body-xs text-on-surface-variant">
              <span className="material-symbols-outlined mt-px" style={{ fontSize: 16 }} aria-hidden="true">info</span>
              Prices are confirmed by the restaurant when you place the order.
            </p>
          </div>

          {/* Sticky proceed button */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest/95 px-margin-mobile pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-level-3 backdrop-blur">
            <Link
              href={checkoutHref}
              className="flex h-14 w-full items-center justify-between gap-2 rounded-xl bg-brand px-4 text-brand-foreground shadow-glow transition-transform active:scale-[0.99]"
            >
              <span className="flex flex-col items-start leading-tight">
                <span className="tabular font-display text-[1.0625rem] font-semibold">
                  {formatMoney(priceCart(lines, { orderType, settings }).total)}
                </span>
                <span className="text-[0.75rem] opacity-85">Total incl. taxes</span>
              </span>
              <span className="flex items-center gap-1 font-semibold">
                Checkout
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">arrow_forward</span>
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
