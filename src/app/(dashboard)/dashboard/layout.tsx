import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();
  const [restaurantRes, staffRes] = await Promise.all([
    supabase.from("restaurants").select("name").eq("id", session.restaurantId).single(),
    // The signed-in person's name for the sidebar footer.
    supabase
      .from("staff")
      .select("name")
      .eq("id", session.staffId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle(),
  ]);

  // Neither read is critical — the nav falls back to "Restaurant" and the
  // role label — but a failure must not pass silently.
  if (restaurantRes.error) console.error("[dashboard layout] restaurant", restaurantRes.error);
  if (staffRes.error) console.error("[dashboard layout] staff", staffRes.error);

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop rail, plus the phone top bar and its menu drawer. */}
      <DashboardNav
        role={session.role}
        restaurantName={restaurantRes.data?.name ?? "Restaurant"}
        staffName={staffRes.data?.name ?? null}
      />

      {/* overflow-x-clip, not overflow-auto: an overflow container becomes
          the scrollport for position: sticky, and since the window (not this
          element) scrolls, sticky children like the Settings section menu
          never stuck. Clip still stops wide content widening the page. */}
      <main className="flex-1 md:ml-[280px] min-h-screen min-w-0 pt-[56px] md:pt-0 overflow-x-clip">
        {children}
      </main>
    </div>
  );
}
