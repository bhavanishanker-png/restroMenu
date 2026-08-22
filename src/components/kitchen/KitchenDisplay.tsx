"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus } from "@/types";
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
  order: "asc" | "desc"; // ascending = oldest first
};

const COLUMNS: Column[] = [
  { title: "New",       statuses: ["placed"],               order: "desc" },
  { title: "Preparing", statuses: ["accepted", "preparing"], order: "asc"  },
  { title: "Ready",     statuses: ["ready"],                 order: "asc"  },
  { title: "Served",    statuses: ["served"],                order: "desc" },
];

function columnOrders(all: KitchenOrder[], col: Column): KitchenOrder[] {
  const filtered = all.filter((o) => col.statuses.includes(o.status));
  if (col.order === "asc") {
    return [...filtered].sort(
      (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
    );
  }
  return filtered; // already newest-first from the prepend pattern
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
  const [now, setNow] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<PendingChange[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Refs for use inside callbacks without stale closures
  const isOnlineRef = useRef(isOnline);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // ---- 1s timer ----
  useEffect(() => {
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

  // ---- Supabase Realtime ----
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

    // Optimistic update
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
      // Network failed — roll back and queue
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone-100">
      <KitchenHeader
        restaurantName={restaurantName}
        isOnline={isOnline}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        now={now}
      />

      {showBanner && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-amber-900">
          {!isOnline
            ? `Offline — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`
            : `Syncing — ${queue.length} change${queue.length !== 1 ? "s" : ""} pending`}
        </div>
      )}

      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        {COLUMNS.map((col) => {
          const colOrders = columnOrders(orders, col);
          return (
            <div
              key={col.title}
              className="flex flex-1 flex-col gap-2 overflow-hidden"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
                  {col.title}
                </h2>
                <span className="rounded-full bg-stone-300 px-2 py-0.5 text-xs font-bold text-stone-700">
                  {colOrders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3 overflow-y-auto pb-2">
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
                  <div className="rounded-xl border-2 border-dashed border-stone-200 py-10 text-center text-sm text-stone-400">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
