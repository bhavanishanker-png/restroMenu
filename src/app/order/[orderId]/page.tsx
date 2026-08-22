import { notFound } from "next/navigation";
import { fetchOrder } from "@/lib/queries/order";
import { OrderTrackerClient } from "@/components/order/OrderTrackerClient";

type Props = { params: { orderId: string } };

export default async function OrderTrackerPage({ params }: Props) {
  const { orderId } = params;
  const result = await fetchOrder(orderId);

  if (!result.ok) notFound();

  const { order, items, tableLabel, estimatedReadyAt } = result;

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <header className="border-b border-stone-200 bg-white px-4 py-3 text-center">
        <p className="text-sm font-semibold text-stone-800">Order status</p>
      </header>

      <OrderTrackerClient
        orderId={orderId}
        initialOrder={order}
        initialItems={items}
        tableLabel={tableLabel}
        estimatedReadyAt={estimatedReadyAt}
      />
    </div>
  );
}
