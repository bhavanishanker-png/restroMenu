import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { toStaff } from "@/lib/mappers";
import { StaffManager } from "@/components/staff/StaffManager";
import type { DbStaff } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "manager") redirect("/dashboard");

  const supabase = createServerClient();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const staff = (data ?? []).map((r) => toStaff(r as DbStaff));

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant/30 bg-surface-container-lowest px-md py-sm shadow-level-1">
        <div>
          <h1 className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>
            Staff Members
          </h1>
          <p className="font-body-sm text-on-surface-variant">
            Manage your restaurant team and access permissions.
          </p>
        </div>
      </header>
      <StaffManager initialStaff={staff} />
    </div>
  );
}
