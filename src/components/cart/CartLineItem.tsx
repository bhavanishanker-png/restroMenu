"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { priceLine, formatMoney } from "@/lib/pricing";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { useCartStore } from "@/store/cart";
import type { CartLine } from "@/types";

export function CartLineItem({ line }: { line: CartLine }) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const priced = priceLine(line);

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-1 min-w-0 space-y-1">
        {/* Name */}
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={line.foodType} />
          <span className="text-sm font-medium text-stone-900 truncate">{line.itemName}</span>
        </div>

        {/* Variant */}
        {line.variantName && (
          <p className="text-xs text-stone-500 pl-5">{line.variantName}</p>
        )}

        {/* Add-ons */}
        {line.addons.length > 0 && (
          <p className="text-xs text-stone-400 pl-5">
            {line.addons.map((a) => a.name).join(", ")}
          </p>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="text-xs italic text-stone-400 pl-5">&ldquo;{line.notes}&rdquo;</p>
        )}

        {/* Quantity stepper */}
        <div className="flex items-center gap-1 pl-5 pt-1">
          <button
            onClick={() => setQuantity(line.lineId, line.quantity - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50 active:scale-95"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
          <button
            onClick={() => setQuantity(line.lineId, line.quantity + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50 active:scale-95"
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Right: price + delete */}
      <div className="flex flex-col items-end justify-between shrink-0">
        <button
          onClick={() => removeLine(line.lineId)}
          className="text-stone-300 hover:text-red-500 transition-colors"
          aria-label={`Remove ${line.itemName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-stone-800">
          {formatMoney(priced.lineTotal)}
        </span>
      </div>
    </div>
  );
}
