import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toMenuItem } from "@/lib/mappers";
import type { DbMenuItem } from "@/types/db";

// ---------------------------------------------------------------- GET /api/menu/items?categoryId=

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const categoryId = req.nextUrl.searchParams.get("categoryId");

  const supabase = createServerClient();

  let query = supabase
    .from("menu_items")
    .select("*, item_variants(*), addon_groups:item_addon_groups(group_id, addon_groups(*, addons(*)))")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[items GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load items." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: (data ?? []).map((row) => toMenuItem(row as unknown as DbMenuItem)) });
}

// ---------------------------------------------------------------- POST /api/menu/items

const variantSchema = z.object({
  name: z.string().min(1).max(100),
  priceDelta: z.number().min(-9999).max(9999),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

const createSchema = z.object({
  categoryId: z.string().uuid().nullable().default(null),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().default(null),
  imageUrl: z.string().url().nullable().default(null),
  basePrice: z.number().min(0).max(99999),
  foodType: z.enum(["veg", "non_veg", "egg"]).default("veg"),
  spiceLevel: z.number().int().min(0).max(3).default(0),
  prepMinutes: z.number().int().min(0).max(999).default(15),
  taxRate: z.number().min(0).max(100).default(5),
  isAvailable: z.boolean().default(true),
  variants: z.array(variantSchema).default([]),
  addonGroupIds: z.array(z.string().uuid()).default([]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request." } },
      { status: 400 }
    );
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 }
    );
  }

  const session = await getStaffSession();
  const supabase = createServerClient();

  // Get next sort_order for this category
  const { data: existing } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = ((existing?.[0]?.sort_order as number) ?? -1) + 1;

  const { data: item, error: itemError } = await supabase
    .from("menu_items")
    .insert({
      restaurant_id: session!.restaurantId,
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      image_url: parsed.data.imageUrl,
      base_price: parsed.data.basePrice,
      food_type: parsed.data.foodType,
      spice_level: parsed.data.spiceLevel,
      prep_minutes: parsed.data.prepMinutes,
      tax_rate: parsed.data.taxRate,
      is_available: parsed.data.isAvailable,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (itemError || !item) {
    console.error("[items POST]", itemError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to create item." } },
      { status: 500 }
    );
  }

  // Insert variants
  if (parsed.data.variants.length > 0) {
    await supabase.from("item_variants").insert(
      parsed.data.variants.map((v, i) => ({
        item_id: item.id,
        name: v.name,
        price_delta: v.priceDelta,
        is_default: v.isDefault,
        sort_order: v.sortOrder ?? i,
      }))
    );
  }

  // Link addon groups (verify they belong to this restaurant)
  if (parsed.data.addonGroupIds.length > 0) {
    const { data: validGroups } = await supabase
      .from("addon_groups")
      .select("id")
      .eq("restaurant_id", session!.restaurantId)
      .in("id", parsed.data.addonGroupIds);

    if (validGroups && validGroups.length > 0) {
      await supabase.from("item_addon_groups").insert(
        validGroups.map((g) => ({ item_id: item.id, group_id: g.id }))
      );
    }
  }

  // Re-fetch with full relations
  const { data: full } = await supabase
    .from("menu_items")
    .select("*, item_variants(*), addon_groups:item_addon_groups(group_id, addon_groups(*, addons(*)))")
    .eq("id", item.id)
    .single();

  return NextResponse.json(
    { item: toMenuItem((full ?? item) as unknown as DbMenuItem) },
    { status: 201 }
  );
}
