"use client";

import type { KitchenOrder } from "./types";
import type { OrderStatus } from "@/types";

type Props = {
  order: KitchenOrder;
  now: number;
  isNew: boolean;
  onAdvance: () => void;
  onCancel: () => void;
};

type ActionConfig = {
  label: string;
  variant: "primary" | "outlined" | "secondary";
};

const ACTION_MAP: Partial<Record<OrderStatus, ActionConfig>> = {
  placed:    { label: "Accept",          variant: "primary"   },
  accepted:  { label: "Start Preparing", variant: "primary"   },
  preparing: { label: "Mark Ready",      variant: "outlined"  },
  ready:     { label: "Mark Served",     variant: "secondary" },
};

function elapsedMinutes(placedAt: string, now: number): number {
  return Math.floor((now - new Date(placedAt).getTime()) / 60_000);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Urgency escalates on two axes — colour AND border weight — so it stays
// readable from three feet away and doesn't depend on colour alone.
function urgencyBorderClass(elapsed: number): string {
  if (elapsed >= 25) return "border-l-8 border-l-error";
  if (elapsed >= 15) return "border-l-[6px] border-l-warning";
  return "border-l-4 border-l-surface-container-highest";
}

function elapsedColorClass(elapsed: number): string {
  if (elapsed >= 25) return "text-error font-bold animate-pulse";
  if (elapsed >= 15) return "text-warning font-bold";
  return "text-on-surface-variant";
}

// The advance action is the one thing a cook touches, so it carries the accent
// and the full 60px kitchen tap target. `hover:bg-primary/90` was a bug:
// primary-container is a *surface* token, so the button inverted from a solid
// fill to a dark panel on hover.
function actionBtnClass(variant: ActionConfig["variant"]): string {
  if (variant === "primary")  return "bg-brand text-brand-foreground hover:bg-brand/90 hover:shadow-glow";
  if (variant === "outlined") return "border-2 border-brand text-brand-text hover:bg-brand hover:text-brand-foreground";
  return "bg-surface-container-highest text-on-surface hover:bg-surface-container-high";
}

export function OrderCard({ order, now, isNew, onAdvance }: Props) {
  const elapsed = now === 0 ? 0 : elapsedMinutes(order.placedAt, now);
  const action = ACTION_MAP[order.status];
  const isServed = order.status === "served";
  const borderClass = urgencyBorderClass(elapsed);

  if (isServed) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden opacity-75 hover:opacity-100 transition-opacity border-l-4 border-l-success">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-mono text-on-surface-variant line-through" style={{ fontSize: 18 }}>
            #{order.orderNumber}
          </span>
          <span className="material-symbols-outlined text-success" style={{ fontSize: 20 }}>
            done_all
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden ${borderClass} ${
        isNew ? "animate-slide-in ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-container border-b border-outline-variant">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-on-surface leading-none" style={{ fontSize: 32 }}>
            #{order.orderNumber}
          </span>
          {order.tableLabel && (
            <span className="font-medium text-on-surface-variant" style={{ fontSize: 18 }}>
              {order.tableLabel}
            </span>
          )}
        </div>

        <span className={`font-semibold tabular-nums ${elapsedColorClass(elapsed)}`} style={{ fontSize: 15 }}>
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Items */}
      <div className="px-3 py-2" style={{ fontSize: 18 }}>
        {order.items.map((item) => (
          <div key={item.id} className="mb-2 last:mb-0">
            <p className="font-bold text-on-surface leading-snug">
              <span className="text-on-surface-variant font-normal">{item.quantity}×</span>{" "}
              {item.itemName}
              {item.variantName && (
                <span className="text-on-surface-variant font-normal" style={{ fontSize: 15 }}>
                  {" "}({item.variantName})
                </span>
              )}
            </p>

            {item.addons.length > 0 && (
              <p className="ml-4 text-on-surface-variant" style={{ fontSize: 15 }}>
                + {item.addons.map((a) => a.name).join(", ")}
              </p>
            )}

            {item.notes && (
              <p
                className="ml-4 mt-xs rounded-md bg-tertiary-container px-2 py-0.5 font-medium text-on-tertiary-container"
                style={{ fontSize: 15 }}
              >
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Action button */}
      {action && (
        <div className="px-3 pb-3">
          <button
            className={`w-full h-[60px] rounded-lg font-headline-sm transition-all active:translate-y-[2px] ${actionBtnClass(action.variant)}`}
            style={{ fontSize: 16 }}
            onClick={onAdvance}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
