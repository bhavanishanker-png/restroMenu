import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession, requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_ACTIVE_TOKENS, generateAccessToken } from "@/lib/access-tokens";
import { toAccessToken } from "@/lib/mappers";
import type { DbStaffAccessToken } from "@/types/db";

// ─── /api/settings/access-tokens ────────────────────────────────────────────
// Personal access tokens for the owner MCP server (T35). Owners and managers
// only; kitchen and waiter roles get 403 from requireRole. The token secret
// is returned ONCE, from POST, and never stored or shown again.

const createSchema = z.object({ name: z.string().trim().min(1, "Give the token a name.").max(60) });

type Row = Omit<DbStaffAccessToken, "token_hash"> & { staff: { name: string } | { name: string }[] | null };

const SELECT = "id, restaurant_id, staff_id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, staff(name)";

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function creatorName(row: Row): string | null {
  const s = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return s?.name ?? null;
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;
  const session = await getStaffSession();
  if (!session) return err("UNAUTHORIZED", "Authentication required.", 401);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("staff_access_tokens")
    .select(SELECT)
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[access-tokens GET]", error);
    return err("DB_ERROR", "Couldn't load access tokens.", 500);
  }
  const rows = (data ?? []) as unknown as Row[];
  return NextResponse.json({ tokens: rows.map((r) => toAccessToken(r, creatorName(r))) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;
  const session = await getStaffSession();
  if (!session) return err("UNAUTHORIZED", "Authentication required.", 401);

  if (!(await checkRateLimit(`token-create:${session.staffId}`, 10, 60 * 60_000))) {
    return err("RATE_LIMITED", "Too many tokens created. Try again in an hour.", 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err("INVALID_JSON", "Invalid request.", 400);
  }
  const body = createSchema.safeParse(raw);
  if (!body.success) return err("VALIDATION_ERROR", body.error.issues[0]?.message ?? "Invalid input.", 400);

  const supabase = createServerClient();
  const { count, error: countError } = await supabase
    .from("staff_access_tokens")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", session.restaurantId)
    .is("revoked_at", null);
  if (countError) {
    console.error("[access-tokens POST] count", countError);
    return err("DB_ERROR", "Couldn't create the token.", 500);
  }
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
    return err("TOO_MANY_TOKENS", `You have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`, 409);
  }

  const { token, prefix, hash } = generateAccessToken();
  const { data, error } = await supabase
    .from("staff_access_tokens")
    .insert({
      restaurant_id: session.restaurantId,
      staff_id: session.staffId,
      name: body.data.name,
      token_prefix: prefix,
      token_hash: hash,
      scopes: ["read"],
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    console.error("[access-tokens POST] insert", error);
    return err("DB_ERROR", "Couldn't create the token.", 500);
  }

  const row = data as unknown as Row;
  // The only time the secret leaves the server.
  return NextResponse.json({ token, accessToken: toAccessToken(row, creatorName(row)) }, { status: 201 });
}
