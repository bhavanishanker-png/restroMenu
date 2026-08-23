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
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", session.restaurantId)
    .single();

  return (
    <div className="flex min-h-screen bg-surface">
      <DashboardNav
        role={session.role}
        restaurantName={restaurant?.name ?? "Restaurant"}
      />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-surface-container-lowest px-4 py-3 border-b border-outline-variant/30 shadow-level-1 md:hidden">
        <span className="font-headline-sm text-primary" style={{ fontSize: 18 }}>QBite</span>
        <span className="font-body-sm text-on-surface-variant capitalize">{session.role}</span>
      </div>

      <main className="flex-1 md:ml-[280px] min-h-screen pt-[56px] md:pt-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
