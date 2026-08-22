import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toTable } from "@/lib/mappers";
import type { DbRestaurantTable } from "@/types/db";

// ---------------------------------------------------------------- GET /api/tables

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*, table_sessions(status)")
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .order("label", { ascending: true });

  if (error) {
    console.error("[tables GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load tables." } },
      { status: 500 }
    );
  }

  const tables = (data ?? []).map((row) => ({
    ...toTable(row as DbRestaurantTable),
    hasActiveSession: (row as { table_sessions: { status: string }[] }).table_sessions?.some(
      (s) => s.status === "open"
    ) ?? false,
  }));

  return NextResponse.json({ tables });
}

// ---------------------------------------------------------------- POST /api/tables

const createSchema = z.object({
  label: z.string().min(1).max(50),
  seats: z.number().int().min(1).max(100).default(4),
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

  const { data, error } = await supabase
    .from("restaurant_tables")
    .insert({
      restaurant_id: session!.restaurantId,
      label: parsed.data.label,
      seats: parsed.data.seats,
      qr_token: crypto.randomUUID(),
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[tables POST]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to create table." } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { table: { ...toTable(data as DbRestaurantTable), hasActiveSession: false } },
    { status: 201 }
  );
}
