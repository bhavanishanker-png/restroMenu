"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS } from "@/lib/order-status";
import type { Order } from "@/types";

// ---------------------------------------------------------------- types

type OrderRow = Order & { tableLabel: string | null };

type ApiResponse = {
  orders: OrderRow[];
  total: number;
  page: number;
  limit: number;
};

// ---------------------------------------------------------------- helpers

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "placed", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS = ORDER_STATUS_STYLES;
const STATUS_LABELS = ORDER_STATUS_LABELS;

const REALTIME_DEBOUNCE_MS = 400;
const POLL_MS = 15_000;

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- detail sheet

function OrderDetailSheet({
  order,
  onClose,
}: {
  order: OrderRow | null;
  onClose: () => void;
}) {
  if (!order) return null;

  return (
    <Sheet open={order !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Order #{order.orderNumber}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4 text-sm">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-on-surface-variant">
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Table</p>
              <p className="font-medium">{order.tableLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Status</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Customer</p>
              <p className="font-medium">{order.customerName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Phone</p>
              <p className="font-medium">{order.customerPhone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Placed at</p>
              <p className="font-medium">
                {new Date(order.placedAt).toLocaleString("en-IN", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Payment</p>
              <p className="font-medium capitalize">{order.paymentStatus} / {order.paymentMethod ?? "—"}</p>
            </div>
          </div>

          {/* Bill */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal</span><span>₹{fmt(order.subtotal)}</span>
            </div>
            {order.taxTotal > 0 && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Tax</span><span>₹{fmt(order.taxTotal)}</span>
              </div>
            )}
            {order.serviceCharge > 0 && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Service charge</span><span>₹{fmt(order.serviceCharge)}</span>
              </div>
            )}
            {order.packingCharge > 0 && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Packing charge</span><span>₹{fmt(order.packingCharge)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-outline-variant pt-2 font-semibold text-on-surface">
              <span>Total</span><span>₹{fmt(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-lg bg-warning-container p-3 text-sm text-on-warning-container">
              <p className="text-xs font-medium uppercase tracking-wide text-on-warning-container">Notes</p>
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
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(isoDate(today));
  const [dateTo, setDateTo] = useState(isoDate(today));
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<OrderRow | null>(null);

  const limit = 50;

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
        limit: String(limit),
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) { toast.error("Failed to load orders."); return; }
      const data = await res.json() as ApiResponse;
      setOrders(data.orders);
      setTotal(data.total);
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
    } catch {
      toast.error("Export failed.");
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-on-surface-variant" />
          <Input
            placeholder="Order # or phone…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-36"
        />
        <span className="text-on-surface-variant text-sm">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-36"
        />

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={exportCSV} disabled={total === 0}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>

        <span className="ml-auto text-xs text-on-surface-variant">{total} orders</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {loading ? (
          <div className="flex flex-col gap-1 p-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Skeleton key={n} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          // An empty list needs a way out of it, not just a statement of fact.
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span
              className="grid h-12 w-12 place-items-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant"
              aria-hidden="true"
            >
              <Search className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <p className="font-display text-title text-on-surface">No orders here</p>
              <p className="measure-sm text-sm text-on-surface-variant">
                Nothing matches the current date range and status. Orders placed
                today appear the moment a guest checks out.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom(isoDate(today));
                setDateTo(isoDate(today));
                setStatus("all");
                setSearch("");
                setPage(1);
              }}
            >
              Reset to today
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Table</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Customer</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                  onClick={() => setDetail(order)}
                >
                  <td className="px-4 py-3 font-medium text-on-surface">
                    #{order.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{order.tableLabel ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">
                    {order.customerName ?? order.customerPhone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-on-surface">
                    ₹{fmt(order.total)}
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface-variant hidden md:table-cell">
                    {new Date(order.placedAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
