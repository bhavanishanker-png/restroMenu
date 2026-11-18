import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { fetchFloorBoard } from "@/lib/queries/floor";
import { FloorView } from "@/components/floor/FloorView";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const board = await fetchFloorBoard(session.restaurantId);

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Floor"
        description="Live view of every table — active orders and who's calling for service. Tap a request to clear it."
      />
      <FloorView restaurantId={session.restaurantId} initial={board} />
    </div>
  );
}
