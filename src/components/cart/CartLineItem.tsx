"use client";

import Image from "next/image";
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
      {/* Thumbnail */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-container-high">
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt={line.itemName}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 28 }}>
              restaurant
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={line.foodType} />
          <span className="text-body-md font-semibold text-on-surface truncate">{line.itemName}</span>
        </div>

        {line.variantName && (
          <p className="text-body-sm text-on-surface-variant">{line.variantName}</p>
        )}
        {line.addons.length > 0 && (
          <p className="text-body-sm text-on-surface-variant">
            {line.addons.map((a) => a.name).join(", ")}
          </p>
        )}
        {line.notes && (
          <p className="text-body-sm italic text-on-surface-variant">&ldquo;{line.notes}&rdquo;</p>
        )}

        {/* Qty stepper + price row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center rounded-lg border border-outline-variant overflow-hidden h-9">
            <button
              onClick={() => setQuantity(line.lineId, line.quantity - 1)}
              className="flex h-full w-9 items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
              aria-label="Decrease quantity"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove</span>
            </button>
            <span className="w-8 text-center text-body-md font-semibold text-on-surface border-x border-outline-variant">
              {line.quantity}
            </span>
            <button
              onClick={() => setQuantity(line.lineId, line.quantity + 1)}
              className="flex h-full w-9 items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
              aria-label="Increase quantity"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-primary" style={{ fontSize: 16 }}>
              {formatMoney(priced.lineTotal)}
            </span>
            <button
              onClick={() => removeLine(line.lineId)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-outline hover:text-tertiary hover:bg-tertiary/10 transition-colors"
              aria-label={`Remove ${line.itemName}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
