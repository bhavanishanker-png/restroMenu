"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { QRCodeCanvas } from "./QRCodeCanvas";
import type { RestaurantTable } from "@/types";

type TableEntry = RestaurantTable & { hasActiveSession: boolean };

type Props = {
  initialTables: TableEntry[];
  restaurantId: string;
  restaurantSlug: string;
};

/** Mirrors the zod schema on POST /api/tables. */
const LABEL_MAX = 50;
const SEATS_MIN = 1;
const SEATS_MAX = 100;
const SEAT_PRESETS = [2, 4, 6, 8];

/** Pixel width of the downloadable PNG — large enough to print sharply. */
const DOWNLOAD_QR_PX = 1024;

function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
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

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1 text-body-xs font-medium text-error">
      <Icon name="error" size={16} />
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- Add table dialog

function AddTableDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: TableEntry) => void;
}) {
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [saving, setSaving] = useState(false);
  // Errors appear only after the first submit attempt, not while typing.
  const [attempted, setAttempted] = useState(false);

  const seatsNum = Number(seats);
  const labelError = label.trim() === "" ? "Give the table a name guests and staff will recognise." : null;
  const seatsError =
    !Number.isInteger(seatsNum) || seatsNum < SEATS_MIN || seatsNum > SEATS_MAX
      ? `Seats must be a whole number from ${SEATS_MIN} to ${SEATS_MAX}.`
      : null;

  function reset() {
    setLabel("");
    setSeats("4");
    setAttempted(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    const l = label.trim();
    if (labelError || seatsError) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: l, seats: Number(seats) || 4 }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        toast.error(body.error?.message ?? "Failed to create table.");
        return;
      }
      const { table } = await res.json() as { table: TableEntry };
      toast.success(`Table "${table.label}" created.`);
      onCreated(table);
      reset();
      onClose();
    } catch (err) {
      // A dropped connection used to surface as an unhandled rejection.
      console.error("[tables] create failed", err);
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAttempted(false); onClose(); } }}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader className="gap-3 space-y-0 text-left sm:text-left">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text"
            aria-hidden="true"
          >
            <Icon name="table_restaurant" size={22} />
          </span>
          <DialogTitle className="pr-8 font-display text-headline-sm">Add a table</DialogTitle>
          <DialogDescription className="text-body-sm text-on-surface-variant">
            Each table gets its own QR code. Guests who scan it order straight to this table.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="table-label">Table name</Label>
            <Input
              id="table-label"
              autoFocus
              maxLength={LABEL_MAX}
              placeholder="T1, Rooftop 3, Bar counter…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={attempted && labelError !== null}
              aria-describedby={attempted && labelError ? "table-label-error" : "table-label-hint"}
              className={cn("h-11", attempted && labelError && "border-error focus-visible:ring-error")}
            />
            {attempted && labelError ? (
              <FieldError id="table-label-error">{labelError}</FieldError>
            ) : (
              <p id="table-label-hint" className="text-body-xs text-on-surface-variant">
                Printed on the standee and shown on kitchen tickets.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="table-seats">Seats</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Common seat counts" className="flex gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1">
                {SEAT_PRESETS.map((n) => {
                  const active = seats === String(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSeats(String(n))}
                      className={cn(
                        "h-9 min-w-[44px] rounded-lg px-2 text-sm font-medium tabular-nums transition-colors duration-fast",
                        active
                          ? "bg-surface-container-lowest text-on-surface shadow-level-1"
                          : "text-on-surface-variant hover:text-on-surface"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <Input
                id="table-seats"
                type="number"
                inputMode="numeric"
                min={SEATS_MIN}
                max={SEATS_MAX}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                aria-invalid={attempted && seatsError !== null}
                aria-describedby={attempted && seatsError ? "table-seats-error" : undefined}
                className={cn("h-11 w-24 tabular-nums", attempted && seatsError && "border-error focus-visible:ring-error")}
              />
            </div>
            {attempted && seatsError && <FieldError id="table-seats-error">{seatsError}</FieldError>}
          </div>

          <Button type="submit" variant="brand" size="lg" disabled={saving}>
            <Icon name="add" />
            {saving ? "Creating…" : "Create table"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Table card

function StatusPill({ inUse }: { inUse: boolean }) {
  // The word carries the state; colour only reinforces it.
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        inUse
          ? "bg-success-container text-on-success-container"
          : "bg-surface-container-high text-on-surface-variant"
      )}
    >
      <Icon name={inUse ? "groups" : "event_seat"} size={14} />
      {inUse ? "In use" : "Free"}
    </span>
  );
}

function TableCard({
  table,
  tableUrl,
  onRegenerate,
  onDelete,
}: {
  table: TableEntry;
  tableUrl: string;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  // Renders a fresh high-resolution PNG instead of copying the on-screen
  // preview, which was only 120px wide and printed blurry.
  async function downloadQR() {
    setDownloading(true);
    try {
      const dataUrl = await QRCode.toDataURL(tableUrl, {
        width: DOWNLOAD_QR_PX,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qr-${table.label.replace(/\s+/g, "-")}.png`;
      link.click();
    } catch (err) {
      console.error("[tables] QR download failed", err);
      toast.error("Couldn't create the QR image. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1 transition-shadow duration-fast hover:shadow-level-2">
      <header className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant"
          aria-hidden="true"
        >
          <Icon name="table_restaurant" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-title text-on-surface" title={table.label}>
            {table.label}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-body-xs text-on-surface-variant">
            <Icon name="chair" size={14} />
            <span className="tabular-nums">{table.seats}</span> seat{table.seats === 1 ? "" : "s"}
          </p>
        </div>
        <StatusPill inUse={table.hasActiveSession} />
      </header>

      {/* QR preview. The code itself is always black on white so it scans;
          only the frame around it follows the theme. */}
      <div className="grid place-items-center rounded-xl border border-outline-variant bg-surface-container-low p-5">
        <div className="rounded-lg bg-white p-1.5 shadow-level-1">
          <QRCodeCanvas url={tableUrl} size={136} dataTableId={table.id} />
        </div>
      </div>

      <footer className="flex items-center gap-2">
        <Button
          variant="outline"
          size="touch"
          className="flex-1 px-3"
          onClick={downloadQR}
          disabled={downloading}
        >
          <Icon name="download" />
          {downloading ? "Preparing…" : "Download PNG"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="touch" className="px-0" aria-label={`More actions for ${table.label}`}>
              <Icon name="more_vert" size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl border-outline-variant p-1.5">
            <DropdownMenuItem onSelect={onRegenerate} className="min-h-11 gap-2.5 rounded-lg px-3">
              <Icon name="refresh" />
              Regenerate QR code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="min-h-11 gap-2.5 rounded-lg px-3 text-error focus:bg-error-container focus:text-on-error-container"
            >
              <Icon name="delete" />
              Remove table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------- Empty state

const SETUP_STEPS = [
  { icon: "add_circle", title: "Add a table", body: "Name it the way your staff already do." },
  { icon: "print", title: "Print its standee", body: "Four standees per A4 sheet." },
  { icon: "qr_code_scanner", title: "Guests scan & order", body: "Orders land on the kitchen screen." },
];

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center">
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl border border-outline-variant bg-surface-container text-on-surface-variant"
        aria-hidden="true"
      >
        <Icon name="qr_code_2" size={28} />
      </span>
      <div className="space-y-1">
        <p className="font-display text-headline-sm text-on-surface">Set up your first table</p>
        <p className="mx-auto max-w-sm text-body-sm text-on-surface-variant">
          Every table gets a unique QR code. Guests scan it to see your menu and order — no app, no waiting.
        </p>
      </div>
      <Button variant="brand" size="lg" onClick={onAdd}>
        <Icon name="add" />
        Add your first table
      </Button>
      <ol className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
        {SETUP_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-container-high font-mono text-sm font-bold text-on-surface">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                <Icon name={step.icon} size={16} />
                {step.title}
              </p>
              <p className="text-body-xs text-on-surface-variant">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- main component

type PendingAction = { kind: "regenerate" | "delete"; table: TableEntry };

export function TablesManager({ initialTables, restaurantId, restaurantSlug }: Props) {
  const [tables, setTables] = useState<TableEntry[]>(initialTables);
  const [addOpen, setAddOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  function tableUrl(token: string) {
    // `"use client"` does not mean client-only — this component is still
    // server-rendered, and this function runs during render rather than in an
    // effect. Reading `window` directly threw
    //   ReferenceError: window is not defined
    // which made the server return 500 for /dashboard/tables; the browser then
    // could not load the route's chunk and surfaced it as a ChunkLoadError.
    //
    // The origin is only ever consumed inside QRCodeCanvas's effect, so an
    // empty string during SSR is harmless and causes no hydration mismatch.
    // NEXT_PUBLIC_APP_URL is the server-side fallback so the value is still
    // correct if this is ever rendered somewhere that matters.
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL ?? "";

    return `${origin}/r/${restaurantSlug}/t/${token}`;
  }

  async function handleDownloadAllPDF() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/qr/${restaurantId}/pdf`);
      if (!res.ok) {
        toast.error("Failed to generate PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qr-standees.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[tables] PDF download failed", err);
      toast.error("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRegenerate(table: TableEntry) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tables/${table.id}/regenerate-qr`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to regenerate QR.");
        return;
      }
      const { table: updated } = await res.json() as { table: RestaurantTable };
      setTables((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...updated, hasActiveSession: t.hasActiveSession } : t))
      );
      toast.success(`QR for "${updated.label}" regenerated. Print a new standee for it.`);
      setPending(null);
    } catch (err) {
      console.error("[tables] regenerate failed", err);
      toast.error("Couldn't reach the server. The old QR code still works.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(table: TableEntry) {
    setBusy(true);
    const prev = tables;
    setTables((all) => all.filter((t) => t.id !== table.id));
    try {
      const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" });
      if (!res.ok) {
        setTables(prev);
        toast.error("Failed to remove table.");
      } else {
        toast.success(`Table "${table.label}" removed.`);
      }
    } catch (err) {
      // Without this the optimistic removal stuck even though nothing was
      // deleted on the server.
      console.error("[tables] delete failed", err);
      setTables(prev);
      toast.error("Couldn't reach the server. The table was not removed.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const inUseCount = tables.filter((t) => t.hasActiveSession).length;
  const seatCount = tables.reduce((sum, t) => sum + t.seats, 0);

  return (
    <div className="flex flex-col gap-4 p-margin-mobile md:p-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 font-medium text-on-surface">
            <Icon name="table_restaurant" size={16} />
            <span className="tabular-nums">{tables.length}</span> table{tables.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 font-medium text-on-surface">
            <Icon name="chair" size={16} />
            <span className="tabular-nums">{seatCount}</span> seats
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 font-medium text-on-surface">
            <Icon name="groups" size={16} />
            <span className="tabular-nums">{inUseCount}</span> in use
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <Button
            variant="outline"
            size="touch"
            className="px-3 sm:px-4"
            onClick={handleDownloadAllPDF}
            disabled={downloading || tables.length === 0}
          >
            <Icon name="print" />
            {downloading ? "Generating…" : "Print all standees"}
          </Button>
          <Button variant="brand" size="touch" className="px-3 sm:px-4" onClick={() => setAddOpen(true)}>
            <Icon name="add" />
            Add table
          </Button>
        </div>
      </div>

      {tables.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <>
          <p className="flex items-start gap-1.5 px-1 text-body-sm text-on-surface-variant">
            <Icon name="info" size={16} className="mt-0.5" />
            Print the standees once and leave them on the tables. A code only changes if you regenerate it.
          </p>
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                tableUrl={tableUrl(table.qrToken)}
                onRegenerate={() => setPending({ kind: "regenerate", table })}
                onDelete={() => setPending({ kind: "delete", table })}
              />
            ))}
          </div>
        </>
      )}

      <AddTableDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(t) => setTables((prev) => [...prev, t])}
      />

      <ConfirmDialog
        open={pending?.kind === "regenerate"}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        icon="qr_code_2"
        tone="warning"
        title={`Regenerate the QR for ${pending?.table.label ?? "this table"}?`}
        description={
          <p>
            The printed standee on this table will <strong className="font-semibold text-on-surface">stop working immediately</strong>.
            Guests who scan it will see an error until you print and place the new code.
          </p>
        }
        confirmLabel="Regenerate QR"
        busyLabel="Regenerating…"
        busy={busy}
        onConfirm={() => { if (pending) void handleRegenerate(pending.table); }}
      />

      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        icon="delete"
        title={`Remove ${pending?.table.label ?? "this table"}?`}
        description={
          <p>
            Its QR code will stop working and it will disappear from this list. Past orders from this table are kept.
          </p>
        }
        confirmLabel="Remove table"
        busyLabel="Removing…"
        busy={busy}
        onConfirm={() => { if (pending) void handleDelete(pending.table); }}
      />
    </div>
  );
}
