"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { SpiceLevel } from "@/components/ui/SpiceLevel";
import { computeUnitPrice, formatMoney, priceLine } from "@/lib/pricing";
import { useCartStore, type AddItemPayload } from "@/store/cart";
import { cn } from "@/lib/utils";
import type { AddonGroup, MenuItem, SelectedAddon } from "@/types";

type Props = {
  item: MenuItem | null;
  onClose: () => void;
};

const NOTES_MAX = 120;

function getDefaultVariantId(item: MenuItem): string | null {
  if (item.variants.length === 0) return null;
  const def = item.variants.find((v) => v.isDefault) ?? item.variants[0];
  return def.id;
}

/** "Pick 1", "Pick up to 3", "Pick 2–3" — how many the guest may choose. */
function selectionHint(group: AddonGroup): string {
  if (group.maxSelect <= 1) return group.minSelect > 0 ? "Pick 1" : "Pick up to 1";
  if (group.minSelect > 0 && group.minSelect === group.maxSelect) return `Pick ${group.maxSelect}`;
  if (group.minSelect > 0) return `Pick ${group.minSelect}–${group.maxSelect}`;
  return `Pick up to ${group.maxSelect}`;
}

export function ItemDetailSheet({ item, onClose }: Props) {
  const addItem = useCartStore((s) => s.addItem);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!item) return;
    setVariantId(getDefaultVariantId(item));
    setSelectedAddonIds({});
    setNotes("");
    setQuantity(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const selectedVariant = useMemo(
    () => item?.variants.find((v) => v.id === variantId) ?? null,
    [item, variantId]
  );

  const priceDelta = selectedVariant?.priceDelta ?? 0;

  const selectedAddons = useMemo((): SelectedAddon[] => {
    if (!item) return [];
    return item.addonGroups.flatMap((group) => {
      const ids = selectedAddonIds[group.id] ?? new Set();
      return group.addons.filter((a) => ids.has(a.id));
    });
  }, [item, selectedAddonIds]);

  // The exact payload handleAdd sends to the cart. Building it once means the
  // price on the button is computed from the same object the cart will hold.
  const payload: AddItemPayload | null = item
    ? {
        itemId: item.id,
        itemName: item.name,
        imageUrl: item.imageUrl,
        foodType: item.foodType,
        basePrice: item.basePrice,
        taxRate: item.taxRate,
        prepMinutes: item.prepMinutes,
        variantId,
        variantName: selectedVariant?.name ?? null,
        variantPriceDelta: priceDelta,
        addons: selectedAddons,
        quantity,
        notes: notes.trim() || null,
      }
    : null;

  // Was `unitPrice * quantity` inline. priceLine is the cart's own pricing
  // path, so the button can never show a figure the cart then disagrees with.
  // Pre-tax, matching the menu card and the line subtotal in the bill.
  const linePrice = payload ? priceLine({ ...payload, lineId: "draft" }).lineSubtotal : 0;

  const unmetGroups = useMemo(() => {
    if (!item) return [];
    return item.addonGroups.filter(
      (group) => (selectedAddonIds[group.id]?.size ?? 0) < group.minSelect
    );
  }, [item, selectedAddonIds]);

  const canAdd = item !== null && unmetGroups.length === 0;

  function toggleAddon(group: AddonGroup, addonId: string) {
    setSelectedAddonIds((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (current.has(addonId)) {
        current.delete(addonId);
      } else if (group.maxSelect === 1) {
        // Single-choice groups swap rather than refusing the second tap — a
        // guest changing their mind shouldn't have to untick first.
        current.clear();
        current.add(addonId);
      } else if (current.size < group.maxSelect) {
        current.add(addonId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  function handleAdd() {
    if (!payload) return;
    addItem(payload);
    onClose();
  }

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        // `[&>button:last-child]:hidden` hides the primitive's built-in close
        // (always the last child of the content). This sheet renders its own,
        // with a solid backing so it stays visible over a dish photo — two
        // close buttons was one too many for a screen reader.
        className="flex max-h-[92svh] flex-col overflow-hidden rounded-t-3xl bg-surface p-0 pb-0 [&>button:last-child]:hidden"
        aria-describedby={undefined}
      >
        {item && payload && (
          <>
            <SheetTitle className="sr-only">{item.name}</SheetTitle>

            {/* Drag handle + close, floating over the hero */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2.5">
              <div className="h-1.5 w-10 rounded-full bg-on-surface/25" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-level-2 backdrop-blur transition-colors hover:bg-surface-container-lowest"
              aria-label="Close"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
                close
              </span>
            </button>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Hero image — only when there is one. A 256px grey box with a
                  fork icon pushed the options below the fold for nothing. */}
              {item.imageUrl ? (
                <div className="relative aspect-[16/10] w-full bg-surface-container-high">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    // The sheet is full-width on phones and capped at the
                    // viewport elsewhere.
                    sizes="100vw"
                    className="object-cover"
                    priority
                  />
                </div>
              ) : (
                <div className="h-12" aria-hidden="true" />
              )}

              <div className="space-y-5 px-margin-mobile pb-6 pt-4">
                {/* Name + price + description */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <FoodTypeMarker type={item.foodType} />
                    <SpiceLevel level={item.spiceLevel} />
                    {item.prepMinutes > 0 && (
                      <span className="flex items-center gap-0.5 text-[0.75rem] text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
                          schedule
                        </span>
                        ~{item.prepMinutes} min
                      </span>
                    )}
                  </div>
                  <h2 className="pr-10 font-display text-headline-sm text-on-surface">{item.name}</h2>
                  <p className="tabular font-display text-[1.0625rem] font-semibold text-on-surface">
                    {formatMoney(computeUnitPrice(item.basePrice, priceDelta, selectedAddons))}
                  </p>
                  {item.description && (
                    <p className="text-body-sm text-on-surface-variant">{item.description}</p>
                  )}
                </div>

                {/* Variants */}
                {item.variants.length > 0 && (
                  <OptionGroup
                    title={item.variants.length === 1 ? "Size" : "Choose a size"}
                    hint="Pick 1"
                    required
                    satisfied={variantId !== null}
                  >
                    <div role="radiogroup" aria-label="Size" className="space-y-2">
                      {item.variants.map((v) => {
                        const checked = variantId === v.id;
                        return (
                          <label
                            key={v.id}
                            className={cn(
                              "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-3 transition-colors",
                              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                              checked
                                ? "border-brand bg-brand-subtle"
                                : "border-outline-variant bg-surface-container-lowest hover:border-outline/50"
                            )}
                          >
                            <input
                              type="radio"
                              name={`variant-${item.id}`}
                              value={v.id}
                              checked={checked}
                              onChange={() => setVariantId(v.id)}
                              className="sr-only"
                            />
                            <RadioDot checked={checked} />
                            <span className={cn("flex-1 text-body-md text-on-surface", checked && "font-semibold")}>
                              {v.name}
                            </span>
                            <span className="tabular text-body-sm font-medium text-on-surface-variant">
                              {formatMoney(computeUnitPrice(item.basePrice, v.priceDelta, []))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </OptionGroup>
                )}

                {/* Add-on groups */}
                {item.addonGroups.map((group) => {
                  const selected = selectedAddonIds[group.id] ?? new Set<string>();
                  const atMax = selected.size >= group.maxSelect;
                  const single = group.maxSelect === 1;
                  return (
                    <OptionGroup
                      key={group.id}
                      title={group.name}
                      hint={`${selectionHint(group)}${group.maxSelect > 1 ? ` · ${selected.size}/${group.maxSelect}` : ""}`}
                      required={group.minSelect > 0}
                      satisfied={selected.size >= group.minSelect}
                    >
                      <div className="space-y-2">
                        {group.addons.map((addon) => {
                          const checked = selected.has(addon.id);
                          // Single-choice groups swap on tap, so only
                          // multi-select groups ever lock their remaining options.
                          const disabled = !checked && atMax && !single;
                          return (
                            <label
                              key={addon.id}
                              className={cn(
                                "flex min-h-[52px] items-center gap-3 rounded-xl border px-3 transition-colors",
                                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                                checked
                                  ? "border-brand bg-brand-subtle"
                                  : "border-outline-variant bg-surface-container-lowest",
                                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-outline/50"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => !disabled && toggleAddon(group, addon.id)}
                                className="sr-only"
                              />
                              {single ? <RadioDot checked={checked} /> : <CheckBox checked={checked} />}
                              <span className={cn("flex-1 text-body-md text-on-surface", checked && "font-semibold")}>
                                {addon.name}
                              </span>
                              <span className="tabular text-body-sm font-medium text-on-surface-variant">
                                {addon.price > 0 ? `+${formatMoney(addon.price)}` : "Free"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </OptionGroup>
                  );
                })}

                {/* Special instructions */}
                <section className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor={`notes-${item.id}`} className="font-display text-title text-on-surface">
                      Cooking instructions
                    </label>
                    <span className="text-body-xs text-on-surface-variant">Optional</span>
                  </div>
                  <textarea
                    id={`notes-${item.id}`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                    placeholder="e.g. less spicy, no onion, extra sauce"
                    rows={2}
                    maxLength={NOTES_MAX}
                    aria-describedby={`notes-count-${item.id}`}
                    className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface transition-[border-color,box-shadow] placeholder:text-on-surface-variant/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <p id={`notes-count-${item.id}`} className="tabular text-right text-body-xs text-on-surface-variant">
                    {notes.length}/{NOTES_MAX}
                  </p>
                </section>
              </div>
            </div>

            {/* Footer — in flow (not absolute) so it can never cover the last option */}
            <div className="shrink-0 border-t border-outline-variant bg-surface-container-lowest px-margin-mobile pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {unmetGroups.length > 0 && (
                <p className="mb-2 flex items-center gap-1 text-body-xs font-medium text-on-surface-variant" role="status">
                  <span className="material-symbols-outlined text-warning" style={{ fontSize: 16 }} aria-hidden="true">
                    info
                  </span>
                  Choose {unmetGroups[0].name.toLowerCase()} to continue
                </p>
              )}
              <div className="flex items-center gap-3">
                {/* Quantity stepper */}
                <div className="flex h-12 shrink-0 items-center rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="grid h-12 w-11 place-items-center rounded-l-xl text-on-surface transition-colors hover:bg-surface-container disabled:text-on-surface-variant/40"
                    aria-label="Decrease quantity"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">remove</span>
                  </button>
                  <span className="tabular w-7 text-center font-display text-[1.0625rem] font-semibold text-on-surface" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="grid h-12 w-11 place-items-center rounded-r-xl text-brand-text transition-colors hover:bg-brand-subtle"
                    aria-label="Increase quantity"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">add</span>
                  </button>
                </div>

                {/* Add to cart */}
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!canAdd}
                  className="flex h-12 flex-1 items-center justify-between gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground shadow-glow transition-[transform,opacity] active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                >
                  <span>Add to cart</span>
                  <span className="tabular font-display">{formatMoney(linePrice)}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OptionGroup({
  title,
  hint,
  required,
  satisfied,
  children,
}: {
  title: string;
  hint: string;
  required: boolean;
  satisfied: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t border-outline-variant/60 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-title text-on-surface">{title}</h3>
          <p className="tabular text-body-xs text-on-surface-variant">{hint}</p>
        </div>
        {required ? (
          satisfied ? (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-success-container px-2 py-0.5 text-[0.6875rem] font-semibold text-on-success-container">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">check</span>
              Done
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-warning-container px-2 py-0.5 text-[0.6875rem] font-semibold text-on-warning-container">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">priority_high</span>
              Required
            </span>
          )
        ) : (
          <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-[0.6875rem] font-semibold text-on-surface-variant">
            Optional
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        checked ? "border-brand" : "border-outline"
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full bg-brand transition-transform", checked ? "scale-100" : "scale-0")} />
    </span>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
        checked ? "border-brand bg-brand text-brand-foreground" : "border-outline"
      )}
    >
      {checked && (
        <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 700" }}>
          check
        </span>
      )}
    </span>
  );
}
