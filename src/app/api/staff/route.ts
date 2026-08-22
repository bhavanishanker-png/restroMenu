import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toStaff } from "@/lib/mappers";
import type { DbStaff } from "@/types/db";

// ---------------------------------------------------------------- GET /api/staff

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[staff GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load staff." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ staff: (data ?? []).map((r) => toStaff(r as DbStaff)) });
}

// ---------------------------------------------------------------- POST /api/staff

const createSchema = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().regex(/^\d{10}$/).nullable().optional(),
  role: z.enum(["manager", "kitchen", "waiter"]),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // kitchen / waiter require a PIN so they can log in
  if ((body.role === "kitchen" || body.role === "waiter") && !body.pin) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "PIN is required for kitchen and waiter roles." } },
      { status: 400 }
    );
  }

  const pin_hash = body.pin ? await bcrypt.hash(body.pin, 10) : null;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("staff")
    .insert({
      restaurant_id: session!.restaurantId,
      name: body.name,
      phone: body.phone ?? null,
      role: body.role,
      pin_hash,
      is_active: true,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[staff POST]", error);
    return NextResponse.json(
      { error: { code: "CREATE_FAILED", message: "Failed to create staff member." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ staff: toStaff(data as DbStaff) }, { status: 201 });
}
