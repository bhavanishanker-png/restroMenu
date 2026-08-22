import { getStaffSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getStaffSession();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center p-8">
      <h1 className="text-2xl font-bold text-stone-900">Welcome back</h1>
      <p className="text-stone-500 capitalize">{session?.role}</p>
      <p className="text-sm text-stone-400">Full dashboard UI in T17.</p>
    </div>
  );
}
