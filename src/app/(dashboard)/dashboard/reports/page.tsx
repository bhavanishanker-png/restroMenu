import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { SalesReport } from "@/components/reports/SalesReport";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PageHeader
        title="Sales reports"
        description="Revenue, order volume and daily trend for any date range."
      />
      <SalesReport />
    </div>
  );
}
