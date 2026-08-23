"use client";

import Image from "next/image";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
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

function SpiceIcons({ level }: { level: number }) {
  if (level === 0) return null;
  return (
    <span className="flex items-center gap-0.5" aria-label={`Spice level ${level}`}>
      {Array.from({ length: Math.min(level, 3) }).map((_, i) => (
        <span
          key={i}
          className="material-symbols-outlined fill"
          style={{ fontSize: 14, color: "#cc4911" }}
        >
          local_fire_department
        </span>
      ))}
    </span>
  );
}

export function MenuItemCard({ item, onAdd }: Props) {
  const unavailable = !item.isAvailable;

  return (
    <div
      className={cn(
        "flex gap-4 rounded-xl border border-surface-variant/30 bg-surface-container-lowest p-3 shadow-[0_4px_12px_rgba(0,0,0,0.05)] tactile-hover",
        unavailable && "pointer-events-none opacity-40"
      )}
      aria-disabled={unavailable}
    >
      {/* Text column */}
      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          <span className="truncate text-body-md font-semibold text-on-surface">
            {item.name}
          </span>
        </div>

        <p className="font-headline-sm text-primary" style={{ fontSize: 16, lineHeight: "22px" }}>
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
              className="rounded-full bg-surface-container px-2 py-0.5 font-label-bold text-label-bold text-on-surface-variant capitalize"
            >
              {tag.replace(/_/g, " ")}
            </span>
          ))}
          <SpiceIcons level={item.spiceLevel} />
        </div>
      </div>

      {/* Image + ADD */}
      <div className="relative flex shrink-0 flex-col items-end gap-2">
        <div className="relative h-[100px] w-[100px] overflow-hidden rounded-xl bg-surface-container-high">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="100px"
              className={cn("object-cover", unavailable && "grayscale")}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: 36 }}>
                {item.foodType === "veg" ? "eco" : "kebab_dining"}
              </span>
            </div>
          )}

          {unavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-container-lowest/70">
              <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-label-bold text-label-bold text-on-surface-variant">
                Unavailable
              </span>
            </div>
          )}
        </div>

        {!unavailable && (
          <button
            onClick={() => onAdd?.(item)}
            className="flex min-h-[36px] items-center gap-1 rounded-full bg-primary-container px-6 py-1.5 font-label-bold text-label-bold text-on-primary-container transition-all active:scale-95 active:translate-y-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            aria-label={`Add ${item.name} to cart`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            ADD
          </button>
        )}
      </div>
    </div>
  );
}
