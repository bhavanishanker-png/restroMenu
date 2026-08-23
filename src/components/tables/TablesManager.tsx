"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "./QRCodeCanvas";
import type { RestaurantTable } from "@/types";

type TableEntry = RestaurantTable & { hasActiveSession: boolean };

type Props = {
  initialTables: TableEntry[];
  restaurantId: string;
  restaurantSlug: string;
};

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (!l) return;
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
      setLabel("");
      setSeats("4");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add table</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 pt-2">
          <div className="space-y-1">
            <Label>Label *</Label>
            <Input
              autoFocus
              placeholder="T1, Rooftop 3, Bar Counter…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Seats</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving || !label.trim()}>
            {saving ? "Creating…" : "Create table"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Table card

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
  function downloadQR() {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-table-id="${table.id}"]`
    );
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `qr-${table.label.replace(/\s+/g, "-")}.png`;
    link.click();
  }

  return (
    <div className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface p-md shadow-level-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-level-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline-sm text-on-surface">{table.label}</h3>
          <div className="mt-1 flex items-center gap-xs font-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span>
            <span>{table.seats} seats</span>
          </div>
        </div>
        <span className={`rounded font-label-bold text-[10px] tracking-wider uppercase px-xs py-1 ${
          table.hasActiveSession
            ? "bg-secondary-container text-on-secondary-container"
            : "bg-surface-container-highest text-on-surface-variant"
        }`}>
          {table.hasActiveSession ? "Active" : "Empty"}
        </span>
      </div>

      {/* QR preview */}
      <div className="flex w-full aspect-square items-center justify-center rounded-lg border border-outline-variant bg-surface-container overflow-hidden group relative">
        <canvas data-table-id={table.id} className="hidden" />
        <QRCodeCanvas url={tableUrl} size={120} />
        <div className="absolute inset-0 bg-surface/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
          <button
            onClick={onRegenerate}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary shadow-sm hover:bg-surface-container-low transition-colors"
            title="Regenerate QR"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>refresh</span>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-sm border-t border-outline-variant/30">
        <button
          onClick={downloadQR}
          className="flex items-center gap-xs font-label-bold text-label-bold text-primary hover:text-primary-container transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
          Download
        </button>
        <button
          onClick={onDelete}
          aria-label="Remove table"
          className="flex items-center gap-xs font-label-bold text-label-bold text-on-surface-variant hover:text-tertiary transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
          Remove
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- main component

export function TablesManager({ initialTables, restaurantId, restaurantSlug }: Props) {
  const [tables, setTables] = useState<TableEntry[]>(initialTables);
  const [addOpen, setAddOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function tableUrl(token: string) {
    return `${window.location.origin}/r/${restaurantSlug}/t/${token}`;
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
    } catch {
      toast.error("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRegenerate(table: TableEntry) {
    if (
      !confirm(
        `The printed standee for "${table.label}" will stop working.\n\nRegenerate QR code?`
      )
    ) return;

    const res = await fetch(`/api/tables/${table.id}/regenerate-qr`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to regenerate QR.");
      return;
    }
    const { table: updated } = await res.json() as { table: RestaurantTable };
    setTables((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...updated, hasActiveSession: t.hasActiveSession } : t))
    );
    toast.success(`QR for "${updated.label}" regenerated.`);
  }

  async function handleDelete(table: TableEntry) {
    if (!confirm(`Remove table "${table.label}"?`)) return;
    const prev = tables;
    setTables((all) => all.filter((t) => t.id !== table.id));
    const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" });
    if (!res.ok) {
      setTables(prev);
      toast.error("Failed to remove table.");
    } else {
      toast.success(`Table "${table.label}" removed.`);
    }
  }

  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-sm">
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-xs px-md py-sm rounded-lg border border-primary text-primary font-label-bold text-label-bold hover:bg-surface-container-low transition-colors active:translate-y-[2px] min-h-[44px]"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Add Table
        </button>
        <button
          onClick={handleDownloadAllPDF}
          disabled={downloading || tables.length === 0}
          className="flex items-center gap-xs px-md py-sm rounded-lg bg-primary text-on-primary font-label-bold text-label-bold hover:bg-primary/90 transition-colors active:translate-y-[2px] shadow-level-1 min-h-[44px] disabled:opacity-50"
        >
          <span className="material-symbols-outlined fill" style={{ fontSize: 18 }}>print</span>
          {downloading ? "Generating…" : "Print All QR Standees"}
        </button>
      </div>

      {/* Grid */}
      {tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-outline-variant py-24 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: 48 }}>qr_code_scanner</span>
          <p className="font-body-md">No tables yet.</p>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-xs px-md py-sm rounded-lg border border-primary text-primary font-label-bold text-label-bold hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Add first table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-md">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              tableUrl={tableUrl(table.qrToken)}
              onRegenerate={() => handleRegenerate(table)}
              onDelete={() => handleDelete(table)}
            />
          ))}
        </div>
      )}

      <AddTableDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(t) => setTables((prev) => [...prev, t])}
      />
    </div>
  );
}
