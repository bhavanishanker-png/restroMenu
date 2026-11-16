"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PaymentShare, SplitBillState } from "@/types";

// Split bill (T38), staff side: who has paid their share, and a one-tap
// "Cash received" for a guest who pays at the counter instead of scanning.
// Renders nothing for an order that wasn't split.

type ErrorBody = { error?: { message?: string } };

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined", className)} style={{ fontSize: 18 }} aria-hidden="true">
      {name}
    </span>
  );
}

function ShareStatus({ share }: { share: PaymentShare }) {
  if (share.status === "paid") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-container px-2 py-0.5 text-xs font-semibold text-on-success-container">
        <Icon name="check_circle" />
        Paid · {share.method === "cash" ? "Cash" : "UPI"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-xs font-semibold text-on-warning-container">
      <Icon name="schedule" />
      Waiting
    </span>
  );
}

export function SplitSharesPanel({ orderId }: { orderId: string }) {
  const [state, setState] = useState<SplitBillState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/split`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((await res.json()) as SplitBillState);
      setLoadError(false);
    } catch (err) {
      console.error("[orders] failed to load split shares", err);
      setLoadError(true);
    }
  }, [orderId]);

  useEffect(() => {
    setState(null);
    void load();
  }, [load]);

  // Guests are scanning at the table; keep the list current while it's open.
  const open = state !== null && state.shares.length > 0 && state.paymentStatus !== "paid";
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => clearInterval(id);
  }, [open, load]);

  async function markCash(share: PaymentShare) {
    setMarking(share.id);
    try {
      const res = await fetch(`/api/orders/${orderId}/split/${share.id}/cash`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as (SplitBillState & ErrorBody) | null;
      if (!res.ok || !json) {
        toast.error(json?.error?.message ?? "Couldn't record the cash payment. Try again.");
        void load();
        return;
      }
      setState(json);
      toast.success(
        json.paymentStatus === "paid"
          ? "Cash recorded — the bill is fully paid."
          : `Cash recorded for ${share.label}.`
      );
    } catch (err) {
      console.error("[orders] mark cash failed", err);
      toast.error("You seem to be offline. Try again when connected.");
    } finally {
      setMarking(null);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-error/25 bg-error-container p-3 text-on-error-container">
        <span>Couldn&apos;t load the split bill.</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!state) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (state.shares.length === 0) return null;

  const paidCount = state.shares.filter((s) => s.status === "paid").length;

  return (
    <div className="rounded-xl border border-outline-variant p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Split bill · {paidCount}/{state.shares.length} paid
        </p>
        <p className="tabular-nums text-xs text-on-surface-variant">
          {formatMoney(state.paid)} of {formatMoney(state.orderTotal)}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Share of the bill paid"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.paidPercent)}
        className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${state.paidPercent}%` }} />
      </div>
      <ul className="divide-y divide-outline-variant">
        {state.shares.map((share) => (
          <li key={share.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-on-surface">{share.label}</p>
              <p className="tabular-nums text-xs text-on-surface-variant">{formatMoney(share.amount)}</p>
            </div>
            <ShareStatus share={share} />
            {share.status === "pending" && (
              <Button
                size="touch"
                variant="outline"
                disabled={marking !== null}
                onClick={() => void markCash(share)}
              >
                {marking === share.id ? "Saving…" : "Cash received"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
