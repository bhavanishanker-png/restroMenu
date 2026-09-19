"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { priceLine, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";

type Props = {
  slug: string;
  token: string;
};

/**
 * Deliberately Framer-free. This renders on the customer menu, which carries
 * the tightest performance budget in the app, and the entrance is a single
 * transform — a CSS keyframe does it for zero bytes of JavaScript. The global
 * prefers-reduced-motion rule neutralises it like any other animation.
 */
export function CartBar({ slug, token }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lines = useCartStore((s) => s.lines);

  // The cart is persisted, so on the first paint the store is still empty —
  // render nothing until rehydration rather than flashing an empty bar.
  if (!mounted || lines.length === 0) return null;

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + priceLine(l).lineTotal, 0);

  return (
    <div className="animate-slide-up fixed inset-x-0 bottom-[72px] z-30 px-margin-mobile pb-2">
      <Link
        href={`/r/${slug}/t/${token}/cart`}
        className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-brand px-4 py-3 text-brand-foreground shadow-glow transition-transform duration-fast ease-out-quart active:translate-y-px"
        aria-label={`View cart — ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatMoney(total)}`}
      >
        {/* Left: count badge */}
        <div className="flex items-center gap-2">
          <span className="tabular grid h-7 w-7 place-items-center rounded-full bg-brand-foreground/20 font-label-bold text-label-bold">
            {itemCount}
          </span>
          <span className="font-label-bold text-label-bold uppercase">
            {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Centre: total */}
        <span className="tabular font-display text-[0.9375rem] font-semibold">
          {formatMoney(total)}
        </span>

        {/* Right: CTA pill */}
        <span className="flex items-center gap-0.5 rounded-full bg-brand-foreground/15 px-3 py-1.5 font-label-bold text-label-bold uppercase">
          View cart
          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
            chevron_right
          </span>
        </span>
      </Link>
    </div>
  );
}
