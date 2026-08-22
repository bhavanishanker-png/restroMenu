import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setAdminCookie, clearAdminCookie } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  secret: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(`admin-auth:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in 15 minutes." } },
      { status: 429 }
    );
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON." } },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Secret is required." } },
      { status: 400 }
    );
  }

  const expected = process.env.SUPER_ADMIN_SECRET;
  if (!expected || parsed.data.secret !== expected) {
    return NextResponse.json(
      { error: { code: "INVALID_SECRET", message: "Incorrect secret." } },
      { status: 401 }
    );
  }

  await setAdminCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  clearAdminCookie();
  return NextResponse.json({ ok: true });
}
