import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { fetchKitchenBoard } from "@/lib/queries/kitchen";
import { KitchenDisplay } from "@/components/kitchen/KitchenDisplay";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  // The board and the restaurant name are independent reads — issue them together.
  const [restaurantResult, board] = await Promise.all([
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", session.restaurantId)
      .single(),
    fetchKitchenBoard(session.restaurantId),
  ]);

  return (
    <KitchenDisplay
      restaurantId={session.restaurantId}
      restaurantName={restaurantResult.data?.name ?? "Kitchen"}
      initialOrders={board.orders}
      initialServiceRequests={board.serviceRequests}
    />
  );
}
