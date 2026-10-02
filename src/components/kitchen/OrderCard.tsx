"use client";

import type { KitchenOrder } from "./types";
import type { OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  order: KitchenOrder;
  now: number;
  isNew: boolean;
  onAdvance: () => void;
  onCancel: () => void;
};

type ActionConfig = {
  label: string;
  icon: string;
  variant: "primary" | "outlined" | "secondary";
};

const ACTION_MAP: Partial<Record<OrderStatus, ActionConfig>> = {
  placed:    { label: "Accept",          icon: "check",                  variant: "primary"   },
  accepted:  { label: "Start Preparing", icon: "local_fire_department",  variant: "primary"   },
  preparing: { label: "Mark Ready",      icon: "room_service",           variant: "outlined"  },
  ready:     { label: "Mark Served",     icon: "done_all",               variant: "secondary" },
};

/** Accepted and preparing share a column, so the card names which it is. */
const STAGE_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "Accepted",
  preparing: "Cooking",
};

export const AMBER_AFTER_MIN = 15;
export const RED_AFTER_MIN = 25;

export function elapsedMinutes(placedAt: string, now: number): number {
  return Math.floor((now - new Date(placedAt).getTime()) / 60_000);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type Urgency = "normal" | "amber" | "red";

function urgencyOf(elapsed: number): Urgency {
  if (elapsed >= RED_AFTER_MIN) return "red";
  if (elapsed >= AMBER_AFTER_MIN) return "amber";
  return "normal";
}

// Urgency escalates on three axes — border colour, border weight and the
// wording in the timer pill — so it reads from three feet away and never
// depends on colour alone.
const URGENCY_STYLE: Record<
  Urgency,
  { card: string; header: string; pill: string; icon: string; label: string | null }
> = {
  normal: {
    card: "border-outline-variant",
    header: "bg-surface-container",
    pill: "bg-surface-container-high text-on-surface",
    icon: "schedule",
    label: null,
  },
  amber: {
    card: "border-warning border-[3px]",
    header: "bg-warning-container/60",
    pill: "bg-warning-container text-on-warning-container",
    icon: "timer",
    label: "Slow",
  },
  red: {
    card: "border-error border-4",
    header: "bg-error-container/60",
    pill: "bg-error text-on-error animate-pulse",
    icon: "priority_high",
    label: "Late",
  },
};

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
  const stage = STAGE_LABEL[order.status];

  if (order.status === "served") {
    return (
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 opacity-75 transition-opacity hover:opacity-100">
        <span className="flex items-baseline gap-2">
          <span className="font-mono font-bold text-on-surface-variant line-through" style={{ fontSize: 18 }}>
            #{order.orderNumber}
          </span>
          {order.tableLabel && (
            <span className="text-on-surface-variant" style={{ fontSize: 15 }}>
              {order.tableLabel}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-success" style={{ fontSize: 15 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            done_all
          </span>
          Served
        </span>
      </div>
    );
  }

  const urgency = URGENCY_STYLE[urgencyOf(elapsed)];
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      className={cn(
        // shrink-0: the column is a scrolling flex container, and a card that
        // is allowed to shrink gets its action button clipped off instead of
        // the column scrolling.
        "shrink-0 overflow-hidden rounded-2xl border-2 bg-surface-container-lowest shadow-level-1",
        urgency.card,
        isNew && "animate-slide-in ring-4 ring-brand/60 ring-offset-2 ring-offset-surface-container-low"
      )}
    >
      {/* Card header */}
      <div className={cn("border-b border-outline-variant px-3 py-2.5", urgency.header)}>
        {/* Wraps rather than truncates: on a narrow column the timer drops
            below the order number instead of clipping it. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono font-bold leading-none text-on-surface" style={{ fontSize: 32 }}>
            #{order.orderNumber}
          </p>
          <span
            className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-bold tabular-nums", urgency.pill)}
            style={{ fontSize: 16 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
              {urgency.icon}
            </span>
            {urgency.label && <span>{urgency.label} ·</span>}
            {formatElapsed(elapsed)}
          </span>
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-on-surface-variant" style={{ fontSize: 16 }}>
          {order.tableLabel && (
            <span className="flex items-center gap-1 font-semibold text-on-surface">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
                table_restaurant
              </span>
              {order.tableLabel}
            </span>
          )}
          <span>
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          {stage && (
            <span className="rounded-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-[13px] font-bold uppercase tracking-wide text-on-surface">
              {stage}
            </span>
          )}
        </p>
      </div>

      {/* Items */}
      <ul className="space-y-2.5 px-3 py-3" style={{ fontSize: 18 }}>
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-2.5">
            <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-surface-container-high px-1.5 font-mono font-bold text-on-surface" style={{ fontSize: 17 }}>
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-bold leading-snug text-on-surface">
                {item.itemName}
                {item.variantName && (
                  <span className="font-normal text-on-surface-variant" style={{ fontSize: 16 }}>
                    {" "}· {item.variantName}
                  </span>
                )}
              </p>

              {item.addons.length > 0 && (
                <p className="text-on-surface-variant" style={{ fontSize: 16 }}>
                  + {item.addons.map((a) => a.name).join(", ")}
                </p>
              )}

              {item.notes && (
                <p
                  className="mt-1 flex items-start gap-1.5 rounded-lg bg-tertiary-container px-2 py-1 font-semibold text-on-tertiary-container"
                  style={{ fontSize: 16 }}
                >
                  <span className="material-symbols-outlined mt-px" style={{ fontSize: 18 }} aria-hidden="true">
                    sticky_note_2
                  </span>
                  {item.notes}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Action button */}
      {action && (
        <div className="px-3 pb-3">
          <button
            type="button"
            className={cn(
              "flex h-[60px] w-full items-center justify-center gap-2 rounded-xl font-headline-sm transition-all active:translate-y-[2px]",
              actionBtnClass(action.variant)
            )}
            style={{ fontSize: 18 }}
            onClick={onAdvance}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden="true">
              {action.icon}
            </span>
            {action.label}
          </button>
        </div>
      )}
    </article>
  );
}
