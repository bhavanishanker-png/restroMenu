import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toMenuCategory } from "@/lib/mappers";
import type { DbMenuCategory } from "@/types/db";

// ---------------------------------------------------------------- PATCH /api/menu/categories/[id]

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
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

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.sortOrder !== undefined) update.sort_order = parsed.data.sortOrder;

  const { data, error } = await supabase
    .from("menu_categories")
    .update(update)
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .select()
    .single();

  if (error || !data) {
    console.error("[categories PATCH]", error);
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Category not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({ category: toMenuCategory(data as DbMenuCategory) });
}

// ---------------------------------------------------------------- DELETE /api/menu/categories/[id]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("menu_categories")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId);

  if (error) {
    console.error("[categories DELETE]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to delete category." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
