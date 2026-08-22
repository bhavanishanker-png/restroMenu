"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { priceLine, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";

type Props = {
  slug: string;
  token: string;
};

export function CartBar({ slug, token }: Props) {
  // Prevent SSR/hydration mismatch — only render after client mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lines = useCartStore((s) => s.lines);

  if (!mounted || lines.length === 0) return null;

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + priceLine(l).lineTotal, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-[#FAFAF9] to-transparent pointer-events-none">
      <Link
        href={`/r/${slug}/t/${token}/cart`}
        className="pointer-events-auto flex h-14 items-center justify-between rounded-xl bg-[#C2410C] px-5 text-white shadow-lg active:scale-[0.98] transition-transform"
        aria-label={`View cart — ${itemCount} items, ${formatMoney(total)}`}
      >
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          <span className="text-sm font-medium">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>
        <span className="font-semibold">{formatMoney(total)}</span>
        <span className="text-sm font-medium">View cart →</span>
      </Link>
    </div>
  );
}
