import { NextResponse } from "next/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { fetchFloorBoard } from "@/lib/queries/floor";

export const dynamic = "force-dynamic";

/**
 * GET /api/floor/board — the floor view's read endpoint.
 *
 * Same constraint as the kitchen board: staff use a cookie session, so the
 * anon client reads nothing under RLS. Service role, scoped to the caller's
 * own restaurant. The floor view refreshes on the same Supabase Realtime
 * broadcast the kitchen uses (orders + service requests), with a slow poll as
 * the safety net.
 */
export async function GET(): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager", "kitchen", "waiter"]);
  if (guard) return guard;

  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 }
    );
  }

  try {
    const board = await fetchFloorBoard(session.restaurantId);
    return NextResponse.json(board);
  } catch (err) {
    console.error("[floor board GET]", err);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load the floor board." } },
      { status: 500 }
    );
  }
}
