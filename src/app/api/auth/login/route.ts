import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSSRClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import type { StaffRole } from "@/types";

// ---------------------------------------------------------------- schemas

const emailSchema = z.object({
  method: z.literal("email"),
  email: z.string().email(),
  password: z.string().min(1),
});

const pinSchema = z.object({
  method: z.literal("pin"),
  restaurantSlug: z.string().min(1),
  staffId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

const loginSchema = z.discriminatedUnion("method", [emailSchema, pinSchema]);

// ---------------------------------------------------------------- POST /api/auth/login

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request." } },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // ---- Email / password login (owner + manager) ----
  if (body.method === "email") {
    const cookieStore = cookies();

    // Use the anon-key SSR client so Supabase manages its own session cookies.
    const authClient = createSSRClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: (name: string, value: string, options: CookieOptions) => cookieStore.set({ name, value, ...options }),
          remove: (name: string, options: CookieOptions) => cookieStore.set({ name, value: "", ...options }),
        },
      }
    );

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } },
        { status: 401 }
      );
    }

    // Verify the Supabase user has a staff row with an allowed role.
    const supabase = createServerClient();
    const { data: staffRow, error: staffError } = await supabase
      .from("staff")
      .select("id, restaurant_id, role, is_active")
      .eq("auth_user_id", authData.user.id)
      .in("role", ["owner", "manager"])
      .eq("is_active", true)
      .maybeSingle();

    // PGRST116 = no rows, which is a genuine "not staff". Anything else is a
    // real database failure and must not be reported as a credentials problem.
    if (staffError) {
      console.error("[login] staff lookup failed", staffError);
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Could not verify your account. Please try again." } },
        { status: 500 }
      );
    }

    if (!staffRow) {
      return NextResponse.json(
        { error: { code: "NOT_STAFF", message: "No active owner or manager account found." } },
        { status: 403 }
      );
    }

    await setSessionCookie({
      staffId: staffRow.id,
      restaurantId: staffRow.restaurant_id,
      role: staffRow.role as StaffRole,
    });

    return NextResponse.json({ ok: true, role: staffRow.role });
  }

  // ---- PIN login (kitchen + waiter) ----
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 5 attempts per IP per 10 minutes.
  if (!checkRateLimit(`pin:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in 10 minutes." } },
      { status: 429 }
    );
  }

  const supabase = createServerClient();

  // Resolve restaurant — MUST match the slug to prevent cross-tenant PIN guessing.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", body.restaurantSlug)
    .eq("is_active", true)
    .single();

  if (!restaurant) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Restaurant not found." } },
      { status: 404 }
    );
  }

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, restaurant_id, role, pin_hash")
    .eq("id", body.staffId)
    .eq("restaurant_id", restaurant.id)
    .in("role", ["kitchen", "waiter"])
    .eq("is_active", true)
    .single();

  // Return the same error whether the staff ID is wrong OR the PIN is wrong —
  // avoids leaking which part failed.
  if (!staffRow?.pin_hash) {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Invalid staff or PIN." } },
      { status: 401 }
    );
  }

  const pinValid = await bcrypt.compare(body.pin, staffRow.pin_hash);
  if (!pinValid) {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Invalid staff or PIN." } },
      { status: 401 }
    );
  }

  await setSessionCookie({
    staffId: staffRow.id,
    restaurantId: staffRow.restaurant_id,
    role: staffRow.role as StaffRole,
  });

  return NextResponse.json({ ok: true, role: staffRow.role });
}
