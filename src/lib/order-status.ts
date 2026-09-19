import type { OrderStatus } from "@/types";

/**
 * Single source of truth for how an order status is presented.
 *
 * Previously this map was duplicated three times — in OrdersClient, the
 * dashboard page and OrderProgressBar — each with a different palette.
 *
 * The theme is monochrome, so the in-flight statuses differ by *fill weight*
 * and label rather than hue: the darker the fill, the further along the order.
 * Colour is reserved for the two states where it carries real meaning —
 * `ready` (action required) and `cancelled` (exception).
 */
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "bg-on-surface text-surface-container-lowest",
  accepted: "bg-surface-container-highest text-on-surface",
  preparing: "bg-surface-container-high text-on-surface-variant",
  ready: "bg-success-container text-on-success-container",
  served: "bg-surface-container text-on-surface-variant",
  cancelled: "bg-error-container text-on-error-container",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};
