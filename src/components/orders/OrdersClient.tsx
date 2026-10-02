"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Download, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/pricing";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS, ORDER_STATUS_ICONS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { Order, OrderItem, OrderStatus, OrderType, PaymentStatus } from "@/types";

// ---------------------------------------------------------------- types

type OrderRow = Order & { tableLabel: string | null };

type ApiResponse = {
  orders: OrderRow[];
  total: number;
  page: number;
  limit: number;
};

/** Shape of GET /api/orders/[orderId]. */
type OrderDetailResponse = {
  order: Order;
  items: OrderItem[];
};

// ---------------------------------------------------------------- helpers

const STATUS_FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "cancelled", label: "Cancelled" },
];

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  pre_order: "Pre-order",
};

const PAYMENT_STYLE: Record<PaymentStatus, { label: string; icon: string; className: string }> = {
  paid:     { label: "Paid",     icon: "check_circle", className: "bg-success-container text-on-success-container" },
  pending:  { label: "Unpaid",   icon: "schedule",     className: "bg-surface-container-high text-on-surface-variant" },
  failed:   { label: "Failed",   icon: "error",        className: "bg-error-container text-on-error-container" },
  refunded: { label: "Refunded", icon: "undo",         className: "bg-surface-container-high text-on-surface-variant" },
};

const REALTIME_DEBOUNCE_MS = 400;
const POLL_MS = 15_000;
const PAGE_LIMIT = 50;

/** Local calendar date as YYYY-MM-DD. Not `toISOString()`: that is the UTC
 *  date, which in IST is still yesterday until 5:30 AM. */
function isoDate(d: Date) {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** Quick ranges. `from` is days back from today; `to` likewise. */
const DATE_PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Yesterday", from: 1, to: 1 },
  { label: "7 days", from: 6, to: 0 },
  { label: "30 days", from: 29, to: 0 },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined shrink-0", className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        ORDER_STATUS_STYLES[status]
      )}
    >
      <Icon name={ORDER_STATUS_ICONS[status]} size={14} />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

