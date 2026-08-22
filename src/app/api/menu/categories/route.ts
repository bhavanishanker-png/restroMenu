import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toMenuCategory } from "@/lib/mappers";
import type { DbMenuCategory } from "@/types/db";

// ---------------------------------------------------------------- GET /api/menu/categories

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("menu_categories")
    .select("*, menu_items(count)")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[categories GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load categories." } },
      { status: 500 }
    );
  }

  const categories = (data ?? []).map((row) => ({
    ...toMenuCategory(row as DbMenuCategory),
    itemCount: (row as { menu_items: { count: number }[] }).menu_items?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ categories });
}

// ---------------------------------------------------------------- POST /api/menu/categories

const createSchema = z.object({
  name: z.string().min(1).max(100),
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

  // Get max sort_order
  const { data: existing } = await supabase
    .from("menu_categories")
    .select("sort_order")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = ((existing?.[0]?.sort_order as number) ?? -1) + 1;

  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      restaurant_id: session!.restaurantId,
      name: parsed.data.name,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[categories POST]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to create category." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ category: toMenuCategory(data as DbMenuCategory) }, { status: 201 });
}
