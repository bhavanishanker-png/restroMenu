"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/pricing";
import { useCartStore } from "@/store/cart";
import { OrderProgressBar } from "./OrderProgressBar";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import type { Order, OrderItem } from "@/types";

type Props = {
  orderId: string;
  initialOrder: Order;
  initialItems: OrderItem[];
  tableLabel: string | null;
  estimatedReadyAt: string | null;
};

// ---------------------------------------------------------------- Estimated ready countdown

function EstimatedReady({ isoString }: { isoString: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isoString) { setLabel(null); return; }

    const compute = () => {
      const diff = Math.round((new Date(isoString).getTime() - Date.now()) / 60_000);
      if (diff > 1) setLabel(`Ready in ~${diff} min`);
      else if (diff > -5) setLabel("Any moment now");
      else setLabel(null);
    };

    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [isoString]);

  if (!label) return null;
  return (
    <p className="text-center text-sm font-medium text-stone-600">{label}</p>
  );
}

// ---------------------------------------------------------------- Feedback prompt (R2 saves to DB)

function FeedbackPrompt() {
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p className="text-center font-body-md font-medium text-primary">
        Thank you for your feedback!
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-4 text-center space-y-2 shadow-level-1">
      <p className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>How was your experience?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => { setRating(star); setSubmitted(true); }}
            aria-label={`Rate ${star} stars`}
            className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <span
              className={`material-symbols-outlined transition-colors ${
                star <= rating ? "fill text-amber-400" : "text-outline-variant"
              }`}
              style={{ fontSize: 28 }}
            >
              star
            </span>
          </button>
        ))}
      </div>
      <p className="text-body-sm text-on-surface-variant">Tap a star to rate</p>
    </div>
  );
}

// ---------------------------------------------------------------- main component

export function OrderTrackerClient({
  orderId,
  initialOrder,
  initialItems,
  tableLabel,
  estimatedReadyAt,
}: Props) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const [socketActive, setSocketActive] = useState(false);
  const clearCart = useCartStore((s) => s.clearCart);
  const cartCleared = useRef(false);

  // Clear the cart once — the customer has successfully placed their order.
  useEffect(() => {
    if (cartCleared.current) return;
    cartCleared.current = true;
    useCartStore.persist.rehydrate();
    clearCart();
  }, [clearCart]);

  // Re-fetch order from the server-side API route.
  const refresh = async () => {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { order: Order; items: OrderItem[] };
    setOrder(data.order);
    setItems(data.items);
  };

  // Primary: Supabase Realtime via postgres_changes.
  // Requires migration 003_order_tracker_realtime.sql to be run.
  // Falls back to polling if the socket is unavailable or RLS blocks it.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        () => {
          // Re-fetch via API (service role) to get consistent typed data
          refresh();
        }
      )
      .subscribe((status) => {
        setSocketActive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Fallback: 15s polling when Realtime socket is down.
  useEffect(() => {
    if (socketActive) return;
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketActive, orderId]);

  const paymentLabel: Record<string, string> = {
    pending: "Payment pending",
    paid: "Paid",
    failed: "Payment failed",
    refunded: "Refunded",
  };

  const paymentColor: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    paid: "bg-secondary-container text-on-secondary-container",
    failed: "bg-tertiary/10 text-tertiary",
    refunded: "bg-surface-container text-on-surface-variant",
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-16">
      {/* Order number + status chip */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-4 space-y-1.5 text-center shadow-level-1">
        <p className="text-[32px] font-bold tracking-tight text-on-surface font-display">
          {order.orderNumber}
        </p>
        {tableLabel && (
          <p className="text-body-md text-on-surface-variant">Table {tableLabel}</p>
        )}
        {estimatedReadyAt && (
          <EstimatedReady isoString={estimatedReadyAt} />
        )}
        <span
          className={`inline-block rounded-full px-3 py-0.5 font-label-bold text-label-bold ${
            paymentColor[order.paymentStatus] ?? "bg-surface-container text-on-surface-variant"
          }`}
        >
          {paymentLabel[order.paymentStatus] ?? order.paymentStatus}
        </span>
      </div>

      {/* Progress stepper */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-6 shadow-level-1">
        <OrderProgressBar status={order.status} />
      </div>

      {/* Feedback on served */}
      {order.status === "served" && <FeedbackPrompt />}

      {/* Order items */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 divide-y divide-outline-variant/30 shadow-level-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 py-3">
            {/* Snapshot image — what the dish looked like when it was ordered,
                not whatever menu_items holds today. */}
            {item.imageUrl && (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                <Image
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <FoodTypeMarker type="veg" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-body-md font-semibold text-on-surface">
                {item.quantity}× {item.itemName}
              </p>
              {item.variantName && (
                <p className="text-body-sm text-on-surface-variant">{item.variantName}</p>
              )}
              {item.addons.length > 0 && (
                <p className="text-body-sm text-on-surface-variant">
                  {item.addons.map((a) => a.name).join(", ")}
                </p>
              )}
              {item.notes && (
                <p className="text-body-sm italic text-on-surface-variant">&ldquo;{item.notes}&rdquo;</p>
              )}
            </div>
            <p className="shrink-0 text-body-md font-semibold text-primary">
              {formatMoney(item.lineTotal)}
            </p>
          </div>
        ))}
      </div>

      {/* Bill totals */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 space-y-2 shadow-level-1">
        <div className="flex justify-between text-body-md text-on-surface-variant">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        {order.taxTotal > 0 && (
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Tax</span>
            <span>{formatMoney(order.taxTotal)}</span>
          </div>
        )}
        {order.serviceCharge > 0 && (
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Service charge</span>
            <span>{formatMoney(order.serviceCharge)}</span>
          </div>
        )}
        {order.packingCharge > 0 && (
          <div className="flex justify-between text-body-md text-on-surface-variant">
            <span>Packing charge</span>
            <span>{formatMoney(order.packingCharge)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="flex justify-between text-body-md text-[#3f6653]">
            <span>Discount</span>
            <span>−{formatMoney(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-outline-variant/30 pt-2">
          <span className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Total</span>
          <span className="font-headline-sm text-primary" style={{ fontSize: 18 }}>{formatMoney(order.total)}</span>
        </div>
      </div>
    </div>
  );
}
