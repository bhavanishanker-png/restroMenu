"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ServiceRequest, ServiceRequestType } from "@/types";
import type { FloorBoard, FloorOrder, FloorTable } from "@/lib/queries/floor";

type Props = {
  restaurantId: string;
  initial: FloorBoard;
};

const POLL_MS = 30_000;
const REALTIME_DEBOUNCE_MS = 300;

const REQUEST_META: Record<ServiceRequestType, { label: string; icon: string }> = {
  waiter: { label: "Waiter", icon: "room_service" },
  water: { label: "Water", icon: "water_drop" },
  bill: { label: "Bill", icon: "receipt_long" },
};

const STATUS_META: Record<FloorOrder["status"], { label: string; className: string }> = {
  placed: { label: "New", className: "bg-brand-subtle text-brand-text" },
  accepted: { label: "Accepted", className: "bg-surface-container-high text-on-surface" },
  preparing: { label: "Preparing", className: "bg-surface-container-high text-on-surface" },
  ready: { label: "Ready", className: "bg-success/15 text-success" },
};

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function FloorView({ restaurantId, initial }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [tables, setTables] = useState<FloorTable[]>(initial.tables);
  const [orders, setOrders] = useState<FloorOrder[]>(initial.orders);
  const [requests, setRequests] = useState<ServiceRequest[]>(initial.serviceRequests);
  const [now, setNow] = useState(() => Date.now());

  // Discard a board response that lands after a local resolve, so it can't
  // resurrect a request the user just cleared.
  const mutationSeqRef = useRef(0);

  // ---- 1s clock for elapsed times ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- board sync: broadcast-driven, slow poll as safety net ----
  // Same transport as the kitchen display (ADR 0007): the server broadcasts a
  // "board_changed" nudge on order/service-request changes; we refetch through
  // the authorized server route. The poll only covers a dropped broadcast.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

    async function sync(): Promise<void> {
      if (cancelled) return;
      const seq = mutationSeqRef.current;
      try {
        const res = await fetch("/api/floor/board", { cache: "no-store" });
        if (!res.ok || cancelled || mutationSeqRef.current !== seq) return;
        const board = (await res.json()) as FloorBoard;
        if (cancelled || mutationSeqRef.current !== seq) return;
        setTables(board.tables);
        setOrders(board.orders);
        setRequests(board.serviceRequests);
      } catch {
        // transient — the next nudge or poll retries
      }
    }

    function scheduleNudge(): void {
      if (nudgeTimer) clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => void sync(), REALTIME_DEBOUNCE_MS);
    }

    async function tick(): Promise<void> {
      await sync();
      if (!cancelled) pollTimer = setTimeout(() => void tick(), POLL_MS);
    }
    pollTimer = setTimeout(() => void tick(), POLL_MS);

    const channel = supabase
      .channel(`kitchen:${restaurantId}`)
      .on("broadcast", { event: "board_changed" }, scheduleNudge)
      .subscribe();

    const onVisible = () => { if (document.visibilityState === "visible") scheduleNudge(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", scheduleNudge);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (nudgeTimer) clearTimeout(nudgeTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", scheduleNudge);
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId]);

  async function resolveRequest(id: string): Promise<void> {
    mutationSeqRef.current += 1;
    const previous = requests;
    setRequests((rs) => rs.filter((r) => r.id !== id)); // optimistic
    try {
      const res = await fetch("/api/service-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok && res.status !== 404) {
        setRequests(previous); // roll back
        toast.error("Couldn't clear the request. Try again.");
      }
    } catch {
      setRequests(previous);
      toast.error("Couldn't reach the server. Try again.");
    }
  }

  // Pivot flat lists into per-table views. The first active order per table is
  // the newest (the query ordered by placed_at desc).
  const orderByTable = useMemo(() => {
    const m = new Map<string, FloorOrder>();
    for (const o of orders) {
      if (o.tableId && !m.has(o.tableId)) m.set(o.tableId, o);
    }
    return m;
  }, [orders]);

  const requestsByTable = useMemo(() => {
    const m = new Map<string, ServiceRequest[]>();
    for (const r of requests) {
      const list = m.get(r.tableId) ?? [];
      list.push(r);
      m.set(r.tableId, list);
    }
    return m;
  }, [requests]);

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-margin-mobile py-xl text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full border border-outline-variant bg-surface-container" aria-hidden="true">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 32 }}>table_restaurant</span>
        </div>
        <div className="space-y-1">
          <p className="font-display text-headline-sm text-on-surface">No tables yet</p>
          <p className="measure-sm text-body-sm text-on-surface-variant">Add tables to see them on the floor.</p>
        </div>
        <Link href="/dashboard/tables" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">add</span>
          Set up tables
        </Link>
      </div>
    );
  }

  const openRequestCount = requests.length;

  return (
    <div className="px-margin-mobile pb-8 pt-2">
      <div className="mb-3 flex items-center gap-2 text-body-sm text-on-surface-variant" aria-live="polite">
        <span className={cn("inline-block h-2 w-2 rounded-full", openRequestCount > 0 ? "bg-brand animate-pulse" : "bg-outline")} aria-hidden="true" />
        {openRequestCount > 0
          ? `${openRequestCount} open request${openRequestCount === 1 ? "" : "s"} on the floor`
          : "No open requests"}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => {
          const order = orderByTable.get(table.id) ?? null;
          const tableRequests = requestsByTable.get(table.id) ?? [];
          const elapsed = order ? minutesSince(order.placedAt, now) : 0;
          const hasRequest = tableRequests.length > 0;

          const border = hasRequest
            ? "border-brand ring-2 ring-brand/30"
            : order && elapsed >= 25
              ? "border-error"
              : order && elapsed >= 15
                ? "border-warning"
                : "border-outline-variant";

          return (
            <li
              key={table.id}
              className={cn(
                "flex min-h-[132px] flex-col rounded-2xl border bg-surface-container-lowest p-3 shadow-level-1 transition-colors",
                border
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-title text-on-surface">{table.label}</span>
                {table.seats > 0 && (
                  <span className="flex items-center gap-0.5 text-body-xs text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">group</span>
                    {table.seats}
                  </span>
                )}
              </div>

              {order ? (
                <div className="mt-2 space-y-1">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-body-xs font-semibold", STATUS_META[order.status].className)}>
                    {STATUS_META[order.status].label}
                  </span>
                  <p className="tabular text-body-xs text-on-surface-variant">
                    {order.orderNumber} · {elapsed} min
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-body-xs text-on-surface-variant">No active order</p>
              )}

              {hasRequest && (
                <ul className="mt-auto flex flex-col gap-1 pt-2">
                  {tableRequests.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => void resolveRequest(r.id)}
                        className="flex min-h-[36px] w-full items-center gap-1.5 rounded-lg bg-brand-subtle px-2 text-left text-body-xs font-semibold text-brand-text transition-colors hover:bg-brand/20"
                        aria-label={`Clear ${REQUEST_META[r.type].label} request for ${table.label}`}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">{REQUEST_META[r.type].icon}</span>
                        <span className="flex-1">{REQUEST_META[r.type].label}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">check</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
