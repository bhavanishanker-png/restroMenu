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
    <div className="fixed bottom-[72px] left-0 right-0 z-30 px-4 pb-2">
      <Link
        href={`/r/${slug}/t/${token}/cart`}
        className="flex min-h-[56px] items-center justify-between rounded-xl bg-primary px-4 py-3 text-on-primary shadow-[0_8px_24px_rgba(167,52,0,0.28)] transition-transform active:translate-y-[2px]"
        aria-label={`View cart — ${itemCount} items, ${formatMoney(total)}`}
      >
        {/* Left: count badge */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-on-primary/20 font-label-bold text-label-bold text-on-primary">
            {itemCount}
          </span>
          <span className="font-label-bold text-label-bold">
            {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Centre: total */}
        <span className="font-headline-sm" style={{ fontSize: 15 }}>
          {formatMoney(total)}
        </span>

        {/* Right: CTA pill */}
        <span className="flex items-center gap-0.5 rounded-full bg-on-primary/15 px-3 py-1.5 font-label-bold text-label-bold">
          View Cart
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
        </span>
      </Link>
    </div>
  );
}
