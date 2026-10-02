"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus, ServiceRequest, ServiceRequestType } from "@/types";
import type { KitchenOrder, PendingChange } from "./types";
import { KitchenHeader } from "./KitchenHeader";
import { AMBER_AFTER_MIN, OrderCard, elapsedMinutes } from "./OrderCard";
import { cn } from "@/lib/utils";

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
  /** Material Symbols name — the column is identified by icon and title,
   *  never by its accent colour alone. */
  icon: string;
  /** Top rule and count badge. */
  accent: string;
  badge: string;
  empty: { title: string; body: string };
};

// New is the loudest (brand accent, inverted badge), Ready carries the success
// hue because it is the one column that demands someone walk over — matching
// the `ready` treatment in lib/order-status.ts. The rest are neutral.
const COLUMNS: Column[] = [
  {
    title: "New",
    statuses: ["placed"],
    order: "desc",
    icon: "notifications_active",
    accent: "bg-brand",
    badge: "bg-brand text-brand-foreground",
    empty: { title: "Waiting for orders", body: "New tickets slide in here with a chime." },
  },
  {
    title: "Preparing",
    statuses: ["accepted", "preparing"],
    order: "asc",
    icon: "skillet",
    accent: "bg-warning",
    badge: "bg-surface-container-highest text-on-surface",
    empty: { title: "Nothing on the stove", body: "Accept a new order to start cooking it." },
  },
  {
    title: "Ready",
    statuses: ["ready"],
    order: "asc",
    icon: "room_service",
    accent: "bg-success",
    badge: "bg-success-container text-on-success-container",
    empty: { title: "Pass is clear", body: "Dishes marked ready wait here for pickup." },
  },
  {
    title: "Served",
    statuses: ["served"],
    order: "desc",
    icon: "history",
    accent: "bg-outline",
    badge: "bg-surface-container-high text-on-surface-variant",
    empty: { title: "None served yet", body: "Completed orders from this shift land here." },
  },
];

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
  const activeOrders = orders.filter((o) => o.status !== "served" && o.status !== "cancelled");
  const lateCount =
    now === 0 ? 0 : activeOrders.filter((o) => elapsedMinutes(o.placedAt, now) >= AMBER_AFTER_MIN).length;

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
        activeCount={activeOrders.length}
        lateCount={lateCount}
      />

      {/* Offline / pending banner */}
      {showBanner && (
        <div
          role="status"
          className="flex items-center justify-center gap-sm border-b border-error/20 bg-error-container px-md py-2 font-label-bold text-on-error-container"
          style={{ fontSize: 16 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            {!isOnline ? "wifi_off" : "sync"}
          </span>
          {!isOnline
            ? `Offline — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`
            : `Syncing — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 4-column grid */}
        <div className="flex flex-1 gap-3 overflow-hidden p-3">
          {COLUMNS.map((col) => {
            const colOrders = columnOrders(orders, col);

            return (
              <section
                key={col.title}
                aria-label={`${col.title} — ${colOrders.length} orders`}
                className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low"
              >
                <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", col.accent)} />

                {/* Column header */}
                <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant bg-surface-container px-3 pb-2.5 pt-3.5">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 22 }} aria-hidden="true">
                    {col.icon}
                  </span>
                  <h2 className="flex-1 font-display font-bold uppercase tracking-wide text-on-surface" style={{ fontSize: 18 }}>
                    {col.title}
                  </h2>
                  <span
                    className={cn("grid h-8 min-w-8 place-items-center rounded-full px-2 font-mono font-bold tabular-nums", col.badge)}
                    style={{ fontSize: 16 }}
                  >
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards */}
                <div
                  className="kds-column flex flex-1 flex-col gap-3 overflow-y-auto p-3"
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
                    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline-variant px-4 py-12 text-center">
                      <span className="material-symbols-outlined mb-1 text-on-surface-variant/50" style={{ fontSize: 40 }} aria-hidden="true">
                        {col.icon}
                      </span>
                      <p className="font-semibold text-on-surface" style={{ fontSize: 18 }}>
                        {col.empty.title}
                      </p>
                      <p className="text-on-surface-variant" style={{ fontSize: 15 }}>
                        {col.empty.body}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Service requests side panel */}
        {servicesPanelOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-outline-variant bg-surface">
            <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container py-1 pl-4 pr-1">
              <h2 className="font-display font-bold uppercase tracking-wide text-on-surface" style={{ fontSize: 18 }}>
                Table Requests
              </h2>
              <button
                type="button"
                onClick={() => setServicesPanelOpen(false)}
                aria-label="Close table requests"
                className="flex h-[60px] w-[60px] items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden="true">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-sm space-y-sm">
              {serviceRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant/40" style={{ fontSize: 32 }}>
                    notifications_none
                  </span>
                  <p className="font-semibold text-on-surface" style={{ fontSize: 18 }}>No pending requests</p>
                  <p className="text-on-surface-variant" style={{ fontSize: 15 }}>
                    Water, bill and waiter calls from tables appear here.
                  </p>
                </div>
              ) : (
                serviceRequests.map((req) => {
                  const meta = REQUEST_LABELS[req.type] ?? { icon: "help", label: req.type };
                  const elapsed = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 60000);
                  return (
                    <div
                      key={req.id}
                      className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1"
                    >
                      <div className="flex items-center gap-xs">
                        <span className="material-symbols-outlined text-brand-text" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                          {meta.icon}
                        </span>
                        <span className="flex-1 font-bold text-on-surface" style={{ fontSize: 18 }}>{meta.label}</span>
                        <span className="text-on-surface-variant" style={{ fontSize: 14 }}>
                          {elapsed === 0 ? "just now" : `${elapsed}m ago`}
                        </span>
                      </div>
                      {req.tableLabel && (
                        <p className="text-on-surface-variant" style={{ fontSize: 16 }}>
                          Table {req.tableLabel}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResolveRequest(req.id)}
                        className="flex h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-brand font-bold text-brand-text transition-colors hover:bg-brand hover:text-brand-foreground"
                        style={{ fontSize: 16 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">check</span>
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
