"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-[#C2410C]" />
      </div>
    );
  }

  const menuHref = `/r/${slug}/t/${token}`;
  const checkoutHref = `/r/${slug}/t/${token}/checkout`;

  if (lines.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF9] px-4 text-center">
        <ShoppingBag className="h-16 w-16 text-stone-200" />
        <p className="text-lg font-semibold text-stone-800">Your cart is empty</p>
        <p className="text-sm text-stone-500">Add items from the menu to get started.</p>
        <Button asChild className="mt-2 bg-[#C2410C] hover:bg-[#9A3412]">
          <Link href={menuHref}>Browse menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link href={menuHref} aria-label="Back to menu" className="text-stone-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold text-stone-900">Your cart</h1>
        {tableLabel && (
          <span className="ml-auto rounded-full bg-[#C2410C]/10 px-3 py-0.5 text-xs font-semibold text-[#C2410C]">
            Table {tableLabel}
          </span>
        )}
      </header>

      <div className="space-y-4 p-4 pb-32">
        {/* Line items */}
        <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 px-4">
          {lines.map((line) => (
            <CartLineItem key={line.lineId} line={line} />
          ))}
        </div>

        {/* Add more items */}
        <Link
          href={menuHref}
          className="flex items-center justify-center gap-1 text-sm font-medium text-[#C2410C]"
        >
          + Add more items
        </Link>

        {/* Bill summary */}
        <BillSummary lines={lines} orderType={orderType} settings={settings} />
      </div>

      {/* Sticky proceed button */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button
          asChild
          className="w-full bg-[#C2410C] text-white hover:bg-[#9A3412]"
          size="lg"
        >
          <Link href={checkoutHref}>Proceed to checkout</Link>
        </Button>
      </div>
    </div>
  );
}
