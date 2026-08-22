import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toTable } from "@/lib/mappers";
import type { DbRestaurantTable } from "@/types/db";

// ---------------------------------------------------------------- PATCH /api/tables/[id]

const patchSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  seats: z.number().int().min(1).max(100).optional(),
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
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.seats !== undefined) update.seats = parsed.data.seats;

  const { data, error } = await supabase
    .from("restaurant_tables")
    .update(update)
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Table not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({ table: toTable(data as DbRestaurantTable) });
}

// ---------------------------------------------------------------- DELETE /api/tables/[id]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("restaurant_tables")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId);

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to remove table." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
