import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";

// ---------------------------------------------------------------- GET /api/reports/sales
// Returns daily revenue aggregates for a given date range.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner", "manager"]);
  if (guard) return guard;

  const session = await getStaffSession();
  const sp = req.nextUrl.searchParams;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Default: last 30 days
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const dateFrom = sp.get("dateFrom") ?? thirtyDaysAgo.toISOString();
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

  // Group by date (YYYY-MM-DD in local timezone)
  const dayMap = new Map<
    string,
    { orders: number; revenue: number; subtotal: number; tax: number; serviceCharge: number; packingCharge: number }
  >();

  for (const row of data ?? []) {
    const day = new Date(row.placed_at).toISOString().slice(0, 10);
    const existing = dayMap.get(day) ?? {
      orders: 0, revenue: 0, subtotal: 0, tax: 0, serviceCharge: 0, packingCharge: 0,
    };
    dayMap.set(day, {
      orders: existing.orders + 1,
      revenue: existing.revenue + Number(row.total),
      subtotal: existing.subtotal + Number(row.subtotal),
      tax: existing.tax + Number(row.tax_total),
      serviceCharge: existing.serviceCharge + Number(row.service_charge),
      packingCharge: existing.packingCharge + Number(row.packing_charge),
    });
  }

  const days = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

  const totals = days.reduce(
    (acc, d) => ({
      orders: acc.orders + d.orders,
      revenue: acc.revenue + d.revenue,
    }),
    { orders: 0, revenue: 0 }
  );

  return NextResponse.json({ days, totals });
}
