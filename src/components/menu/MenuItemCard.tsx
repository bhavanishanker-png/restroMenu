"use client";

import Image from "next/image";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { SpiceLevel } from "@/components/ui/SpiceLevel";
import { computeUnitPrice, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types";

type Props = {
  item: MenuItem;
  onAdd?: (item: MenuItem) => void;
};

/** Lowest price a guest can pay for this dish — base plus the cheapest variant. */
function getDisplayPrice(item: MenuItem): { amount: string; from: boolean } {
  if (item.variants.length === 0) {
    return { amount: formatMoney(item.basePrice), from: false };
  }
  const minDelta = Math.min(...item.variants.map((v) => v.priceDelta));
  // Was `item.basePrice + minDelta` inline — price arithmetic belongs in
  // pricing.ts, so the helper the cart uses prices the "from" figure too.
  return { amount: formatMoney(computeUnitPrice(item.basePrice, minDelta, [])), from: true };
}

// The card's aria-label replaces its inner text for screen readers, so the
// food type (otherwise only the FSSAI marker) must be spoken explicitly.
const FOOD_TYPE_SPOKEN: Record<MenuItem["foodType"], string> = {
  veg: "vegetarian",
  non_veg: "non-vegetarian",
  egg: "contains egg",
};

/**
 * The whole card is the tap target and opens the item sheet — guests tap the
 * photo or the name far more often than a small "Add" button. The "Add" pill
 * stays as the visual affordance but is part of the same button, so there is
 * one focus stop per dish rather than a nested-interactive tangle.
 */
export function MenuItemCard({ item, onAdd }: Props) {
  const unavailable = !item.isAvailable;
  const price = getDisplayPrice(item);
  const isBestseller = item.tags.includes("bestseller");
  const otherTags = item.tags.filter((t) => t !== "bestseller").slice(0, 1);

  // A count, not money — how many of this dish are already in the cart, across
  // every variant / add-on combination.
  const inCart = useCartStore((s) =>
    s.lines.reduce((n, l) => (l.itemId === item.id ? n + l.quantity : n), 0)
  );

  return (
    <button
      type="button"
      onClick={() => onAdd?.(item)}
      disabled={unavailable}
      aria-label={
        unavailable
          ? `${item.name}, ${FOOD_TYPE_SPOKEN[item.foodType]}, unavailable`
          : `${item.name}, ${FOOD_TYPE_SPOKEN[item.foodType]}${isBestseller ? ", bestseller" : ""}, ${price.from ? "from " : ""}${price.amount}${inCart > 0 ? `, ${inCart} in cart` : ""}. Open to add`
      }
      className={cn(
        "group relative flex w-full gap-3 rounded-2xl border bg-surface-container-lowest p-3 text-left",
        "transition-[border-color,box-shadow,transform] duration-base ease-out-quart",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        inCart > 0 ? "border-brand-border" : "border-outline-variant",
        unavailable
          ? "cursor-not-allowed opacity-40"
          : "shadow-level-1 active:scale-[0.99] hover:border-outline/40 hover:shadow-level-2"
      )}
    >
      {/* Text column */}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          {isBestseller && (
            <span className="flex items-center gap-0.5 rounded-full bg-warning-container px-1.5 py-px text-[0.6875rem] font-semibold text-on-warning-container">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                local_fire_department
              </span>
              Bestseller
            </span>
          )}
          <SpiceLevel level={item.spiceLevel} />
        </span>

        <span className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-on-surface">
          {item.name}
        </span>

        <span className="tabular flex items-baseline gap-1 text-on-surface">
          {price.from && (
            <span className="text-[0.6875rem] font-medium text-on-surface-variant">from</span>
          )}
          <span className="font-display text-[1rem] font-semibold leading-tight">{price.amount}</span>
        </span>

        {item.description && (
          <span className="line-clamp-2 text-body-xs text-on-surface-variant">
            {item.description}
          </span>
        )}

        {otherTags.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {otherTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-outline-variant px-2 py-px text-[0.6875rem] font-medium capitalize text-on-surface-variant"
              >
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </span>
        )}
      </span>

      {/* Image with the Add pill overlapping its bottom edge */}
      <span className="relative block shrink-0 pb-4">
        <span className="relative block h-[108px] w-[108px] overflow-hidden rounded-xl bg-surface-container-high ring-1 ring-inset ring-outline-variant">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              // Rendered at exactly 108px — never ask the browser for more.
              sizes="108px"
              className={cn(
                "object-cover transition-transform duration-slow ease-out-quart",
                unavailable ? "grayscale" : "group-hover:scale-105"
              )}
              loading="lazy"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-highest">
              <span
                className="material-symbols-outlined text-outline"
                style={{ fontSize: 36 }}
                aria-hidden="true"
              >
                {item.foodType === "veg" ? "eco" : "restaurant"}
              </span>
            </span>
          )}
        </span>

        {/* Visual-only — the whole card is the button. The pill is 36px tall
            but the tappable area is the full card, well over 44px. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-2 bottom-0 flex h-9 items-center justify-center gap-1 rounded-lg border text-[0.8125rem] font-bold uppercase tracking-wide shadow-level-2",
            "transition-[background-color,color,transform] duration-fast ease-out-quart group-active:scale-95",
            unavailable
              ? "border-outline-variant bg-surface-container-highest text-on-surface"
              : inCart > 0
                ? "border-brand bg-brand text-brand-foreground"
                : "border-brand-border bg-surface-container-lowest text-brand-text group-hover:bg-brand-subtle"
          )}
        >
          {unavailable ? (
            <span className="text-[0.6875rem]">Unavailable</span>
          ) : inCart > 0 ? (
            <>
              <span className="tabular">{inCart}</span>
              <span className="text-[0.6875rem]">in cart</span>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
            </>
          ) : (
            <>
              Add
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
