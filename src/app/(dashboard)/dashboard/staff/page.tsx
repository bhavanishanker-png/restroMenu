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
    <div className="flex flex-col gap-0">
      <div className="border-b border-stone-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-stone-900">Staff</h1>
        <p className="text-sm text-stone-500">Manage team members and their access.</p>
      </div>
      <StaffManager initialStaff={staff} />
    </div>
  );
}