function PaymentPill({ order }: { order: Pick<Order, "paymentStatus" | "paymentMethod"> }) {
  const style = PAYMENT_STYLE[order.paymentStatus];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", style.className)}>
      <Icon name={style.icon} size={14} />
      {style.label}
      {order.paymentMethod && (
        <span className="font-normal opacity-80">
          · {order.paymentMethod === "razorpay" ? "Online" : "Cash"}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- detail sheet

const TIMELINE: { status: OrderStatus; key: "placedAt" | "acceptedAt" | "readyAt" | "servedAt" }[] = [
  { status: "placed", key: "placedAt" },
  { status: "accepted", key: "acceptedAt" },
  { status: "ready", key: "readyAt" },
  { status: "served", key: "servedAt" },
];

function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
        <Icon name="cancel" size={18} />
        Cancelled — placed {formatDateTime(order.placedAt)}
      </div>
    );
  }

  return (
    <ol className="grid grid-cols-4 gap-1">
      {TIMELINE.map((step) => {
        const at = order[step.key];
        const done = at !== null;
        return (
          <li key={step.status} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full border",
                done
                  ? "border-brand-border bg-brand-subtle text-brand-text"
                  : "border-dashed border-outline-variant text-on-surface-variant/60"
              )}
            >
              <Icon name={done ? ORDER_STATUS_ICONS[step.status] : "radio_button_unchecked"} size={18} />
            </span>
            <span className={cn("text-xs font-semibold", done ? "text-on-surface" : "text-on-surface-variant")}>
              {ORDER_STATUS_LABELS[step.status]}
            </span>
            <span className="text-[11px] tabular-nums text-on-surface-variant">
              {at ? formatTime(at) : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderDetailSheet({
  order,
  onClose,
}: {
  order: OrderRow | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [itemsError, setItemsError] = useState(false);
  const orderId = order?.id ?? null;

  const loadItems = useCallback(async (id: string) => {
    setItems(null);
    setItemsError(false);
    try {
      // `view=staff` returns the unredacted order, scoped to this restaurant.
      const res = await fetch(`/api/orders/${id}?view=staff`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OrderDetailResponse;
      setItems(data.items);
    } catch (err) {
      console.error("[orders] failed to load order items", err);
      setItemsError(true);
    }
  }, []);

  useEffect(() => {
    if (orderId) void loadItems(orderId);
  }, [orderId, loadItems]);

  if (!order) return null;

  const billRows: { label: string; value: number }[] = [
    { label: "Subtotal", value: order.subtotal },
    { label: "Tax", value: order.taxTotal },
    { label: "Service charge", value: order.serviceCharge },
    { label: "Packing charge", value: order.packingCharge },
  ].filter((row) => row.label === "Subtotal" || row.value > 0);

  return (
    <Sheet open={order !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="space-y-2 border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="font-mono text-2xl font-bold">#{order.orderNumber}</SheetTitle>
            <StatusPill status={order.status} />
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <Icon name="table_restaurant" />
              {order.tableLabel ?? "No table"}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="restaurant" />
              {ORDER_TYPE_LABELS[order.orderType]}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="schedule" />
              {formatDateTime(order.placedAt)}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5 text-sm">
          <OrderTimeline order={order} />

          {/* Customer + payment */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Customer</p>
              <p className="mt-0.5 truncate font-medium text-on-surface">{order.customerName ?? "—"}</p>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="text-brand-text underline-offset-2 hover:underline">
                  {order.customerPhone}
                </a>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Payment</p>
              <div className="mt-1">
                <PaymentPill order={order} />
              </div>
            </div>
          </div>

          {/* Line items — snapshots from order_items, never re-priced. */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Items</p>
            {itemsError ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-error/25 bg-error-container p-3 text-on-error-container">
                <span>Couldn&apos;t load the items for this order.</span>
                <Button size="sm" variant="outline" onClick={() => void loadItems(order.id)}>
                  Retry
                </Button>
              </div>
            ) : items === null ? (
              <div className="space-y-2">
                {[1, 2].map((n) => <Skeleton key={n} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-3 p-3">
                    <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-md bg-surface-container-high px-1 font-mono text-xs font-bold text-on-surface">
                      {item.quantity}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-on-surface">
                        {item.itemName}
                        {item.variantName && (
                          <span className="font-normal text-on-surface-variant"> · {item.variantName}</span>
                        )}
                      </p>
                      {item.addons.length > 0 && (
                        <p className="text-xs text-on-surface-variant">
                          + {item.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-on-tertiary-container">
                          <Icon name="sticky_note_2" size={14} />
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-on-surface">{formatMoney(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bill */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            {billRows.map((row) => (
              <div key={row.label} className="flex justify-between py-0.5 text-on-surface-variant">
                <span>{row.label}</span>
                <span className="tabular-nums">{formatMoney(row.value)}</span>
              </div>
            ))}
            {order.discount > 0 && (
              <div className="flex justify-between py-0.5 text-on-surface-variant">
                <span>Discount</span>
                <span className="tabular-nums">−{formatMoney(order.discount)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-outline-variant pt-2 text-base font-semibold text-on-surface">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-xl bg-warning-container p-3 text-on-warning-container">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
                <Icon name="sticky_note_2" size={14} />
                Order notes
              </p>
              <p className="mt-1">{order.notes}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- main component

export function OrdersClient({ restaurantId }: { restaurantId: string }) {
  const [dateFrom, setDateFrom] = useState(() => daysAgo(0));
  const [dateTo, setDateTo] = useState(() => daysAgo(0));
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Relative times ("12m ago") would otherwise freeze at the last fetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // `silent` skips the skeleton: a background refresh triggered by Realtime
  // should not blank a table the staff member is reading.
  const fetchOrders = useCallback(async (p: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom: new Date(dateFrom + "T00:00:00").toISOString(),
        dateTo: new Date(dateTo + "T23:59:59").toISOString(),
        status,
        search,
        page: String(p),
        limit: String(PAGE_LIMIT),
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) { toast.error("Failed to load orders."); return; }
      const data = await res.json() as ApiResponse;
      setOrders(data.orders);
      setTotal(data.total);
      setLastUpdated(Date.now());
      setNow(Date.now());
    } catch (err) {
      console.error("[orders] fetch failed", err);
      if (!silent) toast.error("Couldn't reach the server. Check your connection.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dateFrom, dateTo, status, search]);

  // Fetch on filter change (debounce search)
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchOrders(1), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [dateFrom, dateTo, status, search, fetchOrders]);

  useEffect(() => { fetchOrders(page); }, [page, fetchOrders]);

  // The list is fetched client-side, so router.refresh() cannot reach it —
  // it needs its own refresh loop. Without this the only way to see an order
  // a customer had just placed was to reload the page.
  //
  // The poll is the reliable half. postgres_changes cannot reach a staff
  // screen: the browser holds the anon key and the `orders` RLS policy keys
  // off `auth.uid()`, which a signed-cookie session never sets. The
  // subscription below stays as a latency win and only nudges the same fetch.
  const refetchRef = useRef<() => void>(() => {});
  refetchRef.current = () => { void fetchOrders(page, true); };

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // One order write fires several events; collapse the burst into one fetch.
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`orders-list:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        scheduleRefetch
      )
      .subscribe();

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefetch();
    }, POLL_MS);

    // A backgrounded tab skips its polls, so catch up on the way back.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRefetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  async function exportCSV() {
    try {
      const params = new URLSearchParams({
        dateFrom: new Date(dateFrom + "T00:00:00").toISOString(),
        dateTo: new Date(dateTo + "T23:59:59").toISOString(),
        status,
        search,
        page: "1",
        limit: "9999",
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) { toast.error("Export failed."); return; }
      const data = await res.json() as ApiResponse;

      const header = "Order #,Table,Customer,Phone,Status,Payment,Total,Placed at";
      const rows = data.orders.map((o) =>
        [
          o.orderNumber,
          o.tableLabel ?? "",
          o.customerName ?? "",
          o.customerPhone ?? "",
          o.status,
          `${o.paymentStatus}/${o.paymentMethod ?? ""}`,
          o.total.toFixed(2),
          new Date(o.placedAt).toLocaleString("en-IN"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );

      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${dateFrom}-to-${dateTo}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[orders] export failed", err);
      toast.error("Export failed.");
    }
  }

  function resetFilters() {
    setDateFrom(daysAgo(0));
    setDateTo(daysAgo(0));
    setStatus("all");
    setSearch("");
    setPage(1);
  }

  const totalPages = Math.ceil(total / PAGE_LIMIT);
  const activePreset = DATE_PRESETS.find(
    (p) => dateFrom === daysAgo(p.from) && dateTo === daysAgo(p.to)
  );
  const isFiltered = status !== "all" || search !== "" || activePreset?.label !== "Today";

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
            <Input
              placeholder="Search order # or phone"
              aria-label="Search orders by number or phone"
              className="h-11 pl-9 pr-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Date range: presets for the common cases, inputs for the rest. */}
          <div role="group" aria-label="Date range presets" className="flex w-full items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1 sm:w-auto">
            {DATE_PRESETS.map((preset) => {
              const active = activePreset?.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setDateFrom(daysAgo(preset.from)); setDateTo(daysAgo(preset.to)); }}
                  className={cn(
                    "h-9 flex-1 whitespace-nowrap rounded-lg px-2 text-sm sm:px-3 font-medium transition-colors duration-fast sm:flex-none",
                    active
                      ? "bg-surface-container-lowest text-on-surface shadow-level-1"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Input
              type="date"
              aria-label="From date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-11 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            />
            <span className="text-sm text-on-surface-variant">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-11 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            />
          </div>

          <Button variant="outline" className="h-11 lg:ml-auto" onClick={exportCSV} disabled={total === 0}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
        </div>

        {/* Status filter — one tap, not a dropdown. */}
        <div
          role="radiogroup"
          aria-label="Filter by status"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
        >
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStatus(f.value)}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-fast",
                  active
                    ? "border-brand bg-brand text-brand-foreground shadow-glow"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline hover:text-on-surface"
                )}
              >
                <Icon name={f.value === "all" ? "receipt_long" : ORDER_STATUS_ICONS[f.value]} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-on-surface-variant">
        <p>
          <span className="font-semibold text-on-surface tabular-nums">{total}</span>{" "}
          order{total === 1 ? "" : "s"}
          {activePreset ? ` · ${activePreset.label.toLowerCase()}` : ` · ${dateFrom} to ${dateTo}`}
          {status !== "all" && ` · ${ORDER_STATUS_LABELS[status].toLowerCase()}`}
        </p>
        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden="true" />
          Live
          {lastUpdated && (
            <span suppressHydrationWarning>· updated {formatTime(new Date(lastUpdated).toISOString())}</span>
          )}
        </p>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
        {loading ? (
          <div className="flex flex-col gap-1 p-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Skeleton key={n} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          // An empty list needs a way out of it, not just a statement of fact.
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span
              className="grid h-14 w-14 place-items-center rounded-2xl border border-outline-variant bg-surface-container text-on-surface-variant"
              aria-hidden="true"
            >
              <Icon name={isFiltered ? "filter_alt_off" : "receipt_long"} size={28} />
            </span>
            <div className="space-y-1">
              <p className="font-display text-title text-on-surface">
                {isFiltered ? "No orders match these filters" : "No orders yet today"}
              </p>
              <p className="measure-sm text-sm text-on-surface-variant">
                {isFiltered
                  ? "Try a wider date range or a different status."
                  : "Orders appear here the moment a guest checks out — this list refreshes on its own."}
              </p>
            </div>
            {isFiltered && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset to today
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Phones and tablets: a card per order. The table needs the width
                that remains beside the sidebar only from lg upward. */}
            <ul className="divide-y divide-outline-variant lg:hidden">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(order)}
                    className="flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-low"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-on-surface">#{order.orderNumber}</span>
                        <StatusPill status={order.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-on-surface-variant">
                        {order.tableLabel ?? ORDER_TYPE_LABELS[order.orderType]}
                        {" · "}
                        {order.customerName ?? order.customerPhone ?? "Guest"}
                        {" · "}
                        {timeAgo(order.placedAt, now)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-on-surface">{formatMoney(order.total)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Payment</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Placed</th>
                  <th className="w-10 px-2 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    className="group cursor-pointer border-b border-outline-variant transition-colors last:border-0 hover:bg-surface-container-low focus-visible:bg-surface-container-low focus-visible:outline-none"
                    onClick={() => setDetail(order)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(order); }
                    }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-on-surface">#{order.orderNumber}</p>
                      <p className="text-xs text-on-surface-variant">{ORDER_TYPE_LABELS[order.orderType]}</p>
                    </td>
                    <td className="px-4 py-3">
                      {order.tableLabel ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface-container px-2 py-0.5 font-medium text-on-surface">
                          <Icon name="table_restaurant" size={14} />
                          {order.tableLabel}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="truncate font-medium text-on-surface">{order.customerName ?? "Guest"}</p>
                      {order.customerPhone && (
                        <p className="truncate text-xs text-on-surface-variant">{order.customerPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={order.status} />
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <PaymentPill order={order} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-on-surface">
                      {formatMoney(order.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="whitespace-nowrap tabular-nums text-on-surface">{formatTime(order.placedAt)}</p>
                      <p className="whitespace-nowrap text-xs text-on-surface-variant">{timeAgo(order.placedAt, now)}</p>
                    </td>
                    <td className="px-2 py-3 text-on-surface-variant">
                      <ChevronRight className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <OrderDetailSheet order={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
