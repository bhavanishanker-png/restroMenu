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
  const isLast = line.quantity <= 1;

  return (
    <li className="flex gap-3 py-4">
      {/* Thumbnail */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-container-high ring-1 ring-inset ring-outline-variant">
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 26 }} aria-hidden="true">
              restaurant
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <FoodTypeMarker type={line.foodType} />
              <span className="truncate text-body-md font-semibold text-on-surface">{line.itemName}</span>
            </div>
            {(line.variantName || line.addons.length > 0) && (
              <p className="text-body-xs text-on-surface-variant">
                {[line.variantName, ...line.addons.map((a) => a.name)].filter(Boolean).join(" · ")}
              </p>
            )}
            {line.notes && (
              <p className="flex items-start gap-1 text-body-xs text-on-surface-variant">
                <span className="material-symbols-outlined mt-px" style={{ fontSize: 14 }} aria-hidden="true">
                  edit_note
                </span>
                <span className="italic">{line.notes}</span>
              </p>
            )}
          </div>
          <span className="tabular shrink-0 font-display text-body-md font-semibold text-on-surface">
            {formatMoney(priced.lineSubtotal)}
          </span>
        </div>

        {/* Qty stepper — 44px targets. At quantity 1 the minus becomes a bin,
            so the guest can see that the next tap removes the dish. */}
        <div className="flex items-center justify-between">
          <div className="flex h-11 items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text">
            <button
              type="button"
              onClick={() => setQuantity(line.lineId, line.quantity - 1)}
              className="grid h-11 w-11 place-items-center rounded-l-xl transition-colors hover:bg-brand/10 active:scale-95"
              aria-label={isLast ? `Remove ${line.itemName}` : `Decrease ${line.itemName} quantity`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
                {isLast ? "delete" : "remove"}
              </span>
            </button>
            <span className="tabular w-7 text-center font-display text-body-md font-semibold" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.lineId, line.quantity + 1)}
              className="grid h-11 w-11 place-items-center rounded-r-xl transition-colors hover:bg-brand/10 active:scale-95"
              aria-label={`Increase ${line.itemName} quantity`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">add</span>
            </button>
          </div>

          {!isLast && (
            <button
              type="button"
              onClick={() => removeLine(line.lineId)}
              className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-body-xs font-medium text-on-surface-variant transition-colors hover:text-error"
              aria-label={`Remove ${line.itemName}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">delete</span>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
