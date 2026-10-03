import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toMenuItem } from "@/lib/mappers";
import { categoryBelongsTo } from "@/lib/queries/menu";
import type { DbMenuItem } from "@/types/db";

function dbError(message: string): NextResponse {
  return NextResponse.json({ error: { code: "DB_ERROR", message } }, { status: 500 });
}

// ---------------------------------------------------------------- PATCH /api/menu/items/[id]

const patchSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  basePrice: z.number().min(0).max(99999).optional(),
  foodType: z.enum(["veg", "non_veg", "egg"]).optional(),
  spiceLevel: z.number().int().min(0).max(3).optional(),
  prepMinutes: z.number().int().min(0).max(999).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(100),
        priceDelta: z.number().min(-9999).max(9999),
        isDefault: z.boolean().default(false),
        sortOrder: z.number().int().min(0).default(0),
      })
    )
    .optional(),
  addonGroupIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request." } },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 }
    );
  }

  const session = await getStaffSession();
  const supabase = createServerClient();
  const d = parsed.data;

  // Ownership first. The variant and add-on tables have no restaurant_id, so
  // every write below is keyed by item_id alone — without this check a
  // manager could rewrite another restaurant's variants by sending its ID.
  const { data: owned, error: ownedError } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (ownedError) {
    console.error("[items PATCH] ownership check", ownedError);
    return dbError("Failed to update item.");
  }
  if (!owned) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Item not found." } },
      { status: 404 }
    );
  }

  if (d.categoryId) {
    const categoryCheck = await categoryBelongsTo(d.categoryId, session!.restaurantId);
    if (categoryCheck === "error") return dbError("Failed to update item.");
    if (categoryCheck === "missing") {
      return NextResponse.json(
        { error: { code: "CATEGORY_NOT_FOUND", message: "Category not found." } },
        { status: 400 }
      );
    }
  }

  // Build update object for menu_items
  const update: Record<string, unknown> = {};
  if (d.categoryId !== undefined) update.category_id = d.categoryId;
  if (d.name !== undefined) update.name = d.name;
  if (d.description !== undefined) update.description = d.description;
  if (d.imageUrl !== undefined) update.image_url = d.imageUrl;
  if (d.basePrice !== undefined) update.base_price = d.basePrice;
  if (d.foodType !== undefined) update.food_type = d.foodType;
  if (d.spiceLevel !== undefined) update.spice_level = d.spiceLevel;
  if (d.prepMinutes !== undefined) update.prep_minutes = d.prepMinutes;
  if (d.taxRate !== undefined) update.tax_rate = d.taxRate;
  if (d.isAvailable !== undefined) update.is_available = d.isAvailable;
  if (d.sortOrder !== undefined) update.sort_order = d.sortOrder;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("menu_items")
      .update(update)
      .eq("id", params.id)
      .eq("restaurant_id", session!.restaurantId);

    if (error) {
      console.error("[items PATCH]", error);
      return dbError("Failed to update item.");
    }
  }

  // Replace variants if provided
  if (d.variants !== undefined) {
    const { error: deleteError } = await supabase
      .from("item_variants")
      .delete()
      .eq("item_id", params.id);
    if (deleteError) {
      console.error("[items PATCH] variant delete", deleteError);
      return dbError("Failed to update variants.");
    }
    if (d.variants.length > 0) {
      const { error: insertError } = await supabase.from("item_variants").insert(
        d.variants.map((v, i) => ({
          item_id: params.id,
          name: v.name,
          price_delta: v.priceDelta,
          is_default: v.isDefault,
          sort_order: v.sortOrder ?? i,
        }))
      );
      if (insertError) {
        console.error("[items PATCH] variant insert", insertError);
        return dbError("Variants were cleared but could not be saved. Add them again.");
      }
    }
  }

  // Replace addon group links if provided
  if (d.addonGroupIds !== undefined) {
    const { error: unlinkError } = await supabase
      .from("item_addon_groups")
      .delete()
      .eq("item_id", params.id);
    if (unlinkError) {
      console.error("[items PATCH] addon unlink", unlinkError);
      return dbError("Failed to update add-ons.");
    }
    if (d.addonGroupIds.length > 0) {
      const { data: validGroups, error: groupsError } = await supabase
        .from("addon_groups")
        .select("id")
        .eq("restaurant_id", session!.restaurantId)
        .in("id", d.addonGroupIds);
      if (groupsError) {
        console.error("[items PATCH] addon lookup", groupsError);
        return dbError("Add-ons were cleared but could not be saved. Add them again.");
      }

      if (validGroups && validGroups.length > 0) {
        const { error: linkError } = await supabase.from("item_addon_groups").insert(
          validGroups.map((g) => ({ item_id: params.id, group_id: g.id }))
        );
        if (linkError) {
          console.error("[items PATCH] addon link", linkError);
          return dbError("Add-ons were cleared but could not be saved. Add them again.");
        }
      }
    }
  }

  const { data: full, error: reloadError } = await supabase
    .from("menu_items")
    .select("*, item_variants(*), addon_groups:item_addon_groups(group_id, addon_groups(*, addons(*)))")
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .maybeSingle();

  if (reloadError) {
    console.error("[items PATCH] reload", reloadError);
    return dbError("Item was saved but could not be reloaded. Refresh the page.");
  }
  if (!full) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Item not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({ item: toMenuItem(full as unknown as DbMenuItem) });
}

// ---------------------------------------------------------------- DELETE /api/menu/items/[id]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("menu_items")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId);

  if (error) {
    console.error("[items DELETE]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to delete item." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
