"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Minus, Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

  // Reset selections every time a new item is shown
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

  // Validation: all addon groups with minSelect > 0 must be satisfied
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
        className="flex max-h-[90svh] flex-col overflow-hidden rounded-t-2xl p-0"
        aria-describedby={undefined}
      >
        {item && (
          <>
            <SheetTitle className="sr-only">{item.name}</SheetTitle>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Image */}
              <div className="relative h-48 w-full bg-stone-100">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-stone-100 to-stone-200" />
                )}
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-stone-700 backdrop-blur-sm"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 p-4">
                {/* Name + description */}
                <div className="flex items-start gap-2">
                  <FoodTypeMarker type={item.foodType} />
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">{item.name}</h2>
                    {item.description && (
                      <p className="mt-0.5 text-sm text-stone-500">{item.description}</p>
                    )}
                  </div>
                </div>

                {/* Variants */}
                {item.variants.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-stone-700">Choose size</p>
                    <RadioGroup
                      value={variantId ?? ""}
                      onValueChange={setVariantId}
                      className="space-y-2"
                    >
                      {item.variants.map((v) => (
                        <Label
                          key={v.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 p-3 has-[:checked]:border-[#C2410C] has-[:checked]:bg-[#C2410C]/5"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value={v.id} id={`v-${v.id}`} />
                            <span className="text-sm">{v.name}</span>
                          </div>
                          <span className="text-sm font-medium text-stone-800">
                            {formatMoney(item.basePrice + v.priceDelta)}
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {/* Add-on groups */}
                {item.addonGroups.map((group) => {
                  const selected = selectedAddonIds[group.id] ?? new Set<string>();
                  const atMax = selected.size >= group.maxSelect;
                  return (
                    <div key={group.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-sm font-semibold text-stone-700">{group.name}</p>
                        {group.minSelect > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                            Required · {group.minSelect > 1 ? `Choose ${group.minSelect}` : "Choose 1"}
                          </Badge>
                        )}
                        {group.maxSelect > 1 && (
                          <span className="text-xs text-stone-400">up to {group.maxSelect}</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.addons.map((addon) => {
                          const checked = selected.has(addon.id);
                          const disabled = !checked && atMax;
                          return (
                            <Label
                              key={addon.id}
                              className={`flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 p-3 ${
                                checked ? "border-[#C2410C] bg-[#C2410C]/5" : ""
                              } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`addon-${addon.id}`}
                                  checked={checked}
                                  disabled={disabled}
                                  onCheckedChange={() => !disabled && toggleAddon(group, addon.id)}
                                />
                                <span className="text-sm">{addon.name}</span>
                              </div>
                              {addon.price > 0 && (
                                <span className="text-sm font-medium text-stone-700">
                                  +{formatMoney(addon.price)}
                                </span>
                              )}
                            </Label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Cooking instructions */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-stone-700">
                    Cooking instructions
                  </p>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 120))}
                    placeholder="e.g. less spicy, no onion…"
                    rows={2}
                    className="resize-none text-sm"
                    maxLength={120}
                  />
                  <p className="mt-1 text-right text-xs text-stone-400">
                    {notes.length}/120
                  </p>
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="flex items-center gap-3">
                {/* Quantity stepper */}
                <div className="flex items-center rounded-full border border-stone-200">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-50 active:scale-95"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-50 active:scale-95"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Add button */}
                <Button
                  onClick={handleAdd}
                  disabled={!canAdd}
                  className="flex-1 bg-[#C2410C] text-white hover:bg-[#9A3412] disabled:opacity-50"
                >
                  Add item · {formatMoney(linePrice)}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
