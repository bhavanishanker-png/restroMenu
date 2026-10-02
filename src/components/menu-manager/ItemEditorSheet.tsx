"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { computeUnitPrice, formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { AddonGroup, MenuItem } from "@/types";
import { MsIcon } from "./MsIcon";

// ---------------------------------------------------------------- types

type Props = {
  open: boolean;
  item: MenuItem | null; // null = create mode
  categoryId: string | null;
  categoryName?: string;
  addonGroups: AddonGroup[];
  onClose: () => void;
  onSaved: (item: MenuItem) => void;
};

const variantSchema = z.object({
  name: z.string().min(1, "Name required"),
  priceDelta: z.coerce.number(),
  isDefault: z.boolean(),
});

const formSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  basePrice: z.coerce.number().min(0, "Price must be 0 or more"),
  foodType: z.enum(["veg", "non_veg", "egg"]),
  spiceLevel: z.coerce.number().int().min(0).max(3),
  taxRate: z.coerce.number().min(0, "0–100").max(100, "0–100"),
  prepMinutes: z.coerce.number().int("Whole minutes").min(0, "0 or more"),
  isAvailable: z.boolean(),
  variants: z.array(variantSchema),
  addonGroupIds: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

const FOOD_TYPES = [
  { value: "veg", label: "Veg" },
  { value: "non_veg", label: "Non-veg" },
  { value: "egg", label: "Egg" },
] as const;

