import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { SalesReport } from "@/components/reports/SalesReport";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-0">
      <div className="border-b border-stone-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-stone-900">Reports</h1>
        <p className="text-sm text-stone-500">Sales summary by date range.</p>
      </div>
      <SalesReport />
    </div>
  );
}
