import { notFound } from "next/navigation";
import { fetchOrder } from "@/lib/queries/order";
import { OrderTrackerClient } from "@/components/order/OrderTrackerClient";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

type Props = { params: { orderId: string } };

export default async function OrderTrackerPage({ params }: Props) {
  const { orderId } = params;
  const result = await fetchOrder(orderId);

  if (!result.ok) notFound();

  const { order, items, tableLabel, estimatedReadyAt } = result;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-outline-variant bg-surface-container-lowest px-4 py-3 text-center">
        <p className="text-sm font-semibold text-on-surface">Order status</p>
      </header>

      <InstallPrompt />
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
