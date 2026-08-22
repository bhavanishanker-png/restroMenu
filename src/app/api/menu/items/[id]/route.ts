import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// PATCH /api/menu/items/[id]
// Full implementation in T15. Role guard is live now so acceptance criterion
// for T12 passes: kitchen role → 403, owner/manager → 200 stub.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  // Stub — T15 will implement the actual item update.
  return NextResponse.json({ ok: true, id: params.id });
}
