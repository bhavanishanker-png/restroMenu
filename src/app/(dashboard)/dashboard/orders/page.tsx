import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Orders"
        description="Search, filter and export every order the restaurant has taken."
      />
      <OrdersClient restaurantId={session.restaurantId} />
    </div>
  );
}
