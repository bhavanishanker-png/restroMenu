"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus, ServiceRequest, ServiceRequestType } from "@/types";
import type { KitchenItem, KitchenOrder, PendingChange } from "./types";
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

const COLUMN_BADGE: Record<string, ColumnBadge> = {
  New:       { bg: "bg-primary",                    text: "text-on-primary"                    },
  Preparing: { bg: "bg-surface-container-highest",  text: "text-on-surface-variant"            },
  Ready:     { bg: "bg-secondary-container",        text: "text-on-secondary-container"        },
  Served:    { bg: "bg-surface-container-high",     text: "text-on-surface-variant"            },
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

// ---------------------------------------------------------------- raw order mapper

type RawOrderRow = {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  restaurant_tables: { label: string } | null;
  order_items: {
    id: string;
    item_name: string;
    variant_name: string | null;
    quantity: number;
    addons: { name: string; price: number }[] | null;
    notes: string | null;
  }[];
};

function mapRaw(row: RawOrderRow): KitchenOrder {
  const tableLabel =
    row.restaurant_tables && "label" in row.restaurant_tables
      ? (row.restaurant_tables as { label: string }).label
      : null;

  const items: KitchenItem[] = (row.order_items ?? []).map((i) => ({
    id: i.id,
    itemName: i.item_name,
    variantName: i.variant_name,
    quantity: i.quantity,
    addons: (i.addons ?? []) as KitchenItem["addons"],
    notes: i.notes,
  }));

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status as OrderStatus,
    placedAt: row.placed_at,
    tableLabel,
    items,
  };
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
};

// ---------------------------------------------------------------- component

export function KitchenDisplay({
  restaurantId,
  restaurantName,
  initialOrders,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [now, setNow] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<PendingChange[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [servicesPanelOpen, setServicesPanelOpen] = useState(false);

  const isOnlineRef = useRef(isOnline);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

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

  // ---- Load initial open service requests ----
  useEffect(() => {
    supabase
      .from("service_requests")
      .select("id, restaurant_id, table_id, type, status, created_at, restaurant_tables(label)")
      .eq("restaurant_id", restaurantId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        type RawSR = {
          id: string; restaurant_id: string; table_id: string;
          type: string; status: string; created_at: string;
          restaurant_tables: { label: string }[] | { label: string } | null;
        };
        const mapped: ServiceRequest[] = (data as unknown as RawSR[]).map((r) => {
          const tableRow = Array.isArray(r.restaurant_tables)
            ? r.restaurant_tables[0]
            : r.restaurant_tables;
          return {
            id: r.id,
            restaurantId: r.restaurant_id,
            tableId: r.table_id,
            tableLabel: tableRow?.label ?? null,
            type: r.type as ServiceRequestType,
            status: r.status as "open" | "resolved",
            createdAt: r.created_at,
          };
        });
        setServiceRequests(mapped);
      });
  }, [supabase, restaurantId]);

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

  // ---- Supabase Realtime — orders ----
  useEffect(() => {
    const SELECT =
      "id, order_number, status, placed_at, restaurant_tables(label), order_items(id, item_name, variant_name, quantity, addons, notes)";

    const channel = supabase
      .channel(`kitchen-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("orders")
            .select(SELECT)
            .eq("id", (payload.new as { id: string }).id)
            .single();

          if (!data) return;

          const newOrder = mapRaw(data as unknown as RawOrderRow);
          setOrders((prev) => [newOrder, ...prev]);
          setNewIds((prev) => new Set(Array.from(prev).concat(newOrder.id)));

          if (soundEnabledRef.current && audioCtxRef.current) {
            try { buildChime(audioCtxRef.current); } catch { /* ignore */ }
          }

          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(newOrder.id);
              return next;
            });
          }, 1500);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          setOrders((prev) =>
            prev.map((o) =>
              o.id === updated.id
                ? { ...o, status: updated.status as OrderStatus }
                : o
            )
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, restaurantId]);

  // ---- Supabase Realtime — service requests ----
  useEffect(() => {
    const channel = supabase
      .channel(`kitchen-service-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "service_requests",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const inserted = payload.new as {
            id: string; restaurant_id: string; table_id: string;
            type: string; status: string; created_at: string;
          };

          // Fetch with the table label join
          const { data } = await supabase
            .from("service_requests")
            .select("id, restaurant_id, table_id, type, status, created_at, restaurant_tables(label)")
            .eq("id", inserted.id)
            .single();

          type RawSRSingle = {
            id: string; restaurant_id: string; table_id: string;
            type: string; status: string; created_at: string;
            restaurant_tables: { label: string }[] | { label: string } | null;
          };
          const r = data as unknown as RawSRSingle | null;

          if (!r) return;

          const tableRow = Array.isArray(r.restaurant_tables)
            ? r.restaurant_tables[0]
            : r.restaurant_tables;

          const req: ServiceRequest = {
            id: r.id,
            restaurantId: r.restaurant_id,
            tableId: r.table_id,
            tableLabel: tableRow?.label ?? null,
            type: r.type as ServiceRequestType,
            status: r.status as "open" | "resolved",
            createdAt: r.created_at,
          };

          setServiceRequests((prev) => [...prev, req]);

          const label = REQUEST_LABELS[req.type as ServiceRequestType];
          const tableName = req.tableLabel ? `Table ${req.tableLabel}` : "A table";
          toast.info(`${tableName}: ${label.label}`, { icon: label.icon });
          setServicesPanelOpen(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          if (updated.status === "resolved") {
            setServiceRequests((prev) => prev.filter((r) => r.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
                      <p className="font-body-sm text-on-surface-variant/50">No orders</p>
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
                  <p className="font-body-sm text-on-surface-variant/50">No pending requests</p>
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
                        <span className="font-body-sm text-on-surface-variant/60" style={{ fontSize: 11 }}>
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
                        className="w-full h-8 rounded-lg bg-secondary-container text-on-secondary-container font-label-bold text-xs hover:bg-secondary/20 transition-colors"
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
