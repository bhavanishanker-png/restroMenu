import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { fetchStaffMembers, withLoginEmails } from "@/lib/queries/staff";
import {
  createLoginAccount,
  deleteLoginAccount,
  loginEmailSchema,
  loginPasswordSchema,
} from "@/lib/staff-accounts";
import type { DbStaff } from "@/types/db";

// ---------------------------------------------------------------- GET /api/staff

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const result = await fetchStaffMembers(session!.restaurantId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load staff." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ staff: result.staff });
}

// ---------------------------------------------------------------- POST /api/staff

const createSchema = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().regex(/^\d{10}$/).nullable().optional(),
  role: z.enum(["manager", "kitchen", "waiter"]),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
  // Managers only: their email/password sign-in.
  email: loginEmailSchema.optional(),
  password: loginPasswordSchema.optional(),
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

  // Managers sign in with email + password; without both they could never
  // sign in, which is exactly the bug this replaces.
  if (body.role === "manager" && (!body.email || !body.password)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Managers need an email and a password to sign in." } },
      { status: 400 }
    );
  }

  // Floor staff use a PIN only; a PIN on a manager would be a second,
  // weaker way into a role that can change the menu.
  const pin_hash =
    body.role !== "manager" && body.pin ? await bcrypt.hash(body.pin, 10) : null;

  // Create the login first: if it fails (email taken, weak password) nothing
  // has been written, and the owner can fix the field and resubmit.
  let authUserId: string | null = null;
  if (body.role === "manager" && body.email && body.password) {
    const account = await createLoginAccount(body.email, body.password);
    if (!account.ok) {
      return NextResponse.json(
        { error: { code: account.code, message: account.message } },
        { status: account.status }
      );
    }
    authUserId = account.value;
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("staff")
    .insert({
      restaurant_id: session!.restaurantId,
      auth_user_id: authUserId,
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
    // Don't leave a login behind that points at no staff row.
    if (authUserId) await deleteLoginAccount(authUserId);
    return NextResponse.json(
      { error: { code: "CREATE_FAILED", message: "Failed to create staff member." } },
      { status: 500 }
    );
  }

  const [member] = await withLoginEmails([data as DbStaff]);
  return NextResponse.json({ staff: member }, { status: 201 });
}
