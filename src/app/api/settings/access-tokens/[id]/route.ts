import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

// ─── DELETE /api/settings/access-tokens/[id] ───────────────────────────────
// Revokes a token (sets revoked_at; the row stays for the audit trail).
// Owners can revoke any token in their restaurant; managers only their own.
// The MCP route checks revoked_at on every request, so this takes effect on
// the very next call.

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;
  const session = await getStaffSession();
  if (!session) return err("UNAUTHORIZED", "Authentication required.", 401);

  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return err("NOT_FOUND", "Token not found.", 404);

  const supabase = createServerClient();
  let query = supabase
    .from("staff_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("restaurant_id", session.restaurantId)
    .is("revoked_at", null);
  if (session.role !== "owner") query = query.eq("staff_id", session.staffId);

  const { data, error } = await query.select("id");
  if (error) {
    console.error("[access-tokens DELETE]", error);
    return err("DB_ERROR", "Couldn't revoke the token.", 500);
  }
  if (!data || data.length === 0) return err("NOT_FOUND", "Token not found or already revoked.", 404);
  return NextResponse.json({ ok: true });
}
