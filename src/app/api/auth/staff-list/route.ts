import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/auth/staff-list?slug=tandoori-hut
// Returns kitchen + waiter staff names for the PIN login screen.
// Public endpoint — names are needed before auth; security by PIN.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json(
      { error: { code: "MISSING_SLUG", message: "slug is required." } },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (restaurantError) {
    console.error("[staff-list] restaurant lookup", restaurantError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Couldn't load staff. Try again." } },
      { status: 500 }
    );
  }
  if (!restaurant) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Restaurant not found." } },
      { status: 404 }
    );
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("restaurant_id", restaurant.id)
    .in("role", ["kitchen", "waiter"])
    .eq("is_active", true)
    .order("name");

  // An empty list would read as "this restaurant has no staff" on the login
  // screen, so a failure must surface as an error.
  if (staffError) {
    console.error("[staff-list] staff lookup", staffError);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Couldn't load staff. Try again." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ staff: staff ?? [] });
}
