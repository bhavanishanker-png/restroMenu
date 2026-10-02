import Link from "next/link";
import { formatMoney } from "@/lib/pricing";
import { dayKeyInZone } from "@/lib/restaurant-time";
import {
  ORDER_STATUS_ICONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

export type RecentOrder = Order & { tableLabel: string | null };

function whereLabel(order: RecentOrder): { icon: string; text: string } {
  if (order.tableLabel) return { icon: "table_restaurant", text: order.tableLabel };
  if (order.orderType === "pre_order") return { icon: "schedule", text: "Pre-order" };
  return { icon: "takeout_dining", text: "Takeaway" };
}

/**
 * Time only for today's orders; older ones carry their date too. Rendered on
 * the server, so both "today" and the clock time use the restaurant's zone —
 * the server's own zone is usually UTC.
 */
function formatPlacedAt(iso: string, timezone: string): string {
  const placed = new Date(iso);
  const time = placed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  if (dayKeyInZone(placed, timezone) === dayKeyInZone(new Date(), timezone)) return time;
  return `${placed.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: timezone })}, ${time}`;
}

function StatusPill({ status }: { status: Order["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        ORDER_STATUS_STYLES[status]
      )}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
        {ORDER_STATUS_ICONS[status]}
      </span>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

type Props = {
  orders: RecentOrder[];
  /** IANA zone of the restaurant (restaurants.timezone). */
  timezone: string;
  canManage: boolean;
  /** True when the query failed — the list is unknown, not empty. */
  failed: boolean;
};

export function RecentOrders({ orders, timezone, canManage, failed }: Props) {
  return (
    <section
      aria-labelledby="recent-orders-heading"
      className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1"
    >
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 id="recent-orders-heading" className="font-display text-[16px] font-semibold text-on-surface">
            Recent orders
          </h2>
          <p className="text-body-sm text-on-surface-variant">Latest 10, newest first</p>
        </div>
        <Link
          href="/dashboard/orders"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl px-3 font-label-bold text-label-bold text-brand-text transition-colors hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View all
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>

      {failed ? (
        <div className="flex items-start gap-3 px-4 py-6 text-on-error-container md:px-5" role="alert">
          <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
            error
          </span>
          <p className="text-body-sm">
            Recent orders couldn&apos;t be loaded. They will retry on the next refresh, or open{" "}
            <Link href="/dashboard/orders" className="font-semibold underline underline-offset-2">
              Orders
            </Link>
            .
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-outline-variant bg-surface-container-low text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 28 }} aria-hidden="true">
              receipt_long
            </span>
          </span>
          <div>
            <p className="font-display text-[16px] font-semibold text-on-surface">No orders yet</p>
            <p className="mt-1 max-w-xs text-body-sm text-on-surface-variant">
              {canManage
                ? "Orders appear here the moment a guest scans a table QR code and checks out."
                : "Orders appear here as guests place them. The kitchen display shows them live."}
            </p>
          </div>
          <Link
            href={canManage ? "/dashboard/tables" : "/dashboard/kitchen"}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground shadow-level-1 transition-shadow hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
              {canManage ? "qr_code_scanner" : "display_settings"}
            </span>
            {canManage ? "Print table QR codes" : "Open kitchen display"}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {orders.map((order) => {
            const where = whereLabel(order);
            return (
              <li key={order.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container-low text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
                    {where.icon}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[15px] font-bold tabular-nums text-on-surface">
                    #{order.orderNumber}
                  </p>
                  <p className="text-body-sm tabular-nums text-on-surface-variant">
                    {where.text} · {formatPlacedAt(order.placedAt, timezone)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-4">
                  <span className="font-semibold tabular-nums text-on-surface sm:w-24 sm:text-right">
                    {formatMoney(order.total)}
                  </span>
                  <StatusPill status={order.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
