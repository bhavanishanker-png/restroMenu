import { createServerClient } from "@/lib/supabase/server";
import { toStaffMember } from "@/lib/mappers";
import { getLoginEmails } from "@/lib/staff-accounts";
import type { StaffMember } from "@/types";
import type { DbStaff } from "@/types/db";

export type FetchStaffResult =
  | { ok: true; staff: StaffMember[] }
  | { ok: false };

/** Active staff for one restaurant, with each person's sign-in email. */
export async function fetchStaffMembers(restaurantId: string): Promise<FetchStaffResult> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[staff query]", error);
    return { ok: false };
  }

  const rows = (data ?? []) as DbStaff[];
  return { ok: true, staff: await withLoginEmails(rows) };
}

/** Attaches sign-in emails to staff rows (one Auth lookup per linked row). */
export async function withLoginEmails(rows: DbStaff[]): Promise<StaffMember[]> {
  const linked = rows.flatMap((r) => (r.auth_user_id ? [r.auth_user_id] : []));
  const emails = await getLoginEmails(linked);
  return rows.map((r) =>
    toStaffMember(r, r.auth_user_id ? emails.get(r.auth_user_id) ?? null : null)
  );
}
