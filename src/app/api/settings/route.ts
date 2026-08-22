import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { toRestaurantSettings } from "@/lib/mappers";
import type { DbRestaurantSettings } from "@/types/db";

// ---------------------------------------------------------------- GET /api/settings

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session!.restaurantId)
    .single();

  if (error || !data) {
    console.error("[settings GET]", error);
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Settings not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({ settings: toRestaurantSettings(data as DbRestaurantSettings) });
}

// ---------------------------------------------------------------- PATCH /api/settings

const patchSchema = z.object({
  acceptsCash: z.boolean().optional(),
  acceptsOnline: z.boolean().optional(),
  serviceChargePct: z.number().min(0).max(100).optional(),
  packingCharge: z.number().min(0).optional(),
  orderNumberPrefix: z.string().min(1).max(6).regex(/^[A-Z0-9]+$/, "Only uppercase letters and digits").optional(),
  autoAcceptOrders: z.boolean().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const update: Partial<DbRestaurantSettings> = {};
  if (body.acceptsCash !== undefined) update.accepts_cash = body.acceptsCash;
  if (body.acceptsOnline !== undefined) update.accepts_online = body.acceptsOnline;
  if (body.serviceChargePct !== undefined) update.service_charge_pct = body.serviceChargePct;
  if (body.packingCharge !== undefined) update.packing_charge = body.packingCharge;
  if (body.orderNumberPrefix !== undefined) update.order_number_prefix = body.orderNumberPrefix;
  if (body.autoAcceptOrders !== undefined) update.auto_accept_orders = body.autoAcceptOrders;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: { code: "NO_CHANGES", message: "No fields to update." } },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("restaurant_settings")
    .update(update)
    .eq("restaurant_id", session!.restaurantId)
    .select()
    .single();

  if (error || !data) {
    console.error("[settings PATCH]", error);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update settings." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ settings: toRestaurantSettings(data as DbRestaurantSettings) });
}
