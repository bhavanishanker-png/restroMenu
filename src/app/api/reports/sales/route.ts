import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";
import { sumMoney } from "@/lib/pricing";
import { dayKeyInZone, startOfRestaurantDay } from "@/lib/restaurant-time";
import { getRestaurantTimezone } from "@/lib/queries/restaurant-timezone";

// ---------------------------------------------------------------- GET /api/reports/sales
// Returns daily revenue aggregates for a given date range.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const sp = req.nextUrl.searchParams;

  // Days are the restaurant's calendar days, not the server's or UTC's.
  const timezone = await getRestaurantTimezone(session!.restaurantId);

  // Default: last 30 days, today included.
  const dateFrom =
    sp.get("dateFrom") ?? startOfRestaurantDay(timezone, new Date(), 29).toISOString();
  const dateTo = sp.get("dateTo");

  const supabase = createServerClient();

  let query = supabase
    .from("orders")
    .select("placed_at, total, subtotal, tax_total, service_charge, packing_charge, status")
    .eq("restaurant_id", session!.restaurantId)
    .neq("status", "cancelled")
    .gte("placed_at", dateFrom)
    .order("placed_at", { ascending: true });

  if (dateTo) query = query.lte("placed_at", dateTo);

  const { data, error } = await query;

  if (error) {
    console.error("[reports/sales GET]", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to load sales data." } },
      { status: 500 }
    );
  }

  // Group by the restaurant's calendar date. This used `toISOString()` —
  // the UTC date — so in IST everything before 05:30 landed on the day before.
  type SalesRow = NonNullable<typeof data>[number];
  const byDay = new Map<string, SalesRow[]>();
  for (const row of data ?? []) {
    const day = dayKeyInZone(row.placed_at, timezone);
    const rows = byDay.get(day);
    if (rows) rows.push(row);
    else byDay.set(day, [row]);
  }

  // Every sum goes through the pricing helper, which adds in whole paise.
  const days = Array.from(byDay.entries()).map(([date, rows]) => ({
    date,
    orders: rows.length,
    revenue: sumMoney(rows.map((r) => Number(r.total))),
    subtotal: sumMoney(rows.map((r) => Number(r.subtotal))),
    tax: sumMoney(rows.map((r) => Number(r.tax_total))),
    serviceCharge: sumMoney(rows.map((r) => Number(r.service_charge))),
    packingCharge: sumMoney(rows.map((r) => Number(r.packing_charge))),
  }));

  const totals = {
    orders: days.reduce((n, d) => n + d.orders, 0),
    revenue: sumMoney(days.map((d) => d.revenue)),
  };

  return NextResponse.json({ days, totals });
}
