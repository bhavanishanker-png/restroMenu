import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";

// Server-side auth guard for the entire dashboard.
// The middleware catches most unauthenticated requests; this is the
// definitive check after cookie signature verification.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-stone-100">
      {/* Sidebar — full implementation in T17 */}
      <aside className="hidden w-56 shrink-0 border-r border-stone-200 bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-4">
          <span className="text-base font-bold text-[#C2410C]">QBite</span>
        </div>
        <nav className="flex flex-col gap-1 p-3 text-sm">
          <a href="/dashboard" className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100">
            Dashboard
          </a>
          <a href="/dashboard/kitchen" className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100">
            Kitchen
          </a>
          <a href="/dashboard/orders" className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100">
            Orders
          </a>
          <a href="/dashboard/menu" className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100">
            Menu
          </a>
        </nav>
        <div className="mt-auto border-t border-stone-200 p-3">
          <p className="truncate px-3 py-1 text-xs text-stone-400 capitalize">{session.role}</p>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
