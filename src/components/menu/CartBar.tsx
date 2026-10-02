"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { priceCart, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";
import type { OrderType, RestaurantSettings } from "@/types";

type Props = {
  slug: string;
  token: string;
  orderType: OrderType;
  settings: Pick<RestaurantSettings, "serviceChargePct" | "packingCharge">;
};

/**
 * Deliberately Framer-free. This renders on the customer menu, which carries
 * the tightest performance budget in the app, and the entrance is a single
 * transform — a CSS keyframe does it for zero bytes of JavaScript. The global
 * prefers-reduced-motion rule neutralises it like any other animation.
 */
export function CartBar({ slug, token, orderType, settings }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lines = useCartStore((s) => s.lines);

  // The cart is persisted, so on the first paint the store is still empty —
  // render nothing until rehydration rather than flashing an empty bar.
  if (!mounted || lines.length === 0) return null;

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  // Was a hand-rolled sum of line totals: price arithmetic outside pricing.ts,
  // and it left out the service charge, so the bar disagreed with the bill on
  // the cart page whenever a restaurant charged one. priceCart is the same
  // call the cart and checkout bills make.
  const { total } = priceCart(lines, { orderType, settings });

  return (
    <div className="animate-slide-up fixed inset-x-0 bottom-[72px] z-30 px-3 pb-2">
      <Link
        href={`/r/${slug}/t/${token}/cart`}
        className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl bg-brand py-2 pl-2 pr-4 text-brand-foreground shadow-glow transition-transform duration-fast ease-out-quart active:scale-[0.99]"
        aria-label={`View cart — ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatMoney(total)}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-foreground/15" aria-hidden="true">
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
              shopping_bag
            </span>
            <span className="tabular absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-foreground px-1 text-[0.6875rem] font-bold text-brand">
              {itemCount}
            </span>
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="tabular font-display text-[1.0625rem] font-semibold">
              {formatMoney(total)}
            </span>
            <span className="text-[0.75rem] opacity-85">
              {itemCount} {itemCount === 1 ? "item" : "items"} · incl. taxes
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1 text-[0.9375rem] font-semibold">
          View cart
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            arrow_forward
          </span>
        </span>
      </Link>
    </div>
  );
}
