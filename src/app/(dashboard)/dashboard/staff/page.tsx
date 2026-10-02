import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { fetchStaffMembers } from "@/lib/queries/staff";
import { StaffManager } from "@/components/staff/StaffManager";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  const result = await fetchStaffMembers(session.restaurantId);

  // An error used to render as an empty team. Surface it via error.tsx.
  if (!result.ok) throw new Error("Failed to load staff.");
  const staff = result.staff;

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Staff"
        description="Who can sign in to QBite, what they can open, and how they sign in."
      />
      <StaffManager
        initialStaff={staff}
        canManage={session.role === "owner"}
        currentStaffId={session.staffId}
      />
    </div>
  );
}
