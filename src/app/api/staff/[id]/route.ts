import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { withLoginEmails } from "@/lib/queries/staff";
import {
  createLoginAccount,
  deleteLoginAccount,
  loginEmailSchema,
  loginPasswordSchema,
  updateLoginAccount,
} from "@/lib/staff-accounts";
import type { DbStaff } from "@/types/db";

// ---------------------------------------------------------------- PATCH /api/staff/[id]

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().regex(/^\d{10}$/).nullable().optional(),
  role: z.enum(["manager", "kitchen", "waiter"]).optional(),
  // A new PIN for floor staff. Clearing it would lock them out, so null is
  // not accepted.
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
  // Managers only: change or set up their email/password sign-in.
  email: loginEmailSchema.optional(),
  password: loginPasswordSchema.optional(),
});

function badRequest(message: string, code = "VALIDATION_ERROR"): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

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
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid.");
  }

  const body = parsed.data;
  const supabase = createServerClient();

  // Verify staff belongs to this restaurant
  const { data: existingRaw, error: loadError } = await supabase
    .from("staff")
    .select("*")
    .eq("id", params.id)
    .eq("restaurant_id", session!.restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (loadError) {
    console.error("[staff PATCH] load failed", loadError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load staff member." } },
      { status: 500 }
    );
  }
  if (!existingRaw) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Staff member not found." } },
      { status: 404 }
    );
  }
  const existing = existingRaw as DbStaff;

  // The owner row is the restaurant's only way into settings and team
  // changes. Moving it to another role would lock everyone out of both.
  if (existing.role === "owner" && body.role !== undefined) {
    return badRequest("The owner's role can't be changed.");
  }

  const targetRole = body.role ?? existing.role;
  const isManager = targetRole === "manager";
  const isFloor = targetRole === "kitchen" || targetRole === "waiter";

  if (body.pin !== undefined && !isFloor) {
    return badRequest("Only kitchen and waiter staff sign in with a PIN.");
  }
  if ((body.email !== undefined || body.password !== undefined) && targetRole !== "manager") {
    return badRequest("Only managers sign in with an email and password.");
  }

  // Each role must end up with a way to sign in.
  if (isFloor && !existing.pin_hash && body.pin === undefined) {
    return badRequest("Set a 4-digit PIN so they can sign in.");
  }
  if (isManager && !existing.auth_user_id && (!body.email || !body.password)) {
    return badRequest("Managers need an email and a password to sign in.");
  }

  // ---- Sign-in account (managers) ----
  // Done before the row update so a rejected email/password changes nothing.
  let createdAuthUserId: string | null = null;
  if (isManager && (body.email !== undefined || body.password !== undefined)) {
    if (existing.auth_user_id) {
      const updated = await updateLoginAccount(existing.auth_user_id, {
        email: body.email,
        password: body.password,
      });
      if (!updated.ok) {
        return NextResponse.json(
          { error: { code: updated.code, message: updated.message } },
          { status: updated.status }
        );
      }
    } else if (body.email && body.password) {
      const created = await createLoginAccount(body.email, body.password);
      if (!created.ok) {
        return NextResponse.json(
          { error: { code: created.code, message: created.message } },
          { status: created.status }
        );
      }
      createdAuthUserId = created.value;
    }
  }

  const update: Partial<Pick<DbStaff, "name" | "phone" | "role" | "pin_hash" | "auth_user_id">> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.role !== undefined) update.role = body.role;
  if (body.pin !== undefined) update.pin_hash = await bcrypt.hash(body.pin, 10);
  if (createdAuthUserId) update.auth_user_id = createdAuthUserId;
  // A manager has no use for a PIN, and floor PIN login only admits kitchen
  // and waiter roles — clear it so it can't become a back door later.
  if (isManager && existing.pin_hash) update.pin_hash = null;

  const accountChanged = body.email !== undefined || body.password !== undefined;
  if (Object.keys(update).length === 0) {
    if (accountChanged) {
      const [member] = await withLoginEmails([existing]);
      return NextResponse.json({ staff: member });
    }
    return badRequest("No fields to update.", "NO_CHANGES");
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
    if (createdAuthUserId) await deleteLoginAccount(createdAuthUserId);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update staff member." } },
      { status: 500 }
    );
  }

  const [member] = await withLoginEmails([data as DbStaff]);
  return NextResponse.json({ staff: member });
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
