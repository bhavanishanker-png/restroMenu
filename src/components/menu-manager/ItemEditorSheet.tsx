"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import imageCompression from "browser-image-compression";
import { Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import type { AddonGroup, MenuItem } from "@/types";

// ---------------------------------------------------------------- types

type Props = {
  open: boolean;
  item: MenuItem | null; // null = create mode
  categoryId: string | null;
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
  taxRate: z.coerce.number().min(0).max(100),
  prepMinutes: z.coerce.number().int().min(0),
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

// ---------------------------------------------------------------- component

export function ItemEditorSheet({
  open,
  item,
  categoryId,
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
    defaultValues: {
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
    },
  });

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control,
    name: "variants",
  });

  const watchedAddonGroupIds = watch("addonGroupIds");
  const watchedFoodType = watch("foodType");

  // Reset form when item changes
  useEffect(() => {
    setImageUrl(item?.imageUrl ?? null);
    reset({
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
    });
  }, [item, reset]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
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
        const body = await res.json() as { error?: { message?: string } };
        toast.error(body.error?.message ?? "Failed to save item.");
        return;
      }

      const { item: saved } = await res.json() as { item: MenuItem };
      toast.success(isEdit ? "Item updated." : "Item created.");
      onSaved(saved);
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
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit "${item.name}"` : "Add item"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
          {/* Image */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 hover:border-stone-400"
              onClick={() => fileRef.current?.click()}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Upload className="h-6 w-6 text-stone-400" />
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload image"}
              </Button>
              {imageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-1 text-red-500"
                  onClick={() => setImageUrl(null)}
                >
                  Remove
                </Button>
              )}
              <p className="mt-1 text-xs text-stone-400">JPEG / PNG / WebP, max 5 MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
            />
          </div>

          {/* Name */}
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input {...register("name")} placeholder="Paneer Tikka" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea {...register("description")} rows={2} placeholder="Brief description…" />
          </div>

          {/* Price + Tax */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Base price (₹) *</Label>
              <Input type="number" step="0.01" min="0" {...register("basePrice")} />
              {errors.basePrice && <p className="text-xs text-red-500">{errors.basePrice.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>GST %</Label>
              <Input type="number" step="0.01" min="0" max="100" {...register("taxRate")} />
            </div>
          </div>

          {/* Food type */}
          <div className="space-y-1">
            <Label>Food type</Label>
            <div className="flex gap-3">
              {FOOD_TYPES.map((ft) => (
                <label
                  key={ft.value}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    watchedFoodType === ft.value
                      ? "border-stone-900 bg-stone-100"
                      : "border-stone-200"
                  }`}
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
          </div>

          {/* Spice + prep */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Spice level (0–3)</Label>
              <Input type="number" min="0" max="3" {...register("spiceLevel")} />
            </div>
            <div className="space-y-1">
              <Label>Prep time (min)</Label>
              <Input type="number" min="0" {...register("prepMinutes")} />
            </div>
          </div>

          {/* Available toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="is-available"
              checked={watch("isAvailable")}
              onCheckedChange={(v) => setValue("isAvailable", v)}
            />
            <Label htmlFor="is-available">Available now</Label>
          </div>

          <Separator />

          {/* Variants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => appendVariant({ name: "", priceDelta: 0, isDefault: false })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            {variantFields.map((field, idx) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  placeholder="e.g. Full"
                  {...register(`variants.${idx}.name`)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  placeholder="+price"
                  className="w-24"
                  {...register(`variants.${idx}.priceDelta`)}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" {...register(`variants.${idx}.isDefault`)} />
                  Default
                </label>
                <button
                  type="button"
                  onClick={() => removeVariant(idx)}
                  className="text-stone-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {variantFields.length === 0 && (
              <p className="text-xs text-stone-400">No variants — single price.</p>
            )}
          </div>

          {/* Add-on groups */}
          {addonGroups.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Add-on groups</Label>
                {addonGroups.map((group) => (
                  <label key={group.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={(watchedAddonGroupIds ?? []).includes(group.id)}
                      onCheckedChange={() => toggleAddonGroup(group.id)}
                    />
                    <span>{group.name}</span>
                    <span className="text-xs text-stone-400">
                      ({group.addons.length} options)
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create item"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
