"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order, OrderStatus } from "@/types";

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

const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: "bg-blue-100 text-blue-700",
  accepted: "bg-yellow-100 text-yellow-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  served: "bg-stone-100 text-stone-600",
  cancelled: "bg-red-100 text-red-600",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "New", accepted: "Accepted", preparing: "Preparing",
  ready: "Ready", served: "Served", cancelled: "Cancelled",
};

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
          <div className="grid grid-cols-2 gap-2 text-stone-600">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Table</p>
              <p className="font-medium">{order.tableLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Status</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Customer</p>
              <p className="font-medium">{order.customerName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Phone</p>
              <p className="font-medium">{order.customerPhone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Placed at</p>
              <p className="font-medium">
                {new Date(order.placedAt).toLocaleString("en-IN", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Payment</p>
              <p className="font-medium capitalize">{order.paymentStatus} / {order.paymentMethod ?? "—"}</p>
            </div>
          </div>

          {/* Bill */}
          <div className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span><span>₹{fmt(order.subtotal)}</span>
            </div>
            {order.taxTotal > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Tax</span><span>₹{fmt(order.taxTotal)}</span>
              </div>
            )}
            {order.serviceCharge > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Service charge</span><span>₹{fmt(order.serviceCharge)}</span>
              </div>
            )}
            {order.packingCharge > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Packing charge</span><span>₹{fmt(order.packingCharge)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-semibold text-stone-800">
              <span>Total</span><span>₹{fmt(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Notes</p>
              <p className="mt-1">{order.notes}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- main component

export function OrdersClient() {
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

  const fetchOrders = useCallback(async (p: number) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [dateFrom, dateTo, status, search]);

  // Fetch on filter change (debounce search)
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchOrders(1), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [dateFrom, dateTo, status, search, fetchOrders]);

  useEffect(() => { fetchOrders(page); }, [page, fetchOrders]);

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
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
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
        <span className="text-stone-400 text-sm">to</span>
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

        <span className="ml-auto text-xs text-stone-400">{total} orders</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex flex-col gap-1 p-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Skeleton key={n} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-center text-sm text-stone-400">
            No orders match the selected filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
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
                  className="cursor-pointer border-b border-stone-50 last:border-0 hover:bg-stone-50"
                  onClick={() => setDetail(order)}
                >
                  <td className="px-4 py-3 font-medium text-stone-800">
                    #{order.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{order.tableLabel ?? "—"}</td>
                  <td className="px-4 py-3 text-stone-500 hidden sm:table-cell">
                    {order.customerName ?? order.customerPhone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-stone-700">
                    ₹{fmt(order.total)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-400 hidden md:table-cell">
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
          <span className="text-stone-500">
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
