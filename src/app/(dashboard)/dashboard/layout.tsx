import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

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
      <div className="glass fixed inset-x-0 top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-4 py-3 md:hidden">
        <Link
          href="/"
          aria-label="QBite home page"
          className="-m-1.5 flex min-h-[44px] items-center gap-2 rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span
            aria-hidden="true"
            className="relative grid h-7 w-7 place-items-center rounded-md bg-primary font-display text-xs font-bold text-primary-foreground"
          >
            Q
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-background" />
          </span>
          <span className="font-display text-[0.9375rem] font-bold tracking-[-0.02em] text-on-surface">
            QBite
          </span>
        </Link>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-0.5 font-label-bold text-label-bold uppercase text-on-surface-variant">
            {session.role}
          </span>
          <ThemeToggle className="h-8 w-8" />
        </span>
      </div>

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
