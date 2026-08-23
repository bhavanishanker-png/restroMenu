"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Staff, StaffRole } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  kitchen: "Kitchen",
  waiter: "Waiter",
};

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-primary/10 text-primary border border-primary/20",
  manager: "bg-secondary-container text-on-secondary-container",
  kitchen: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  waiter: "bg-surface-container-highest text-on-surface-variant border border-outline-variant",
};

const ROLE_AVATAR_BG: Record<string, string> = {
  owner: "bg-primary-container text-on-primary-container",
  manager: "bg-secondary-container text-on-secondary-container",
  kitchen: "bg-primary-fixed text-on-primary-fixed-variant",
  waiter: "bg-surface-variant text-on-surface-variant",
};

type Props = { initialStaff: Staff[] };

function StaffRow({ s, onDelete }: { s: Staff; onDelete: () => void }) {
  const initials = s.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="group grid grid-cols-1 md:grid-cols-12 gap-sm p-md items-center hover:bg-surface-bright transition-colors">
      <div className="md:hidden font-label-bold text-label-bold text-on-surface-variant mb-xs">Employee</div>
      <div className="col-span-1 md:col-span-4 flex items-center gap-sm">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-headline-sm ${
            ROLE_AVATAR_BG[s.role] ?? "bg-surface-variant text-on-surface-variant"
          }`}
          style={{ fontSize: 14 }}
        >
          {initials}
        </div>
        <div>
          <p className="font-headline-sm text-on-surface m-0 leading-none" style={{ fontSize: 16 }}>
            {s.name}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant m-0 mt-1">
            {s.phone ?? "No phone"}
          </p>
        </div>
      </div>

      <div className="md:hidden font-label-bold text-label-bold text-on-surface-variant mt-sm mb-xs">Role</div>
      <div className="col-span-1 md:col-span-3 flex items-center">
        <span
          className={`inline-flex items-center px-2 py-1 rounded font-label-bold text-label-bold ${
            ROLE_BADGE[s.role] ?? "bg-surface-container text-on-surface-variant"
          }`}
        >
          {ROLE_LABELS[s.role] ?? s.role}
        </span>
      </div>

      <div className="md:hidden font-label-bold text-label-bold text-on-surface-variant mt-sm mb-xs">Access PIN</div>
      <div className="col-span-1 md:col-span-3 flex items-center gap-sm">
        {s.role === "kitchen" || s.role === "waiter" ? (
          <>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-on-surface-variant" />
              ))}
            </div>
            <span className="text-on-surface-variant" aria-label="PIN hidden">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility_off</span>
            </span>
          </>
        ) : (
          <span className="font-body-sm text-on-surface-variant">—</span>
        )}
      </div>

      <div className="col-span-1 md:col-span-2 flex items-center justify-start md:justify-end gap-sm mt-sm md:mt-0">
        {s.role !== "owner" && (
          <button
            onClick={onDelete}
            aria-label={`Remove ${s.name}`}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-outline-variant text-on-surface-variant hover:border-error hover:text-error hover:bg-error-container transition-all active:translate-y-[2px]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function StaffManager({ initialStaff }: Props) {
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    role: "waiter" as StaffRole,
    pin: "",
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function createStaff() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if ((form.role === "kitchen" || form.role === "waiter") && form.pin.length !== 4) {
      toast.error("PIN must be exactly 4 digits for kitchen and waiter roles.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          pin:
            form.role === "kitchen" || form.role === "waiter" ? form.pin : undefined,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: { message: string } };
        toast.error(error?.message ?? "Failed to create staff member.");
        return;
      }
      const { staff: created } = (await res.json()) as { staff: Staff };
      setStaff((p) => [...p, created]);
      setForm({ name: "", phone: "", role: "waiter", pin: "" });
      setSheetOpen(false);
      toast.success(`${created.name} added.`);
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(`Remove ${name}? They will no longer be able to log in.`)) return;
    const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove staff member.");
      return;
    }
    setStaff((p) => p.filter((s) => s.id !== id));
    toast.success(`${name} removed.`);
  }

  const kitchenCount = staff.filter((s) => s.role === "kitchen").length;
  const serviceCount = staff.filter((s) => s.role === "waiter" || s.role === "manager").length;
  const needsPin = form.role === "kitchen" || form.role === "waiter";

  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {/* Section header with Add button */}
      <div className="flex items-center justify-between">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {staff.length} active member{staff.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center justify-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-bold text-label-bold shadow-level-1 hover:bg-primary-container transition-all active:translate-y-[2px] h-11 whitespace-nowrap"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Add Staff
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 tactile-hover flex items-center gap-md">
          <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
            <span
              className="material-symbols-outlined text-on-secondary-container"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              groups
            </span>
          </div>
          <div>
            <p className="font-label-bold text-label-bold text-on-surface-variant">Total Staff</p>
            <p className="font-headline-md text-headline-md text-on-surface">{staff.length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 tactile-hover flex items-center gap-md">
          <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center shrink-0">
            <span
              className="material-symbols-outlined text-on-primary-fixed-variant"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              restaurant_menu
            </span>
          </div>
          <div>
            <p className="font-label-bold text-label-bold text-on-surface-variant">Kitchen Staff</p>
            <p className="font-headline-md text-headline-md text-on-surface">{kitchenCount}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 tactile-hover flex items-center gap-md">
          <div className="w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center shrink-0">
            <span
              className="material-symbols-outlined text-on-surface-variant"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              room_service
            </span>
          </div>
          <div>
            <p className="font-label-bold text-label-bold text-on-surface-variant">Service Staff</p>
            <p className="font-headline-md text-headline-md text-on-surface">{serviceCount}</p>
          </div>
        </div>
      </div>

      {/* Staff list */}
      <div className="bg-surface-container-lowest rounded-xl shadow-level-1 overflow-hidden">
        {/* Table header row (desktop) */}
        <div className="hidden md:grid grid-cols-12 gap-sm px-md py-sm border-b border-surface-variant bg-surface-container-low font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wider">
          <div className="col-span-4">Employee</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-3">Access PIN</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>group_off</span>
            <p className="font-body-md">No staff members yet.</p>
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-xs px-md py-sm rounded-lg border border-primary text-primary font-label-bold text-label-bold hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Add first staff member
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-surface-variant">
            {staff.map((s) => (
              <StaffRow key={s.id} s={s} onDelete={() => deactivate(s.id, s.name)} />
            ))}
          </div>
        )}

        <div className="px-md py-sm border-t border-surface-variant bg-surface-container-low flex items-center justify-between">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {staff.length} staff member{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Add staff sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-sm bg-surface-container-lowest border-l border-outline-variant">
          <SheetHeader className="border-b border-outline-variant/30 pb-sm mb-md">
            <SheetTitle className="font-headline-sm text-on-surface">Add Staff Member</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Name *</label>
              <input
                autoFocus
                placeholder="e.g. Ravi Kumar"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Phone (optional)</label>
              <input
                placeholder="10-digit mobile"
                value={form.phone}
                onChange={(e) =>
                  setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant">Role</label>
              <Select value={form.role} onValueChange={(v) => setField("role", v as StaffRole)}>
                <SelectTrigger className="h-12 border-outline-variant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="waiter">Waiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsPin && (
              <div className="flex flex-col gap-xs">
                <label className="font-label-bold text-label-bold text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span>
                  PIN (4 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={form.pin}
                  onChange={(e) =>
                    setField("pin", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none tracking-[0.5em]"
                />
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Used to log in on the kitchen/waiter screen.
                </p>
              </div>
            )}
            <button
              onClick={createStaff}
              disabled={saving}
              className="flex items-center justify-center gap-xs h-12 rounded-lg bg-primary text-on-primary font-label-bold text-label-bold shadow-level-1 hover:bg-primary-container transition-colors active:translate-y-[2px] disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Staff Member"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
