import { NextResponse } from "next/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { fetchKitchenBoard } from "@/lib/queries/kitchen";

export const dynamic = "force-dynamic";

/**
 * GET /api/kitchen/board — the kitchen display's polling endpoint.
 *
 * The board cannot refresh itself over Supabase Realtime: the browser holds
 * the anon key and `orders` RLS resolves staff identity through `auth.uid()`,
 * which a cookie session never sets. This route is the supported read path —
 * service role, tenant scoped to the caller's own restaurant.
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
    const board = await fetchKitchenBoard(session.restaurantId);
    return NextResponse.json(board);
  } catch (err) {
    console.error("[kitchen board GET]", err);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load the kitchen board." } },
      { status: 500 }
    );
  }
}
