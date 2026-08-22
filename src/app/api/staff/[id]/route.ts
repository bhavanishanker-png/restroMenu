import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toStaff } from "@/lib/mappers";
import type { DbStaff } from "@/types/db";

// ---------------------------------------------------------------- PATCH /api/staff/[id]

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  phone: z.string().regex(/^\d{10}$/).nullable().optional(),
  role: z.enum(["manager", "kitchen", "waiter"]).optional(),
  pin: z.string().regex(/^\d{4}$/).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner"]);
  if (guard) return guard;

  const session = await getStaffSession();

  let raw: unknown;
  try { raw = await req.json(); }
  catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON." } },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid." } },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const supabase = createServerClient();

  // Verify staff belongs to this restaurant
  const { data: existing } = await supabase
    .from("staff")
    .select("id")
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Staff member not found." } },
      { status: 404 }
    );
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.role !== undefined) update.role = body.role;
  if (body.pin !== undefined) {
    update.pin_hash = body.pin ? await bcrypt.hash(body.pin, 10) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: { code: "NO_CHANGES", message: "No fields to update." } },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("staff")
    .update(update)
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .select()
    .single();

  if (error || !data) {
    console.error("[staff PATCH]", error);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update staff member." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ staff: toStaff(data as DbStaff) });
}

// ---------------------------------------------------------------- DELETE /api/staff/[id]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("staff")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId);

  if (error) {
    console.error("[staff DELETE]", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Failed to deactivate staff member." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
