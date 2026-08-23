import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { SalesReport } from "@/components/reports/SalesReport";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant/30 bg-surface-container-lowest px-md py-sm shadow-level-1">
        <div>
          <h1 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>
            Sales Reports
          </h1>
          <p className="font-body-sm text-on-surface-variant">
            Review daily performance and revenue trends.
          </p>
        </div>
      </header>
      <SalesReport />
    </div>
  );
}
