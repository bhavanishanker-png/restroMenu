"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/pricing";
import { ORDER_STATUS_ICONS } from "@/lib/order-status";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
import { OrderTimeline } from "./OrderTimeline";
import type { Order, OrderItem, OrderStatus, PaymentStatus } from "@/types";

type Props = {
  orderId: string;
  initialOrder: Order;
  initialItems: OrderItem[];
  tableLabel: string | null;
  estimatedReadyAt: string | null;
};

// ---------------------------------------------------------------- copy

/** Headline + "what happens next" for each status, written for the diner. */
const STATUS_COPY: Record<OrderStatus, { title: string; next: (table: string | null) => string }> = {
  placed: {
    title: "Order sent to the kitchen",
    next: () => "The restaurant will confirm it in a moment. This page updates on its own.",
  },
  accepted: {
    title: "Order confirmed",
    next: () => "The kitchen has your order and will start cooking shortly.",
  },
  preparing: {
    title: "Your food is being prepared",
    next: () => "Sit back — we'll update this page the moment it's ready.",
  },
  ready: {
    title: "Your food is ready!",
    next: (table) => (table ? `A server is bringing it to Table ${table} now.` : "A server is bringing it over now."),
  },
  served: {
    title: "Enjoy your meal",
    next: () => "Want something else? Scan the table QR again to add to your order, or ask a member of staff.",
  },
  cancelled: {
    title: "Order cancelled",
    next: () => "Please speak to a member of staff if you weren't expecting this.",
  },
};

const IN_FLIGHT: OrderStatus[] = ["placed", "accepted", "preparing"];

const PAYMENT_PILL: Record<PaymentStatus, { label: string; icon: string; className: string }> = {
  pending:  { label: "Payment pending", icon: "schedule",     className: "bg-warning-container text-on-warning-container" },
  paid:     { label: "Paid",            icon: "check_circle", className: "bg-success-container text-on-success-container" },
  failed:   { label: "Payment failed",  icon: "error",        className: "bg-error-container text-on-error-container" },
  refunded: { label: "Refunded",        icon: "undo",         className: "bg-surface-container-high text-on-surface-variant" },
};

// ---------------------------------------------------------------- Estimated ready countdown

