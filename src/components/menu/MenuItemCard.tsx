"use client";

import Image from "next/image";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { SpiceLevel } from "@/components/ui/SpiceLevel";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types";

type Props = {
  item: MenuItem;
  onAdd?: (item: MenuItem) => void;
};

function getDisplayPrice(item: MenuItem): string {
  if (item.variants.length === 0) return formatMoney(item.basePrice);
  const minDelta = Math.min(...item.variants.map((v) => v.priceDelta));
  return `${formatMoney(item.basePrice + minDelta)} onwards`;
}

export function MenuItemCard({ item, onAdd }: Props) {
  const unavailable = !item.isAvailable;

  return (
    <div
      className={cn(
        "group relative flex gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-3",
        "transition-[border-color,box-shadow,transform] duration-base ease-out-quart",
        unavailable
          ? "pointer-events-none opacity-40"
          : "hover:-translate-y-0.5 hover:border-outline/40 hover:shadow-level-2"
      )}
      aria-disabled={unavailable}
    >
      {/* Text column */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          <span className="truncate text-body-md font-semibold text-on-surface">
            {item.name}
          </span>
        </div>

        <p className="tabular font-display text-[1.0625rem] font-semibold leading-tight text-on-surface">
          {getDisplayPrice(item)}
        </p>

        {item.description && (
          <p className="line-clamp-2 text-body-sm text-on-surface-variant">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-outline-variant bg-surface-container px-2 py-0.5 font-label-bold text-label-bold uppercase text-on-surface-variant"
            >
              {tag.replace(/_/g, " ")}
            </span>
          ))}
          <SpiceLevel level={item.spiceLevel} />
        </div>
      </div>

      {/* Image + ADD */}
      <div className="relative flex shrink-0 flex-col items-end gap-2">
        <div className="relative h-[100px] w-[100px] overflow-hidden rounded-xl bg-surface-container-high ring-1 ring-inset ring-outline-variant">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              // Rendered at exactly 100px — never ask the browser for more.
              sizes="100px"
              className={cn(
                "object-cover transition-transform duration-slow ease-out-quart",
                unavailable ? "grayscale" : "group-hover:scale-105"
              )}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span
                className="material-symbols-outlined text-outline"
                style={{ fontSize: 36 }}
                aria-hidden="true"
              >
                {item.foodType === "veg" ? "eco" : "kebab_dining"}
              </span>
            </div>
          )}

          {unavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
              <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-label-bold text-label-bold uppercase text-on-surface">
                Unavailable
              </span>
            </div>
          )}
        </div>

        {!unavailable && (
          <button
            onClick={() => onAdd?.(item)}
            // 44px is the customer-screen minimum tap target. The negative
            // margin keeps the visual height at 36px without shrinking the
            // touch area, so it still sits tight under the image.
            className={cn(
              "relative -my-1 flex min-h-[44px] items-center justify-center gap-1 rounded-full px-6",
              "border border-brand/30 bg-brand-subtle font-label-bold text-label-bold uppercase text-brand-text",
              "transition-[background-color,border-color,box-shadow,transform] duration-fast ease-out-quart",
              "hover:border-brand/60 hover:bg-brand hover:text-brand-foreground hover:shadow-glow",
              "active:scale-95"
            )}
            aria-label={`Add ${item.name} to cart`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
              add
            </span>
            Add
          </button>
        )}
      </div>
    </div>
  );
}
