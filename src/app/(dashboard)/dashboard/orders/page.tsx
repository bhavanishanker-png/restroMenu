import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-0">
      <div className="border-b border-stone-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-stone-900">Orders</h1>
        <p className="text-sm text-stone-500">Filter, search, and export order history.</p>
      </div>
      <OrdersClient />
    </div>
  );
}
