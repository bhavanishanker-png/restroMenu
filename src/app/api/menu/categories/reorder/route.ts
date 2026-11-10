import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { invalidatesPublicMenu } from "@/lib/queries/menu";

const schema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).min(1),
});

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request." } },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 }
    );
  }

  const session = await getStaffSession();
  const supabase = createServerClient();

  // Verify all IDs belong to this restaurant, then update each sort_order
  const ids = parsed.data.items.map((i) => i.id);
  const { data: rows, error: lookupError } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("restaurant_id", session!.restaurantId)
    .in("id", ids);

  if (lookupError) {
    console.error("[categories reorder] lookup", lookupError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to save the new order. Try again." } },
      { status: 500 }
    );
  }

  const validIds = new Set((rows ?? []).map((r) => r.id));

  // Update each validated category's sort_order
  const updates = parsed.data.items.filter((i) => validIds.has(i.id));
  const results = await Promise.all(
    updates.map((item) =>
      supabase
        .from("menu_categories")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
        .eq("restaurant_id", session!.restaurantId)
    )
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.error("[categories reorder] update", failed.map((r) => r.error));
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Some categories didn't move. Refresh and try again." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export const POST = invalidatesPublicMenu(handlePost);
