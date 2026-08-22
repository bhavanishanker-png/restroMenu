"use client";

import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { KitchenOrder } from "./types";
import type { OrderStatus } from "@/types";

type Props = {
  order: KitchenOrder;
  now: number;
  isNew: boolean;
  onAdvance: () => void;
  onCancel: () => void;
};

const ACTION_MAP: Partial<Record<OrderStatus, { label: string }>> = {
  placed:    { label: "Accept" },
  accepted:  { label: "Start preparing" },
  preparing: { label: "Mark ready" },
  ready:     { label: "Mark served" },
};

function elapsedMinutes(placedAt: string, now: number): number {
  return Math.floor((now - new Date(placedAt).getTime()) / 60_000);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function urgencyClasses(elapsed: number): { border: string; header: string } {
  if (elapsed >= 25) return { border: "border-red-400", header: "bg-red-50" };
  if (elapsed >= 15) return { border: "border-amber-400", header: "bg-amber-50" };
  return { border: "border-stone-200", header: "bg-stone-50" };
}

export function OrderCard({ order, now, isNew, onAdvance, onCancel }: Props) {
  const elapsed = elapsedMinutes(order.placedAt, now);
  const { border, header } = urgencyClasses(elapsed);
  const action = ACTION_MAP[order.status];

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-sm overflow-hidden ${border} ${
        isNew ? "animate-slide-in ring-2 ring-[#C2410C] ring-offset-1" : ""
      }`}
    >
      {/* Card header */}
      <div className={`flex items-center justify-between px-3 py-2 ${header}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] font-bold leading-none text-stone-900">
            #{order.orderNumber}
          </span>
          {order.tableLabel && (
            <span className="text-[20px] font-medium text-stone-600">
              {order.tableLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold tabular-nums ${
              elapsed >= 25
                ? "text-red-600"
                : elapsed >= 15
                ? "text-amber-700"
                : "text-stone-500"
            }`}
          >
            {formatElapsed(elapsed)}
          </span>

          {/* Cancel overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-600"
                aria-label="Order options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={onCancel}
              >
                Cancel order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Items */}
      <div className="px-3 py-2 text-[18px] leading-snug">
        {order.items.map((item) => (
          <div key={item.id} className="mb-2 last:mb-0">
            <p className="font-medium text-stone-800">
              <span className="text-stone-500">{item.quantity}×</span>{" "}
              {item.itemName}
              {item.variantName && (
                <span className="text-[15px] text-stone-500">
                  {" "}
                  ({item.variantName})
                </span>
              )}
            </p>

            {item.addons.length > 0 && (
              <p className="ml-4 text-[15px] text-stone-500">
                + {item.addons.map((a) => a.name).join(", ")}
              </p>
            )}

            {item.notes && (
              <p className="ml-4 rounded bg-amber-100 px-1 text-[15px] font-medium text-amber-800">
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Action button */}
      {action && (
        <div className="px-3 pb-3">
          <Button
            className="h-[60px] w-full text-base font-semibold"
            onClick={onAdvance}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
