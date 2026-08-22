"use client";

import { useState } from "react";
import { Plus, Download, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-stone-900">{table.label}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-500">
            <Users className="h-3.5 w-3.5" />
            <span>{table.seats} seats</span>
          </div>
        </div>
        {table.hasActiveSession && (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            Active
          </Badge>
        )}
      </div>

      {/* QR preview */}
      <div className="flex justify-center">
        <canvas
          // We overlay a data attribute so downloadQR can find it
          data-table-id={table.id}
          className="hidden"
        />
        <QRCodeCanvas url={tableUrl} size={96} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={downloadQR}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          QR
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRegenerate}
          aria-label="Regenerate QR"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-red-500 hover:border-red-300 hover:text-red-600"
          onClick={onDelete}
          aria-label="Remove table"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
    <div className="flex flex-col gap-4 p-5">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add table
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadAllPDF}
          disabled={downloading || tables.length === 0}
        >
          <Download className="mr-1 h-4 w-4" />
          {downloading ? "Generating PDF…" : "Print all QR standees"}
        </Button>
      </div>

      {/* Grid */}
      {tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-stone-200 py-24 text-stone-400">
          <p className="text-sm">No tables yet.</p>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add first table
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
