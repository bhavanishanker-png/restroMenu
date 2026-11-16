"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MAX_SPLIT_SHARES,
  formatMoney,
  remainingAfterShares,
  sharesMatchTotal,
  splitEqually,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PaymentShare, SplitBillState } from "@/types";

// Split bill (T38) on the order tracker. One guest splits the bill; each
// person scans their own fixed-amount UPI QR on this phone. Every amount shown
// here is a preview — the server computes and checks the real amounts.

type Result = { ok: true; state: SplitBillState } | { ok: false; message: string };

async function splitRequest(url: string, init?: RequestInit): Promise<Result> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => null)) as
      | (SplitBillState & { error?: { message?: string } })
      | null;
    if (!res.ok || !json) {
      return { ok: false, message: json?.error?.message ?? "Something went wrong. Please try again." };
    }
    return { ok: true, state: json };
  } catch (err) {
    console.error("[split-bill] request failed", url, err);
    return { ok: false, message: "You seem to be offline. Check your connection and try again." };
  }
}

function Icon({ name, size = 20, className, fill }: { name: string; size?: number; className?: string; fill?: boolean }) {
  return (
    <span
      className={cn("material-symbols-outlined", className)}
      style={{ fontSize: size, fontVariationSettings: fill ? "'FILL' 1" : undefined }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high"
    >
      <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- entry point

export function SplitBill({ orderId, onPaid }: { orderId: string; onPaid: () => void }) {
  const [state, setState] = useState<SplitBillState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const wasPaid = useRef(false);

  const load = useCallback(async () => {
    const result = await splitRequest(`/api/orders/${orderId}/split`);
    if (result.ok) {
      setState(result.state);
      setLoadError(false);
    } else {
      console.error("[split-bill] load failed:", result.message);
      setLoadError(true);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tell the tracker the moment the last share lands, so its pill turns Paid.
  useEffect(() => {
    if (!state) return;
    const paid = state.paymentStatus === "paid";
    if (paid && !wasPaid.current) onPaid();
    wasPaid.current = paid;
  }, [state, onPaid]);

  const active = (state?.shares.length ?? 0) > 0;
  const settled = state?.paymentStatus === "paid";

  // Poll fast while people are scanning in front of the sheet, slowly
  // otherwise. Realtime can't reach this table (RLS), so polling is the path.
  useEffect(() => {
    if (!active || settled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, open ? 4_000 : 15_000);
    return () => clearInterval(id);
  }, [active, settled, open, load]);

  if (!state) {
    if (loadError) {
      return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-sm text-on-surface-variant">
          <span>Couldn&rsquo;t load bill splitting.</span>
          <Button size="touch" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      );
    }
    return <Skeleton className="h-[76px] w-full rounded-2xl" />;
  }

  // Nothing to offer: paid without a split, or QR payments aren't set up.
  if (!active && (settled || !state.onlineAvailable)) return null;

  const paidCount = state.shares.filter((s) => s.status === "paid").length;

  return (
    <>
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1">
        {!active ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[44px] w-full items-center gap-3 text-left"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand-text">
              <Icon name="call_split" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-title text-on-surface">Split the bill</span>
              <span className="block text-body-xs text-on-surface-variant">
                Everyone pays their share by scanning a UPI QR
              </span>
            </span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-title text-on-surface">
                {settled ? "Bill fully paid" : `Bill split between ${state.shares.length}`}
              </p>
              <p className="tabular text-body-xs text-on-surface-variant">
                {paidCount} of {state.shares.length} paid
              </p>
            </div>
            <ProgressBar percent={state.paidPercent} label="Share of the bill paid" />
            <p className="tabular text-body-sm text-on-surface-variant">
              {formatMoney(state.paid)} of {formatMoney(state.orderTotal)} paid
            </p>
            <Button size="touch" variant={settled ? "outline" : "brand"} className="w-full" onClick={() => setOpen(true)}>
              <Icon name={settled ? "receipt_long" : "qr_code_2"} />
              {settled ? "See who paid" : "Show QR codes"}
            </Button>
          </div>
        )}
      </section>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex max-h-[92svh] flex-col overflow-hidden rounded-t-3xl bg-surface p-0">
          <SheetHeader className="px-margin-mobile pb-2 pt-5 text-left">
            <SheetTitle className="font-display text-headline-sm">Split the bill</SheetTitle>
            <SheetDescription className="text-body-sm">
              {active
                ? "Show each person their QR. They scan it with any UPI app — GPay, PhonePe, Paytm."
                : `Total ${formatMoney(state.orderTotal)}. Choose how to split it.`}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-margin-mobile pb-8">
            {active ? (
              <SplitShares orderId={orderId} state={state} onState={setState} />
            ) : (
              <SplitSetup orderId={orderId} total={state.orderTotal} onState={setState} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- setup

type CustomRow = { key: number; label: string; amount: string };

/** "" and junk are not amounts; the server validates the real values anyway. */
function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function SplitSetup({
  orderId,
  total,
  onState,
}: {
  orderId: string;
  total: number;
  onState: (s: SplitBillState) => void;
}) {
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [count, setCount] = useState(2);
  const [rows, setRows] = useState<CustomRow[]>([
    { key: 1, label: "Person 1", amount: "" },
    { key: 2, label: "Person 2", amount: "" },
  ]);
  const nextKey = useRef(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = splitEqually(total, count);
  const amounts = rows.map((r) => parseAmount(r.amount));
  const entered = amounts.filter((a): a is number => a !== null);
  const left = remainingAfterShares(total, entered);
  const customReady =
    amounts.every((a) => a !== null) &&
    rows.every((r) => r.label.trim().length > 0) &&
    sharesMatchTotal(total, entered);

  function updateRow(key: number, patch: Partial<CustomRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Put whatever is still unassigned on this person's row. */
  function fillRest(key: number) {
    const others = rows
      .filter((r) => r.key !== key)
      .map((r) => parseAmount(r.amount))
      .filter((a): a is number => a !== null);
    const rest = remainingAfterShares(total, others);
    if (rest > 0) updateRow(key, { amount: String(rest) });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const body =
      mode === "equal"
        ? { mode: "equal", count }
        : {
            mode: "custom",
            shares: rows.map((r) => ({ label: r.label.trim(), amount: parseAmount(r.amount) ?? 0 })),
          };
    const result = await splitRequest(`/api/orders/${orderId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (result.ok) onState(result.state);
    else setError(result.message);
  }

  const people = mode === "equal" ? count : rows.length;

  return (
    <div className="space-y-5 pt-2">
      <Tabs value={mode} onValueChange={(v) => setMode(v === "custom" ? "custom" : "equal")}>
        <TabsList className="grid h-11 w-full grid-cols-2">
          <TabsTrigger value="equal" className="h-9">Equally</TabsTrigger>
          <TabsTrigger value="custom" className="h-9">Custom amounts</TabsTrigger>
        </TabsList>

        <TabsContent value="equal" className="space-y-4 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <span className="text-body-md font-medium text-on-surface">Number of people</span>
            <div className="flex items-center gap-2">
              <Button
                size="touch"
                variant="outline"
                className="px-0"
                aria-label="One fewer person"
                disabled={count <= 2}
                onClick={() => setCount((c) => Math.max(2, c - 1))}
              >
                <Icon name="remove" />
              </Button>
              <span className="tabular w-8 text-center font-display text-headline-sm text-on-surface" aria-live="polite">
                {count}
              </span>
              <Button
                size="touch"
                variant="outline"
                className="px-0"
                aria-label="One more person"
                disabled={count >= MAX_SPLIT_SHARES}
                onClick={() => setCount((c) => Math.min(MAX_SPLIT_SHARES, c + 1))}
              >
                <Icon name="add" />
              </Button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {preview.map((amount, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl bg-surface-container px-3 py-2 text-body-sm"
              >
                <span className="text-on-surface-variant">Person {i + 1}</span>
                <span className="tabular font-semibold text-on-surface">{formatMoney(amount)}</span>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="custom" className="space-y-3 pt-4">
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center gap-2">
                <Input
                  aria-label="Name"
                  value={row.label}
                  maxLength={40}
                  onChange={(e) => updateRow(row.key, { label: e.target.value })}
                  className="h-11 min-w-0 flex-1"
                />
                <div className="relative w-28 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">₹</span>
                  <Input
                    aria-label={`Amount for ${row.label || "this person"}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                    className="tabular h-11 pl-7"
                  />
                </div>
                {left > 0 && parseAmount(row.amount) === null ? (
                  <Button size="touch" variant="ghost" className="px-2 text-body-xs" onClick={() => fillRest(row.key)}>
                    Rest
                  </Button>
                ) : rows.length > 2 ? (
                  <Button
                    size="touch"
                    variant="ghost"
                    className="px-0"
                    aria-label={`Remove ${row.label || "this person"}`}
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  >
                    <Icon name="close" />
                  </Button>
                ) : (
                  <span className="w-11 shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
          {rows.length < MAX_SPLIT_SHARES && (
            <Button
              size="touch"
              variant="outline"
              className="w-full"
              onClick={() => {
                const key = nextKey.current++;
                setRows((rs) => [...rs, { key, label: `Person ${rs.length + 1}`, amount: "" }]);
              }}
            >
              <Icon name="person_add" />
              Add person
            </Button>
          )}
          <p
            className={cn(
              "flex items-center gap-1.5 text-body-sm font-medium",
              left === 0 ? "text-success" : left < 0 ? "text-error" : "text-on-surface-variant"
            )}
            aria-live="polite"
          >
            <Icon name={left === 0 ? "check_circle" : left < 0 ? "error" : "pending"} size={18} fill={left === 0} />
            {left === 0
              ? `Adds up to ${formatMoney(total)}`
              : left < 0
                ? `${formatMoney(-left)} more than the bill`
                : `${formatMoney(left)} left to assign`}
          </p>
        </TabsContent>
      </Tabs>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
          <Icon name="error" size={18} />
          {error}
        </p>
      )}

      <Button
        size="xl"
        variant="brand"
        className="w-full"
        disabled={submitting || (mode === "custom" && !customReady)}
        onClick={() => void submit()}
      >
        <Icon name="qr_code_2" />
        {submitting ? "Creating QR codes…" : `Create ${people} QR codes`}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- shares

function qrUsable(share: PaymentShare): boolean {
  if (!share.qrImageUrl || !share.qrExpiresAt) return false;
  return new Date(share.qrExpiresAt).getTime() - Date.now() > 60_000;
}

function SplitShares({
  orderId,
  state,
  onState,
}: {
  orderId: string;
  state: SplitBillState;
  onState: (s: SplitBillState) => void;
}) {
  const [busyShare, setBusyShare] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = state.paymentStatus === "paid";
  const anyPaid = state.shares.some((s) => s.status === "paid");

  async function newQr(shareId: string) {
    setBusyShare(shareId);
    setError(null);
    const result = await splitRequest(`/api/orders/${orderId}/split/${shareId}/qr`, { method: "POST" });
    setBusyShare(null);
    if (result.ok) onState(result.state);
    else setError(result.message);
  }

  async function cancelSplit() {
    setCancelling(true);
    setError(null);
    const result = await splitRequest(`/api/orders/${orderId}/split`, { method: "DELETE" });
    setCancelling(false);
    if (result.ok) onState(result.state);
    else setError(result.message);
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex items-baseline justify-between">
          <p className="tabular font-display text-title text-on-surface">
            {formatMoney(state.paid)} <span className="text-body-sm font-normal text-on-surface-variant">of {formatMoney(state.orderTotal)} paid</span>
          </p>
          {!settled && (
            <p className="tabular text-body-xs text-on-surface-variant">{formatMoney(state.remaining)} to go</p>
          )}
        </div>
        <ProgressBar percent={state.paidPercent} label="Share of the bill paid" />
        {settled && (
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-success" role="status">
            <Icon name="check_circle" size={18} fill />
            Bill fully paid — thank you!
          </p>
        )}
      </div>

      {!settled && state.shares.length > 1 && (
        <p className="flex items-center gap-1.5 text-body-xs text-on-surface-variant">
          <Icon name="swipe" size={16} />
          Swipe to see the next person
        </p>
      )}

      <ul className="-mx-margin-mobile flex snap-x snap-mandatory gap-3 overflow-x-auto px-margin-mobile pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {state.shares.map((share) => (
          <li key={share.id} className="w-[82%] max-w-[300px] shrink-0 snap-center">
            <ShareCard
              share={share}
              count={state.shares.length}
              busy={busyShare === share.id}
              onNewQr={() => void newQr(share.id)}
            />
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
          <Icon name="error" size={18} />
          {error}
        </p>
      )}

      {!anyPaid && !settled && (
        <Button size="touch" variant="ghost" className="w-full" disabled={cancelling} onClick={() => void cancelSplit()}>
          {cancelling ? "Cancelling…" : "Cancel split"}
        </Button>
      )}
      {anyPaid && !settled && (
        <p className="text-center text-body-xs text-on-surface-variant">
          Paying cash instead? Ask a member of staff to mark your share as paid.
        </p>
      )}
    </div>
  );
}

function ShareCard({
  share,
  count,
  busy,
  onNewQr,
}: {
  share: PaymentShare;
  count: number;
  busy: boolean;
  onNewQr: () => void;
}) {
  const paid = share.status === "paid";
  const usable = !paid && qrUsable(share);

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center gap-3 rounded-2xl border bg-surface-container-lowest p-4 text-center shadow-level-1",
        paid ? "border-success/50" : "border-outline-variant"
      )}
    >
      <div className="w-full">
        <p className="text-body-xs text-on-surface-variant">
          {share.position} of {count}
        </p>
        <p className="truncate font-display text-title text-on-surface">{share.label}</p>
        <p className="tabular font-display text-headline-sm text-on-surface">{formatMoney(share.amount)}</p>
      </div>

      <div className="grid aspect-square w-full max-w-[220px] place-items-center overflow-hidden rounded-xl bg-white">
        {paid ? (
          <div className="flex flex-col items-center gap-2 text-success">
            <Icon name="check_circle" size={64} fill />
            <span className="text-body-md font-semibold">
              Paid{share.method === "cash" ? " · cash" : share.method === "upi" ? " · UPI" : ""}
            </span>
          </div>
        ) : usable && share.qrImageUrl ? (
          // Razorpay hosts the QR image; it's already the right size, so skip
          // Next's optimiser (which would need the host allow-listed).
          <Image
            src={share.qrImageUrl}
            alt={`UPI QR code for ${share.label} to pay ${formatMoney(share.amount)}`}
            width={220}
            height={220}
            unoptimized
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 p-4 text-on-surface-variant">
            <Icon name="qr_code_2" size={48} />
            <span className="text-body-sm">{share.qrImageUrl ? "This QR has expired." : "The QR isn't ready yet."}</span>
          </div>
        )}
      </div>

      {!paid && !usable && (
        <Button size="touch" variant="brand" className="w-full" disabled={busy} onClick={onNewQr}>
          <Icon name="refresh" />
          {busy ? "Making QR…" : share.qrImageUrl ? "Show a new QR" : "Retry"}
        </Button>
      )}
      {!paid && usable && (
        <p className="flex items-center gap-1 text-body-xs text-on-surface-variant">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
          </span>
          Waiting for payment
        </p>
      )}
    </div>
  );
}