function EstimatedReady({ isoString }: { isoString: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const compute = () => {
      const diff = Math.round((new Date(isoString).getTime() - Date.now()) / 60_000);
      if (diff > 1) setLabel(`~${diff} min`);
      else if (diff > -5) setLabel("Any moment now");
      else setLabel(null);
    };

    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [isoString]);

  if (!label) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5">
      <span className="material-symbols-outlined text-brand-text" style={{ fontSize: 22 }} aria-hidden="true">
        timer
      </span>
      <div className="leading-tight">
        <p className="text-body-xs text-on-surface-variant">Estimated ready in</p>
        <p className="tabular font-display text-title text-on-surface" aria-live="polite">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Feedback prompt (R2 saves to DB)

function FeedbackPrompt() {
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-4 text-body-md font-medium text-on-surface shadow-level-1" role="status">
        <span className="material-symbols-outlined text-success" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          favorite
        </span>
        Thank you for your feedback!
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-4 text-center shadow-level-1">
      <p className="font-display text-title text-on-surface">How was your meal?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => { setRating(star); setSubmitted(true); }}
            aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <span
              className={cn("material-symbols-outlined transition-colors", star <= rating ? "fill text-warning" : "text-outline")}
              style={{ fontSize: 30 }}
              aria-hidden="true"
            >
              star
            </span>
          </button>
        ))}
      </div>
      <p className="text-body-xs text-on-surface-variant">Tap a star to rate</p>
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
  const [timeFormatter, setTimeFormatter] = useState<((iso: string) => string) | null>(null);
  const clearCart = useCartStore((s) => s.clearCart);
  const cartCleared = useRef(false);

  // Clear the cart once — the customer has successfully placed their order.
  useEffect(() => {
    if (cartCleared.current) return;
    cartCleared.current = true;
    useCartStore.persist.rehydrate();
    clearCart();
  }, [clearCart]);

  // Clock times depend on the device time zone, which the server can't know —
  // format them only after mount so SSR and hydration agree.
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    setTimeFormatter(() => (iso: string) => fmt.format(new Date(iso)));
  }, []);

  // Re-fetch order from the server-side API route.
  const refresh = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) {
        // A failed poll is not fatal — the next tick retries — but it must
        // not vanish silently either.
        console.error(`[order-tracker] refresh failed: HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { order: Order; items: OrderItem[] };
      setOrder(data.order);
      setItems(data.items);
    } catch (err) {
      console.error("[order-tracker] refresh failed", err);
    }
  };

  // Accelerator: Supabase Realtime via postgres_changes. It only fires where
  // migration 003_order_tracker_realtime.sql has been applied — without it,
  // RLS filters every event out. The socket still reports SUBSCRIBED in that
  // case, so `socketActive` is not evidence that events are arriving and the
  // poll below must run regardless.
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // The reliable path: poll while the customer is looking at the page. A diner
  // watching for "Ready" must never have to pull-to-refresh to find out.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const copy = STATUS_COPY[order.status];
  const cancelled = order.status === "cancelled";
  const ready = order.status === "ready";
  const inFlight = IN_FLIGHT.includes(order.status);
  // Cash orders are "pending" until the guest pays at the table, which is
  // expected rather than a warning.
  const payment =
    order.paymentStatus === "pending" && order.paymentMethod === "cash"
      ? { label: "Pay at table", icon: "payments", className: "bg-surface-container-high text-on-surface" }
      : PAYMENT_PILL[order.paymentStatus];

  return (
    <div className="mx-auto max-w-md space-y-4 px-margin-mobile pb-16 pt-4">
      {/* Status hero */}
      <section
        aria-live="polite"
        className={cn(
          "overflow-hidden rounded-2xl border bg-surface-container-lowest shadow-level-2",
          cancelled ? "border-error/40" : ready ? "border-success/50" : "border-outline-variant"
        )}
      >
        <div
          className={cn(
            "flex items-start gap-3 px-4 pb-4 pt-5",
            cancelled ? "bg-error-container/50" : ready ? "bg-success-container/60" : "bg-brand-subtle"
          )}
        >
          <span
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
              cancelled ? "bg-error text-on-error" : ready ? "bg-success text-on-success" : "bg-brand text-brand-foreground"
            )}
            aria-hidden="true"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>
              {ORDER_STATUS_ICONS[order.status]}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-headline-sm leading-tight text-on-surface">{copy.title}</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">{copy.next(tableLabel)}</p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          {/* Order numbers can be long ("ORD-0002"), so the number gets its
              own line and never wraps; the pills sit beneath it. */}
          <div>
            <p className="text-body-xs text-on-surface-variant">Order number</p>
            <p className="whitespace-nowrap font-mono font-bold leading-tight tracking-tight text-on-surface" style={{ fontSize: 32 }}>
              #{order.orderNumber}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tableLabel && (
                <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-container-high px-2.5 py-0.5 text-[0.75rem] font-semibold text-on-surface">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
                    table_restaurant
                  </span>
                  Table {tableLabel}
                </span>
              )}
              <span className={cn("flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold", payment.className)}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">{payment.icon}</span>
                {payment.label}
              </span>
            </div>
          </div>

          {/* The server computes the estimate at page load; once the order is
              ready or served it no longer means anything, so hide it. */}
          {estimatedReadyAt && inFlight && <EstimatedReady isoString={estimatedReadyAt} />}

          {!cancelled && order.status !== "served" && (
            <p className="flex items-center gap-1.5 text-body-xs text-on-surface-variant">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Live — updates automatically
            </p>
          )}
        </div>
      </section>

      {/* Progress */}
      {!cancelled && (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-5 shadow-level-1">
          <OrderTimeline order={order} formatTime={timeFormatter} />
        </section>
      )}

      {/* Feedback on served */}
      {order.status === "served" && <FeedbackPrompt />}

      {/* Order items */}
      <section
        aria-labelledby="order-items-heading"
        className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 shadow-level-1"
      >
        <h2 id="order-items-heading" className="flex items-center justify-between pb-1 pt-4 font-display text-title text-on-surface">
          Your order
          <span className="tabular text-body-xs font-normal text-on-surface-variant">
            {items.reduce((n, i) => n + i.quantity, 0)} items
          </span>
        </h2>
        {items.length === 0 ? (
          <p className="py-4 text-body-sm text-on-surface-variant">No items on this order.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                {/* Snapshot image — what the dish looked like when it was ordered,
                    not whatever menu_items holds today. */}
                {item.imageUrl && (
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                {/* The veg marker that sat here was hard-coded to "veg", so
                    every dish — butter chicken included — was labelled
                    vegetarian. order_items has no food-type snapshot, so no
                    marker is shown rather than a wrong one. */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-body-sm font-semibold text-on-surface">
                    <span className="tabular">{item.quantity}×</span> {item.itemName}
                  </p>
                  {(item.variantName || item.addons.length > 0) && (
                    <p className="text-body-xs text-on-surface-variant">
                      {[item.variantName, ...item.addons.map((a) => a.name)].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-body-xs italic text-on-surface-variant">&ldquo;{item.notes}&rdquo;</p>
                  )}
                </div>
                <p className="tabular shrink-0 text-body-sm font-semibold text-on-surface">
                  {formatMoney(item.lineTotal)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bill totals — the order's stored snapshot, never recomputed. */}
      <section
        aria-labelledby="order-bill-heading"
        className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1"
      >
        <h2 id="order-bill-heading" className="mb-3 flex items-center gap-2 font-display text-title text-on-surface">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }} aria-hidden="true">
            receipt_long
          </span>
          Bill
        </h2>
        <dl className="space-y-2 text-body-sm">
          <BillRow label="Item total" value={formatMoney(order.subtotal)} />
          {order.taxTotal > 0 && <BillRow label="GST" value={formatMoney(order.taxTotal)} />}
          {order.serviceCharge > 0 && <BillRow label="Service charge" value={formatMoney(order.serviceCharge)} />}
          {order.packingCharge > 0 && <BillRow label="Packing charge" value={formatMoney(order.packingCharge)} />}
          {order.discount > 0 && (
            <BillRow label="Discount" value={`−${formatMoney(order.discount)}`} className="text-success" />
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-outline-variant pt-3">
            <dt className="font-display text-title text-on-surface">Total</dt>
            <dd className="tabular font-display text-headline-sm text-on-surface">{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function BillRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between text-on-surface-variant", className)}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
