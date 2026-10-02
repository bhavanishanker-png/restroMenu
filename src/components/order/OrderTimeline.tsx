import { ORDER_STATUS_ICONS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";

type Step = {
  key: Exclude<OrderStatus, "cancelled">;
  label: string;
  detail: string;
  at: (o: Order) => string | null;
};

// Guest-facing wording. The staff labels in order-status.ts ("New") read as
// jargon to a diner; the icons are shared so both sides see the same symbol.
const STEPS: Step[] = [
  { key: "placed",    label: "Order placed",   detail: "Sent to the kitchen",            at: (o) => o.placedAt },
  { key: "accepted",  label: "Confirmed",      detail: "The restaurant accepted it",     at: (o) => o.acceptedAt },
  { key: "preparing", label: "Being prepared", detail: "The chefs are cooking",          at: () => null },
  { key: "ready",     label: "Ready",          detail: "On its way to your table",       at: (o) => o.readyAt },
  { key: "served",    label: "Served",         detail: "Enjoy your meal",                at: (o) => o.servedAt },
];

type Props = {
  order: Order;
  /** Formats an ISO time for display; null until mounted to avoid a TZ hydration mismatch. */
  formatTime: ((iso: string) => string) | null;
};

/**
 * Vertical status timeline. Each step carries an icon *and* a state word for
 * assistive tech ("done", "current"), so progress never rests on colour.
 */
export function OrderTimeline({ order, formatTime }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === order.status);

  return (
    <ol className="relative" aria-label="Order progress">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const last = idx === STEPS.length - 1;
        const at = step.at(order);

        return (
          <li
            key={step.key}
            className="relative flex gap-3 pb-5 last:pb-0"
            aria-current={active ? "step" : undefined}
          >
            {/* Connector to the next step */}
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 rounded-full",
                  done ? "bg-brand" : "bg-outline-variant"
                )}
              />
            )}

            {/* Node */}
            <span
              aria-hidden="true"
              className={cn(
                "relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-slow",
                done && "bg-brand text-brand-foreground",
                active && "bg-brand text-brand-foreground shadow-glow animate-pulse-ring",
                !done && !active && "border-2 border-dashed border-outline-variant text-on-surface-variant/60"
              )}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, fontVariationSettings: done || active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {done ? "check" : ORDER_STATUS_ICONS[step.key]}
              </span>
            </span>

            {/* Copy */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "text-body-md",
                    active ? "font-semibold text-on-surface" : done ? "font-medium text-on-surface" : "text-on-surface-variant"
                  )}
                >
                  {step.label}
                  <span className="sr-only">{done ? " — done" : active ? " — current step" : " — upcoming"}</span>
                </p>
                {at && (done || active) && formatTime && (
                  <time dateTime={at} className="tabular shrink-0 text-body-xs text-on-surface-variant">
                    {formatTime(at)}
                  </time>
                )}
              </div>
              {(active || done) && (
                <p className="text-body-xs text-on-surface-variant">{step.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
