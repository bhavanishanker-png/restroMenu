import { notFound } from "next/navigation";
import { fetchOrder } from "@/lib/queries/order";
import { orderIdSchema, toGuestOrder } from "@/lib/order-privacy";
import { OrderTrackerClient } from "@/components/order/OrderTrackerClient";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

type Props = { params: { orderId: string } };

function TrackerHeader() {
  return (
    <header className="glass-strong sticky top-0 z-10 flex h-[56px] items-center justify-center gap-2 border-x-0 border-t-0 px-margin-mobile">
      <span
        className="material-symbols-outlined text-brand-text"
        style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        receipt_long
      </span>
      <h1 className="font-display text-title text-on-surface">Order status</h1>
    </header>
  );
}

export default async function OrderTrackerPage({ params }: Props) {
  const { orderId } = params;
  // A malformed ID would surface as a Postgres cast error — i.e. the "we
  // couldn't load your order" screen — for an order that cannot exist.
  if (!orderIdSchema.safeParse(orderId).success) notFound();

  const result = await fetchOrder(orderId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    // A database hiccup used to render as a 404 — telling a guest who has
    // just paid that their order does not exist. Say what actually happened.
    return (
      <div className="min-h-screen bg-surface">
        <TrackerHeader />
        <div className="flex flex-col items-center gap-4 px-margin-mobile py-xl text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-container text-on-warning-container" aria-hidden="true">
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>cloud_off</span>
          </div>
          <div className="space-y-1">
            <p className="font-display text-headline-sm text-on-surface">We couldn&rsquo;t load your order</p>
            <p className="measure-sm text-body-sm text-on-surface-variant">
              Your order is safe — this is a temporary problem on our side. Try again in a moment, or ask a member of staff.
            </p>
          </div>
          {/* A plain link to the same URL: a full reload, no client JS needed. */}
          <a
            href={`/order/${orderId}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-brand-foreground shadow-glow"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">refresh</span>
            Try again
          </a>
        </div>
      </div>
    );
  }

  const { order, items, tableLabel, estimatedReadyAt } = result;

  return (
    <div className="min-h-screen bg-surface">
      <TrackerHeader />

      <InstallPrompt />
      <OrderTrackerClient
        orderId={orderId}
        // Everything passed to a client component is serialised into the
        // page HTML, so the guest view is redacted here too, not just in the
        // polling API.
        initialOrder={toGuestOrder(order)}
        initialItems={items}
        tableLabel={tableLabel}
        estimatedReadyAt={estimatedReadyAt}
      />
    </div>
  );
}
