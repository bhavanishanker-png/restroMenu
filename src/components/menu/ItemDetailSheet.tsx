"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { computeUnitPrice, formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";
import type { AddonGroup, MenuItem, SelectedAddon } from "@/types";

type Props = {
  item: MenuItem | null;
  onClose: () => void;
};

function getDefaultVariantId(item: MenuItem): string | null {
  if (item.variants.length === 0) return null;
  const def = item.variants.find((v) => v.isDefault) ?? item.variants[0];
  return def.id;
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

  const unitPrice = item
    ? computeUnitPrice(item.basePrice, priceDelta, selectedAddons)
    : 0;
  const linePrice = unitPrice * quantity;

  const canAdd = useMemo(() => {
    if (!item) return false;
    return item.addonGroups.every((group) => {
      const count = selectedAddonIds[group.id]?.size ?? 0;
      return count >= group.minSelect;
    });
  }, [item, selectedAddonIds]);

  function toggleAddon(group: AddonGroup, addonId: string) {
    setSelectedAddonIds((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (current.has(addonId)) {
        current.delete(addonId);
      } else if (current.size < group.maxSelect) {
        current.add(addonId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  function handleAdd() {
    if (!item) return;
    addItem({
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
    });
    onClose();
  }

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90svh] flex-col overflow-hidden rounded-t-3xl p-0 bg-surface"
        aria-describedby={undefined}
      >
        {item && (
          <>
            <SheetTitle className="sr-only">{item.name}</SheetTitle>

            {/* Drag handle */}
            <div className="flex justify-center pt-4 pb-2 shrink-0 sticky top-0 bg-surface rounded-t-3xl z-20">
              <div className="w-12 h-1.5 rounded-full bg-outline-variant" />
              <button
                onClick={onClose}
                className="absolute top-4 right-margin-mobile w-10 h-10 flex items-center justify-center bg-surface-container rounded-full text-on-surface hover:bg-surface-variant transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
              {/* Hero image */}
              <div className="w-full h-64 relative">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="100vw"
                    className="object-cover rounded-t-xl"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-highest rounded-t-xl">
                    <span className="material-symbols-outlined text-outline" style={{ fontSize: 56 }}>restaurant</span>
                  </div>
                )}
                {/* Food type marker on image */}
                <div className="absolute top-4 left-margin-mobile bg-surface p-1 rounded-sm shadow-sm flex items-center justify-center">
                  <FoodTypeMarker type={item.foodType} />
                </div>
              </div>

              <div className="px-margin-mobile pt-md pb-xl space-y-md">
                {/* Name + description */}
                <div>
                  <h1 className="font-headline-lg text-on-surface mb-xs" style={{ fontSize: 22, lineHeight: "28px" }}>
                    {item.name}
                  </h1>
                  {item.description && (
                    <p className="font-body-md text-body-md text-on-surface-variant">{item.description}</p>
                  )}
                </div>

                <hr className="border-outline-variant/50" />

                {/* Variants */}
                {item.variants.length > 0 && (
                  <section>
                    <div className="flex justify-between items-center mb-sm">
                      <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>
                        {item.variants.length === 1 ? "Size" : "Choose size"}
                      </h2>
                      <span className="bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded-sm font-label-bold text-label-bold uppercase text-xs">
                        Required
                      </span>
                    </div>
                    <div className="space-y-sm">
                      {item.variants.map((v) => (
                        <label
                          key={v.id}
                          className={`flex items-center justify-between p-sm rounded-lg border cursor-pointer transition-colors group ${
                            variantId === v.id
                              ? "border-2 border-primary bg-primary/5"
                              : "border border-outline-variant hover:border-primary"
                          }`}
                        >
                          <div className="flex items-center gap-sm">
                            <input
                              type="radio"
                              name={`variant-${item.id}`}
                              value={v.id}
                              checked={variantId === v.id}
                              onChange={() => setVariantId(v.id)}
                              className="appearance-none w-5 h-5 border-2 border-outline rounded-full checked:border-primary checked:border-[6px] transition-all cursor-pointer"
                            />
                            <span className="font-body-lg text-on-surface group-hover:text-primary transition-colors">
                              {v.name}
                            </span>
                          </div>
                          <span className="font-body-md text-on-surface-variant">
                            {formatMoney(item.basePrice + v.priceDelta)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {/* Add-on groups */}
                {item.addonGroups.map((group) => {
                  const selected = selectedAddonIds[group.id] ?? new Set<string>();
                  const atMax = selected.size >= group.maxSelect;
                  return (
                    <section key={group.id}>
                      <hr className="border-outline-variant/50 mb-md" />
                      <div className="flex justify-between items-center mb-sm">
                        <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>{group.name}</h2>
                        <span className="text-on-surface-variant font-body-sm text-body-sm">
                          {group.minSelect > 0 ? "Required" : "Optional"}
                          {group.maxSelect > 1 ? ` · up to ${group.maxSelect}` : ""}
                        </span>
                      </div>
                      <div className="space-y-sm">
                        {group.addons.map((addon) => {
                          const checked = selected.has(addon.id);
                          const disabled = !checked && atMax;
                          return (
                            <label
                              key={addon.id}
                              className={`flex items-center justify-between p-sm rounded-lg cursor-pointer transition-colors ${
                                checked
                                  ? "bg-surface-container-lowest border border-primary"
                                  : "hover:bg-surface-container-lowest border border-transparent"
                              } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                            >
                              <div className="flex items-center gap-sm">
                                <div className="relative flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => !disabled && toggleAddon(group, addon.id)}
                                    className="appearance-none w-5 h-5 border-2 border-outline rounded-sm checked:bg-primary checked:border-primary transition-all cursor-pointer"
                                  />
                                  {checked && (
                                    <span
                                      className="material-symbols-outlined absolute text-on-primary pointer-events-none"
                                      style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                                    >
                                      check
                                    </span>
                                  )}
                                </div>
                                <span className="font-body-lg text-on-surface">{addon.name}</span>
                              </div>
                              {addon.price > 0 && (
                                <span className="font-body-md text-on-surface-variant">
                                  +{formatMoney(addon.price)}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {/* Special instructions */}
                <section>
                  <hr className="border-outline-variant/50 mb-md" />
                  <h2 className="font-headline-sm text-on-surface mb-sm" style={{ fontSize: 16 }}>
                    Special Instructions
                  </h2>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 120))}
                    placeholder="e.g. less spicy, no onion, extra sauce…"
                    rows={3}
                    maxLength={120}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none"
                  />
                  <p className="mt-1 text-right font-body-sm text-on-surface-variant">{notes.length}/120</p>
                </section>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="absolute bottom-0 w-full bg-surface border-t border-outline-variant p-margin-mobile shadow-[0_-4px_16px_rgba(0,0,0,0.05)] flex items-center justify-between gap-md z-30 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {/* Quantity stepper */}
              <div className="flex items-center bg-surface-container rounded-full h-12 px-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-variant transition-colors"
                  aria-label="Decrease quantity"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>remove</span>
                </button>
                <span className="font-headline-md text-on-surface w-8 text-center" style={{ fontSize: 18 }}>
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-primary hover:bg-primary-container hover:text-on-primary-container transition-colors"
                  aria-label="Increase quantity"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                </button>
              </div>

              {/* Add to cart */}
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                className="flex-1 h-12 bg-primary text-on-primary rounded-full font-headline-sm flex items-center justify-center gap-2 hover:bg-surface-tint active:translate-y-[2px] transition-all shadow-md disabled:opacity-50"
                style={{ fontSize: 16 }}
              >
                <span>Add to Cart</span>
                <span className="opacity-80">•</span>
                <span>{formatMoney(linePrice)}</span>
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
