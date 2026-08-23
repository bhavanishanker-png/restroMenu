"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { priceLine, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";

type Props = {
  slug: string;
  token: string;
};

export function CartBar({ slug, token }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lines = useCartStore((s) => s.lines);

  if (!mounted || lines.length === 0) return null;

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + priceLine(l).lineTotal, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
      <Link
        href={`/r/${slug}/t/${token}/cart`}
        className="pointer-events-auto relative flex min-h-[56px] items-center justify-between rounded-xl bg-primary px-4 py-3 text-on-primary shadow-level-2 transition-transform active:translate-y-[2px] active:shadow-level-1"
        aria-label={`View cart — ${itemCount} items, ${formatMoney(total)}`}
      >
        {/* Left: icon + count */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-on-primary/20">
            <span className="material-symbols-outlined fill" style={{ fontSize: 18 }}>
              shopping_bag
            </span>
          </span>
          <span className="font-label-bold text-label-bold">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Centre: total */}
        <span className="font-headline-sm" style={{ fontSize: 16 }}>
          {formatMoney(total)}
        </span>

        {/* Right: CTA */}
        <span className="flex items-center gap-1 font-label-bold text-label-bold">
          View cart
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            chevron_right
          </span>
        </span>
      </Link>
    </div>
  );
}
