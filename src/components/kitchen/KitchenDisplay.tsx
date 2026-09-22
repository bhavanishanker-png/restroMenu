"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus, ServiceRequest, ServiceRequestType } from "@/types";
import type { KitchenOrder, PendingChange } from "./types";
import { KitchenHeader } from "./KitchenHeader";
import { OrderCard } from "./OrderCard";

// ---------------------------------------------------------------- localStorage queue

const QUEUE_KEY = "qbite-kitchen-queue";

function loadQueue(): PendingChange[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as PendingChange[];
  } catch {
    return [];
  }
}

function saveQueue(q: PendingChange[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

// ---------------------------------------------------------------- column config

type Column = {
  title: string;
  statuses: OrderStatus[];
  order: "asc" | "desc";
};

const COLUMNS: Column[] = [
  { title: "New",       statuses: ["placed"],               order: "desc" },
  { title: "Preparing", statuses: ["accepted", "preparing"], order: "asc"  },
  { title: "Ready",     statuses: ["ready"],                 order: "asc"  },
  { title: "Served",    statuses: ["served"],                order: "desc" },
];

type ColumnBadge = {
  bg: string;
  text: string;
};

// New is the loudest (inverted fill), Ready carries the success hue because it
// is the one column that demands someone walk over — matching the `ready`
// treatment in lib/order-status.ts. The rest differ by fill weight alone.
const COLUMN_BADGE: Record<string, ColumnBadge> = {
  New:       { bg: "bg-primary",                    text: "text-on-primary"             },
  Preparing: { bg: "bg-surface-container-highest",  text: "text-on-surface"             },
  Ready:     { bg: "bg-success-container",          text: "text-on-success-container"   },
  Served:    { bg: "bg-surface-container-high",     text: "text-on-surface-variant"     },
};

function columnOrders(all: KitchenOrder[], col: Column): KitchenOrder[] {
  const filtered = all.filter((o) => col.statuses.includes(o.status));
  if (col.order === "asc") {
    return [...filtered].sort(
      (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
    );
  }
  return filtered;
}

// ---------------------------------------------------------------- service request labels

const REQUEST_LABELS: Record<ServiceRequestType, { icon: string; label: string }> = {
  waiter: { icon: "support_agent", label: "Call Waiter" },
  water:  { icon: "water_drop",    label: "Water" },
  bill:   { icon: "receipt_long",  label: "Bill" },
};

// ---------------------------------------------------------------- chime

function buildChime(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
}

// ---------------------------------------------------------------- props

type Props = {
  restaurantId: string;
  restaurantName: string;
  initialOrders: KitchenOrder[];
  initialServiceRequests: ServiceRequest[];
};

/** Shape of GET /api/kitchen/board. Declared here so this client component
 *  never reaches into the server-only query module. */
type BoardResponse = {
  orders: KitchenOrder[];
  serviceRequests: ServiceRequest[];
};

const POLL_MS = 8_000;
const REALTIME_DEBOUNCE_MS = 300;

/**
 * Server rows win, except for orders whose change is still sitting in the
 * offline queue: the server has not heard about those yet, so taking its
 * status would visibly undo the tap the cook just made.
 */
function mergeOrders(
  incoming: KitchenOrder[],
  queued: PendingChange[]
): KitchenOrder[] {
  if (queued.length === 0) return incoming;
  const pending = new Map(queued.map((c) => [c.orderId, c.newStatus]));
  return incoming.map((o) => {
    const status = pending.get(o.id);
    return status ? { ...o, status } : o;
  });
}

// ---------------------------------------------------------------- component

export function KitchenDisplay({
  restaurantId,
  restaurantName,
  initialOrders,
  initialServiceRequests,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [now, setNow] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<PendingChange[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [serviceRequests, setServiceRequests] =
    useState<ServiceRequest[]>(initialServiceRequests);
  const [servicesPanelOpen, setServicesPanelOpen] = useState(false);

  const isOnlineRef = useRef(isOnline);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const queueRef = useRef(queue);

  // Orders already on screen. Seeded from the server render so the first poll
  // does not chime for the whole board.
  const seenOrderIdsRef = useRef<Set<string>>(
    new Set(initialOrders.map((o) => o.id))
  );

  // Bumped by every local status change. A poll whose response comes back
  // against a stale sequence is discarded rather than allowed to overwrite it.
  const mutationSeqRef = useRef(0);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // ---- 1s timer ----
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Wake Lock ----
  useEffect(() => {
    type WL = { release: () => Promise<void> };
    let wl: WL | null = null;

    async function acquire() {
      if (!("wakeLock" in navigator)) return;
      try {
        wl = await (
          navigator as unknown as {
            wakeLock: { request: (t: "screen") => Promise<WL> };
          }
        ).wakeLock.request("screen");
      } catch { /* not supported or tab hidden */ }
    }

    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wl?.release().catch(() => {});
    };
  }, []);

  // ---- Load queue from localStorage ----
  useEffect(() => {
    setQueue(loadQueue());
    setIsOnline(navigator.onLine);
  }, []);

  // ---- Online / offline listeners + queue flush ----
  useEffect(() => {
    async function flush(q: PendingChange[]): Promise<PendingChange[]> {
      const remaining: PendingChange[] = [];
      for (const change of q) {
        try {
          const res = await fetch(`/api/orders/${change.orderId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: change.newStatus }),
          });
          if (!res.ok && res.status !== 409 && res.status !== 404) {
            remaining.push(change);
          }
        } catch {
          remaining.push(change);
        }
      }
      return remaining;
    }

    async function goOnline() {
      setIsOnline(true);
      const q = loadQueue();
      if (q.length === 0) return;
      const leftover = await flush(q);
      saveQueue(leftover);
      setQueue(leftover);
      if (leftover.length === 0) {
        toast.success("Back online — all changes synced.");
      } else {
        toast.error(`${leftover.length} change(s) failed to sync.`);
      }
    }

    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ---- Board sync ----
  //
  // Polling is the transport that actually works here. The browser holds the
  // anon key, and the `orders` RLS policy resolves staff through `auth.uid()`
  // — which a signed-cookie session never sets — so `postgres_changes`
  // delivers nothing to this screen and the board silently froze at whatever
  // the server rendered. /api/kitchen/board reads with the service role and
  // scopes to the caller's own restaurant.
  //
  // The Realtime subscription is kept as a latency win: when it does fire it
  // only nudges the same poll, so it can never be the sole path to a refresh.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

    function announce(incoming: KitchenOrder[]): void {
      const seen = seenOrderIdsRef.current;
      const arrivals = incoming.filter((o) => !seen.has(o.id));
      for (const o of incoming) seen.add(o.id);
      if (arrivals.length === 0) return;

      const arrivalIds = arrivals.map((o) => o.id);
      setNewIds((prev) => new Set([...Array.from(prev), ...arrivalIds]));

      if (soundEnabledRef.current && audioCtxRef.current) {
        try { buildChime(audioCtxRef.current); } catch { /* audio blocked */ }
      }

      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const id of arrivalIds) next.delete(id);
          return next;
        });
      }, 1500);
    }

    async function sync(): Promise<void> {
      if (cancelled || !isOnlineRef.current) return;

      // A response that lands after a local tap must not roll it back.
      const seq = mutationSeqRef.current;

      try {
        const res = await fetch("/api/kitchen/board", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const board = (await res.json()) as BoardResponse;
        if (cancelled || mutationSeqRef.current !== seq) return;

        setOrders(mergeOrders(board.orders, queueRef.current));
        setServiceRequests(board.serviceRequests);
        announce(board.orders);
      } catch {
        // Offline or a transient failure — the next tick retries. The offline
        // banner already tells the cook what is going on.
      }
    }

    function scheduleNudge(): void {
      if (nudgeTimer) clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => { void sync(); }, REALTIME_DEBOUNCE_MS);
    }

    async function tick(): Promise<void> {
      await sync();
      if (!cancelled) pollTimer = setTimeout(() => { void tick(); }, POLL_MS);
    }

    pollTimer = setTimeout(() => { void tick(); }, POLL_MS);

    const channel = supabase
      .channel(`kitchen:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        scheduleNudge
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        scheduleNudge
      )
      .subscribe();

    // A tablet that has been asleep is the most likely thing to be stale.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleNudge();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", scheduleNudge);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (nudgeTimer) clearTimeout(nudgeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", scheduleNudge);
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId]);

  // ---- Sound toggle ----
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next && !audioCtxRef.current) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        ctx.resume().catch(() => {});
      }
      return next;
    });
  }, []);

  // ---- Resolve service request ----
  const handleResolveRequest = useCallback(async (id: string) => {
    // Optimistic remove
    mutationSeqRef.current++;
    setServiceRequests((prev) => prev.filter((r) => r.id !== id));

    const res = await fetch("/api/service-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      toast.error("Failed to resolve request.");
    }
  }, []);

  // ---- Advance status ----
  const handleAdvance = useCallback(async (order: KitchenOrder) => {
    const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
      placed: "accepted",
      accepted: "preparing",
      preparing: "ready",
      ready: "served",
    };
    const newStatus = NEXT[order.status];
    if (!newStatus) return;

    const prevStatus = order.status;

    mutationSeqRef.current++;
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
    );

    if (!isOnlineRef.current) {
      setQueue((prev) => {
        const updated = [...prev, { orderId: order.id, newStatus, prevStatus }];
        saveQueue(updated);
        return updated;
      });
      return;
    }

    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o))
        );
        toast.error("Failed to update order. Try again.");
      }
    } catch {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o))
      );
      setQueue((prev) => {
        const updated = [...prev, { orderId: order.id, newStatus, prevStatus }];
        saveQueue(updated);
        return updated;
      });
    }
  }, []);

  // ---- Cancel order ----
  const handleCancel = useCallback(async (order: KitchenOrder) => {
    if (order.status === "served" || order.status === "cancelled") return;

    const prevStatus = order.status;

    mutationSeqRef.current++;
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o))
    );

    if (!isOnlineRef.current) {
      setQueue((prev) => {
        const updated = [
          ...prev,
          { orderId: order.id, newStatus: "cancelled" as OrderStatus, prevStatus },
        ];
        saveQueue(updated);
        return updated;
      });
      return;
    }

    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o))
        );
        toast.error("Failed to cancel order.");
      }
    } catch {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o))
      );
      setQueue((prev) => {
        const updated = [
          ...prev,
          { orderId: order.id, newStatus: "cancelled" as OrderStatus, prevStatus },
        ];
        saveQueue(updated);
        return updated;
      });
    }
  }, []);

  // ---------------------------------------------------------------- render

  const showBanner = !isOnline || queue.length > 0;
  const openRequestCount = serviceRequests.filter((r) => r.status === "open").length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-container-lowest">
      <KitchenHeader
        restaurantName={restaurantName}
        isOnline={isOnline}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        now={now}
        serviceRequestCount={openRequestCount}
        onServiceRequestsClick={() => setServicesPanelOpen((v) => !v)}
      />

      {/* Offline / pending banner */}
      {showBanner && (
        <div className="flex items-center justify-center gap-sm bg-error-container border-b border-error/20 px-md py-xs text-on-error-container font-label-bold text-sm">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {!isOnline ? "wifi_off" : "sync"}
          </span>
          {!isOnline
            ? `Offline — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`
            : `Syncing — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 4-column grid */}
        <div className="flex flex-1 gap-gutter overflow-hidden p-gutter">
          {COLUMNS.map((col) => {
            const colOrders = columnOrders(orders, col);
            const badge = COLUMN_BADGE[col.title];

            return (
              <section
                key={col.title}
                className="flex flex-1 flex-col bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden"
              >
                {/* Column header */}
                <div className="flex items-center gap-sm px-md py-sm bg-surface-container border-b border-outline-variant/30 shrink-0">
                  <h2 className="font-label-bold text-on-surface uppercase tracking-widest text-xs flex-1">
                    {col.title}
                  </h2>
                  {col.title === "Served" ? (
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>
                      history
                    </span>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 font-bold text-xs ${badge.bg} ${badge.text}`}>
                      {colOrders.length}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div
                  className="flex flex-col gap-sm overflow-y-auto p-sm kds-column"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(89,65,57,0.2) transparent" }}
                >
                  {colOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      isNew={newIds.has(order.id)}
                      onAdvance={() => handleAdvance(order)}
                      onCancel={() => handleCancel(order)}
                    />
                  ))}

                  {colOrders.length === 0 && (
                    <div className="flex flex-col items-center justify-center flex-1 rounded-xl border-2 border-dashed border-outline-variant/30 py-10 text-center">
                      <span className="material-symbols-outlined text-on-surface-variant/40 mb-xs" style={{ fontSize: 32 }}>
                        receipt_long
                      </span>
                      <p className="font-body-sm text-on-surface-variant">No orders</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Service requests side panel */}
        {servicesPanelOpen && (
          <aside className="w-72 shrink-0 flex flex-col border-l border-outline-variant/30 bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-md py-sm bg-surface-container border-b border-outline-variant/30 shrink-0">
              <h2 className="font-label-bold text-on-surface uppercase tracking-widest text-xs">
                Table Requests
              </h2>
              <button
                onClick={() => setServicesPanelOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-sm space-y-sm">
              {serviceRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant/40" style={{ fontSize: 32 }}>
                    notifications_none
                  </span>
                  <p className="font-body-sm text-on-surface-variant">No pending requests</p>
                </div>
              ) : (
                serviceRequests.map((req) => {
                  const meta = REQUEST_LABELS[req.type] ?? { icon: "help", label: req.type };
                  const elapsed = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 60000);
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl border border-outline-variant/30 bg-surface-container p-sm space-y-xs"
                    >
                      <div className="flex items-center gap-xs">
                        <span className="material-symbols-outlined text-primary" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
                          {meta.icon}
                        </span>
                        <span className="font-label-bold text-on-surface flex-1">{meta.label}</span>
                        <span className="font-body-sm text-on-surface-variant" style={{ fontSize: 11 }}>
                          {elapsed === 0 ? "just now" : `${elapsed}m ago`}
                        </span>
                      </div>
                      {req.tableLabel && (
                        <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 12 }}>
                          Table {req.tableLabel}
                        </p>
                      )}
                      <button
                        onClick={() => handleResolveRequest(req.id)}
                        className="w-full h-8 rounded-lg bg-secondary-container text-on-secondary-container font-label-bold text-xs hover:bg-surface-container-high transition-colors"
                      >
                        Mark resolved
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
