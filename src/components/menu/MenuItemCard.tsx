"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { SpiceLevel } from "@/components/ui/SpiceLevel";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types";

type Props = {
  item: MenuItem;
  /** Called when the user taps ADD — wired up in T07 */
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
        "flex gap-3 rounded-xl border border-stone-200 bg-white p-3",
        unavailable && "pointer-events-none opacity-40"
      )}
      aria-disabled={unavailable}
    >
      {/* Text column */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          <span className="truncate text-[15px] font-medium text-stone-900">
            {item.name}
          </span>
        </div>

        {/* Price */}
        <p className="text-sm font-semibold text-stone-800">
          {getDisplayPrice(item)}
        </p>

        {/* Description */}
        {item.description && (
          <p className="line-clamp-2 text-[13px] text-stone-500">
            {item.description}
          </p>
        )}

        {/* Tags + spice */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-5 px-1.5 text-[11px] capitalize"
            >
              {tag.replace(/_/g, " ")}
            </Badge>
          ))}
          <SpiceLevel level={item.spiceLevel} />
        </div>
      </div>

      {/* Image + ADD column */}
      <div className="relative flex shrink-0 flex-col items-end gap-2">
        <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-stone-100">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="96px"
              className={cn("object-cover", unavailable && "grayscale")}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-stone-300">
              {item.foodType === "veg" ? "🥗" : "🍗"}
            </div>
          )}

          {unavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                Unavailable
              </span>
            </div>
          )}
        </div>

        {!unavailable && (
          <button
            onClick={() => onAdd?.(item)}
            className="flex h-8 items-center gap-1 rounded-full border-2 border-[#C2410C] px-3 text-sm font-semibold text-[#C2410C] transition-colors hover:bg-[#C2410C] hover:text-white active:scale-95"
            aria-label={`Add ${item.name} to cart`}
          >
            ADD
          </button>
        )}
      </div>
    </div>
  );
}
