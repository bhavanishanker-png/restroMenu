"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
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
      <p className="text-center text-sm font-medium text-[#C2410C]">
        Thank you for your feedback!
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-center space-y-2">
      <p className="text-sm font-semibold text-stone-800">How was your experience?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => { setRating(star); setSubmitted(true); }}
            aria-label={`Rate ${star} stars`}
            className="p-1"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                star <= rating ? "fill-amber-400 text-amber-400" : "text-stone-300"
              }`}
            />
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-400">Tap a star to rate</p>
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
    paid: "bg-green-50 text-green-700",
    failed: "bg-red-50 text-red-700",
    refunded: "bg-stone-100 text-stone-600",
  };

  return (
    <div className="space-y-4 p-4 pb-16">
      {/* Order number + table */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 space-y-1 text-center">
        <p className="text-3xl font-bold tracking-tight text-stone-900">
          {order.orderNumber}
        </p>
        {tableLabel && (
          <p className="text-sm text-stone-500">Table {tableLabel}</p>
        )}
        <span
          className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
            paymentColor[order.paymentStatus] ?? "bg-stone-100 text-stone-600"
          }`}
        >
          {paymentLabel[order.paymentStatus] ?? order.paymentStatus}
        </span>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-5">
        <OrderProgressBar status={order.status} />
        <div className="mt-3">
          <EstimatedReady isoString={estimatedReadyAt} />
        </div>
      </div>

      {/* Feedback on served */}
      {order.status === "served" && <FeedbackPrompt />}

      {/* Order items */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 divide-y divide-stone-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 py-3">
            <FoodTypeMarker type="veg" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-stone-900">
                {item.quantity}× {item.itemName}
              </p>
              {item.variantName && (
                <p className="text-xs text-stone-500">{item.variantName}</p>
              )}
              {item.addons.length > 0 && (
                <p className="text-xs text-stone-400">
                  {item.addons.map((a) => a.name).join(", ")}
                </p>
              )}
              {item.notes && (
                <p className="text-xs italic text-stone-400">&ldquo;{item.notes}&rdquo;</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-semibold text-stone-700">
              {formatMoney(item.lineTotal)}
            </p>
          </div>
        ))}
      </div>

      {/* Bill totals */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-sm text-stone-600">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        {order.taxTotal > 0 && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>Tax</span>
            <span>{formatMoney(order.taxTotal)}</span>
          </div>
        )}
        {order.serviceCharge > 0 && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>Service charge</span>
            <span>{formatMoney(order.serviceCharge)}</span>
          </div>
        )}
        {order.packingCharge > 0 && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>Packing charge</span>
            <span>{formatMoney(order.packingCharge)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="flex justify-between text-sm text-green-700">
            <span>Discount</span>
            <span>−{formatMoney(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-stone-100 pt-1.5 font-semibold text-stone-900">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>
      </div>
    </div>
  );
}