const SPICE_LEVELS = [
  { value: 0, label: "None" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hot" },
] as const;

function defaultsFor(item: MenuItem | null): FormValues {
  return {
    name: item?.name ?? "",
    description: item?.description ?? "",
    basePrice: item?.basePrice ?? 0,
    foodType: item?.foodType ?? "veg",
    spiceLevel: item?.spiceLevel ?? 0,
    taxRate: item?.taxRate ?? 5,
    prepMinutes: item?.prepMinutes ?? 15,
    isAvailable: item?.isAvailable ?? true,
    variants: item?.variants.map((v) => ({
      name: v.name,
      priceDelta: v.priceDelta,
      isDefault: v.isDefault,
    })) ?? [],
    addonGroupIds: item?.addonGroups.map((g) => g.id) ?? [],
  };
}

/** Form inputs hand back strings until zod coerces on submit. */
function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- layout bits

function Section({
  icon,
  title,
  hint,
  action,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant">
          <MsIcon name={icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-error" role="alert">
      <MsIcon name="error" size={14} /> {message}
    </p>
  );
}

// ---------------------------------------------------------------- component

export function ItemEditorSheet({
  open,
  item,
  categoryId,
  categoryName,
  addonGroups,
  onClose,
  onSaved,
}: Props) {
  const isEdit = item !== null;
  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(item),
  });

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control,
    name: "variants",
  });

  const watchedAddonGroupIds = watch("addonGroupIds");
  const watchedFoodType = watch("foodType");
  const watchedSpice = toNumber(watch("spiceLevel"));
  const watchedAvailable = watch("isAvailable");
  const watchedBasePrice = toNumber(watch("basePrice"));
  const watchedVariants = watch("variants");

  // Reset when the item changes *or* the sheet re-opens. Keying on `item`
  // alone meant "Add dish" twice in a row (item null → null) reopened the
  // form still filled with the previous dish's name, price and photo.
  useEffect(() => {
    if (!open) return;
    setImageUrl(item?.imageUrl ?? null);
    reset(defaultsFor(item));
  }, [item, open, reset]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear so picking the same file again (e.g. after "Remove") still fires.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      const formData = new FormData();
      formData.append("file", compressed, compressed.name);

      const res = await fetch("/api/menu/items/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        toast.error(body.error?.message ?? "Upload failed.");
        return;
      }

      const { url } = await res.json() as { url: string };
      setImageUrl(url);
    } catch (err) {
      console.error(err);
      toast.error("Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const payload = {
        categoryId: categoryId,
        name: values.name,
        description: values.description || null,
        imageUrl: imageUrl,
        basePrice: values.basePrice,
        foodType: values.foodType,
        spiceLevel: values.spiceLevel,
        taxRate: values.taxRate,
        prepMinutes: values.prepMinutes,
        isAvailable: values.isAvailable,
        variants: values.variants,
        addonGroupIds: values.addonGroupIds,
      };

      const url = isEdit ? `/api/menu/items/${item.id}` : "/api/menu/items";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        toast.error(body.error?.message ?? "Failed to save item.");
        return;
      }

      const { item: saved } = await res.json() as { item: MenuItem };
      toast.success(isEdit ? "Item updated." : "Item created.");
      onSaved(saved);
    } catch (err) {
      // A network failure used to escape as an unhandled rejection with no
      // feedback — the button just went back to "Save".
      console.error("[menu] save failed", err);
      toast.error("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAddonGroup(groupId: string) {
    const current = watchedAddonGroupIds ?? [];
    if (current.includes(groupId)) {
      setValue("addonGroupIds", current.filter((id) => id !== groupId));
    } else {
      setValue("addonGroupIds", [...current, groupId]);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 space-y-1 border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 text-left">
          <SheetTitle className="truncate pr-10 font-display text-xl">
            {isEdit ? item.name : "New dish"}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <MsIcon name="folder_open" size={16} />
            {isEdit ? "Editing in" : "Adding to"} {categoryName || "this category"} · changes go live on save
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-surface p-4 sm:p-5">
            {/* ── Basics ─────────────────────────────────────────── */}
            <Section icon="restaurant" title="Basics" hint="What guests read on the menu.">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label={imageUrl ? "Replace photo" : "Upload photo"}
                  className={cn(
                    "relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    imageUrl
                      ? "border-outline-variant"
                      : "border-dashed border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-brand-border hover:text-brand-text"
                  )}
                >
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
                  ) : (
                    <MsIcon name="add_a_photo" size={26} />
                  )}
                  {uploading && (
                    <span className="absolute inset-0 animate-pulse bg-surface-container-highest/80" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      <MsIcon name="upload" />
                      {uploading ? "Uploading…" : imageUrl ? "Replace" : "Upload photo"}
                    </Button>
                    {imageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 text-error hover:bg-error-container hover:text-on-error-container"
                        onClick={() => setImageUrl(null)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant">JPEG, PNG or WebP · max 5 MB</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  {...register("name")}
                  placeholder="Paneer Tikka"
                  className="h-11"
                  aria-invalid={errors.name ? true : undefined}
                />
                <FieldError message={errors.name?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="item-description">
                  Description <span className="font-normal text-on-surface-variant">(optional)</span>
                </Label>
                <Textarea
                  id="item-description"
                  {...register("description")}
                  rows={2}
                  placeholder="Cottage cheese marinated in yoghurt and spices, char-grilled"
                />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-sm font-medium text-on-surface">Food type</legend>
                <div className="grid grid-cols-3 gap-2">
                  {FOOD_TYPES.map((ft) => (
                    <label
                      key={ft.value}
                      className={cn(
                        "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        watchedFoodType === ft.value
                          ? "border-brand bg-brand-subtle text-on-surface"
                          : "border-outline-variant text-on-surface-variant hover:border-outline"
                      )}
                    >
                      <input
                        type="radio"
                        value={ft.value}
                        {...register("foodType")}
                        className="sr-only"
                      />
                      <FoodTypeMarker type={ft.value} />
                      {ft.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Section>

            {/* ── Pricing ────────────────────────────────────────── */}
            <Section icon="payments" title="Pricing" hint="Tax is added at checkout, per dish.">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-price">Base price</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">₹</span>
                    <Input
                      id="item-price"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="h-11 pl-7 tabular-nums"
                      {...register("basePrice")}
                      aria-invalid={errors.basePrice ? true : undefined}
                    />
                  </div>
                  <FieldError message={errors.basePrice?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-tax">GST</Label>
                  <div className="relative">
                    <Input
                      id="item-tax"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-11 pr-8 tabular-nums"
                      {...register("taxRate")}
                      aria-invalid={errors.taxRate ? true : undefined}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">%</span>
                  </div>
                  <FieldError message={errors.taxRate?.message} />
                </div>
              </div>

              {/* Variants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-on-surface">Variants</p>
                    <p className="text-xs text-on-surface-variant">Sizes or portions, priced relative to base.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onClick={() => appendVariant({ name: "", priceDelta: 0, isDefault: false })}
                  >
                    <MsIcon name="add" /> Add variant
                  </Button>
                </div>

                {variantFields.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-outline-variant px-3 py-3 text-xs text-on-surface-variant">
                    No variants — guests see one price, {formatMoney(watchedBasePrice)}.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {variantFields.map((field, idx) => {
                      const delta = toNumber(watchedVariants?.[idx]?.priceDelta);
                      return (
                        <li
                          key={field.id}
                          className="grid grid-cols-[1fr_6.5rem_auto] items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <Input
                              placeholder="e.g. Full"
                              aria-label={`Variant ${idx + 1} name`}
                              className="h-11"
                              {...register(`variants.${idx}.name`)}
                            />
                            <FieldError message={errors.variants?.[idx]?.name?.message} />
                          </div>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">± ₹</span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              aria-label={`Variant ${idx + 1} price change`}
                              className="h-11 pl-9 tabular-nums"
                              {...register(`variants.${idx}.priceDelta`)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVariant(idx)}
                            className="grid h-11 w-11 place-items-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                            aria-label={`Remove variant ${idx + 1}`}
                          >
                            <MsIcon name="delete" size={20} />
                          </button>
                          <div className="col-span-3 flex items-center justify-between gap-2 px-1">
                            <Controller
                              control={control}
                              name={`variants.${idx}.isDefault`}
                              render={({ field: f }) => (
                                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-on-surface-variant">
                                  <Checkbox
                                    checked={f.value}
                                    onCheckedChange={(v) => f.onChange(v === true)}
                                    onBlur={f.onBlur}
                                  />
                                  Pre-selected for guests
                                </label>
                              )}
                            />
                            <span className="text-xs text-on-surface-variant">
                              Guest pays{" "}
                              <span className="font-semibold tabular-nums text-on-surface">
                                {formatMoney(computeUnitPrice(watchedBasePrice, delta, []))}
                              </span>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Section>

            {/* ── Add-ons ────────────────────────────────────────── */}
            <Section
              icon="add_circle"
              title="Add-ons"
              hint="Extras guests can pick, like cheese or a dip."
            >
              {addonGroups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-outline-variant px-3 py-3 text-xs text-on-surface-variant">
                  No add-on groups exist for this restaurant yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {addonGroups.map((group) => {
                    const checked = (watchedAddonGroupIds ?? []).includes(group.id);
                    return (
                      <li key={group.id}>
                        <label
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                            checked ? "border-brand-border bg-brand-subtle" : "border-outline-variant hover:border-outline"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleAddonGroup(group.id)}
                          />
                          <span className="flex-1 font-medium text-on-surface">{group.name}</span>
                          <span className="text-xs tabular-nums text-on-surface-variant">
                            {group.addons.length} {group.addons.length === 1 ? "option" : "options"}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* ── Kitchen & availability ─────────────────────────── */}
            <Section icon="skillet" title="Kitchen & availability">
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="item-prep">Prep time</Label>
                  <div className="relative">
                    <Input
                      id="item-prep"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      className="h-11 pr-12 tabular-nums"
                      {...register("prepMinutes")}
                      aria-invalid={errors.prepMinutes ? true : undefined}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">min</span>
                  </div>
                  <FieldError message={errors.prepMinutes?.message} />
                </div>

                <div className="space-y-1.5">
                  <p id="spice-label" className="text-sm font-medium text-on-surface">Spice level</p>
                  <div role="radiogroup" aria-labelledby="spice-label" className="grid grid-cols-4 gap-1.5">
                    {SPICE_LEVELS.map((s) => {
                      const active = watchedSpice === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setValue("spiceLevel", s.value, { shouldDirty: true })}
                          className={cn(
                            "flex h-11 flex-col items-center justify-center rounded-xl border text-xs font-medium transition-colors",
                            active
                              ? "border-brand bg-brand-subtle text-on-surface"
                              : "border-outline-variant text-on-surface-variant hover:border-outline"
                          )}
                        >
                          <span className="flex h-3.5 items-center gap-px" aria-hidden="true">
                            {s.value === 0 ? (
                              <MsIcon name="remove" size={14} />
                            ) : (
                              Array.from({ length: s.value }, (_, i) => (
                                <MsIcon key={i} name="local_fire_department" size={13} filled className={active ? "text-error" : ""} />
                              ))
                            )}
                          </span>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label
                htmlFor="is-available"
                className={cn(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  watchedAvailable
                    ? "border-success/30 bg-success-container"
                    : "border-outline-variant bg-surface-container-high"
                )}
              >
                <MsIcon
                  name={watchedAvailable ? "check_circle" : "block"}
                  size={22}
                  className={watchedAvailable ? "text-on-success-container" : "text-on-surface-variant"}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", watchedAvailable ? "text-on-success-container" : "text-on-surface")}>
                    {watchedAvailable ? "Available now" : "Unavailable"}
                  </span>
                  <span className="block text-xs text-on-surface-variant">
                    {watchedAvailable
                      ? "Guests can order this dish."
                      : "Shown greyed out with an “Unavailable” label."}
                  </span>
                </span>
                <Switch
                  id="is-available"
                  checked={watchedAvailable}
                  onCheckedChange={(v) => setValue("isAvailable", v, { shouldDirty: true })}
                />
              </label>
            </Section>
          </div>

          {/* Sticky footer */}
          <div className="flex shrink-0 gap-2 border-t border-outline-variant bg-surface-container-lowest px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <Button type="button" variant="outline" size="touch" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" size="touch" disabled={saving || uploading} className="flex-1">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add dish"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
