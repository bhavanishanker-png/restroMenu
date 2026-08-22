import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toRestaurant } from "@/lib/mappers";
import type { DbRestaurant } from "@/types/db";

// ---------------------------------------------------------------- GET /api/admin/restaurants

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard) return guard;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/restaurants GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load restaurants." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ restaurants: (data ?? []).map((r) => toRestaurant(r as DbRestaurant)) });
}

// ---------------------------------------------------------------- POST /api/admin/restaurants

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, digits, and hyphens"),
  ownerName: z.string().min(1).max(80),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().regex(/^\d{10}$/).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard) return guard;

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
  const supabase = createServerClient();

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", body.slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: { code: "SLUG_TAKEN", message: `The slug "${body.slug}" is already in use.` } },
      { status: 409 }
    );
  }

  // 1. Create Supabase auth user for the owner
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: body.ownerEmail,
    password: body.ownerPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("[admin/restaurants POST] auth.admin.createUser", authError);
    return NextResponse.json(
      { error: { code: "AUTH_FAILED", message: authError?.message ?? "Failed to create auth user." } },
      { status: 500 }
    );
  }

  const authUserId = authData.user.id;

  // 2. Insert restaurant
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      name: body.name,
      slug: body.slug,
      phone: body.phone ?? null,
      address: body.address ?? null,
      currency: "INR",
      timezone: "Asia/Kolkata",
      plan: "free",
      is_active: true,
    })
    .select()
    .single();

  if (restaurantError || !restaurant) {
    // Rollback: delete the auth user we just created
    await supabase.auth.admin.deleteUser(authUserId);
    console.error("[admin/restaurants POST] insert restaurant", restaurantError);
    return NextResponse.json(
      { error: { code: "CREATE_FAILED", message: "Failed to create restaurant." } },
      { status: 500 }
    );
  }

  const restaurantId: string = restaurant.id;

  // 3. Insert restaurant_settings with sensible defaults
  const { error: settingsError } = await supabase
    .from("restaurant_settings")
    .insert({
      restaurant_id: restaurantId,
      accepts_cash: true,
      accepts_online: false,
      service_charge_pct: 0,
      packing_charge: 0,
      order_number_prefix: "ORD",
      auto_accept_orders: false,
    });

  if (settingsError) {
    // Rollback
    await supabase.from("restaurants").delete().eq("id", restaurantId);
    await supabase.auth.admin.deleteUser(authUserId);
    console.error("[admin/restaurants POST] insert settings", settingsError);
    return NextResponse.json(
      { error: { code: "SETTINGS_FAILED", message: "Failed to create restaurant settings." } },
      { status: 500 }
    );
  }

  // 4. Insert owner staff row — no PIN needed (owner logs in via email)
  const { error: staffError } = await supabase
    .from("staff")
    .insert({
      restaurant_id: restaurantId,
      auth_user_id: authUserId,
      name: body.ownerName,
      role: "owner",
      is_active: true,
    });

  if (staffError) {
    // Rollback
    await supabase.from("restaurant_settings").delete().eq("restaurant_id", restaurantId);
    await supabase.from("restaurants").delete().eq("id", restaurantId);
    await supabase.auth.admin.deleteUser(authUserId);
    console.error("[admin/restaurants POST] insert staff", staffError);
    return NextResponse.json(
      { error: { code: "STAFF_FAILED", message: "Failed to create owner account." } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { restaurant: toRestaurant(restaurant as DbRestaurant) },
    { status: 201 }
  );
}
