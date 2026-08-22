"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Staff, StaffRole } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  kitchen: "Kitchen",
  waiter: "Waiter",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  kitchen: "bg-orange-100 text-orange-700",
  waiter: "bg-green-100 text-green-700",
};

type Props = { initialStaff: Staff[] };

export function StaffManager({ initialStaff }: Props) {
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", role: "waiter" as StaffRole, pin: "" });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function createStaff() {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
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
          pin: (form.role === "kitchen" || form.role === "waiter") ? form.pin : undefined,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: { message: string } };
        toast.error(error?.message ?? "Failed to create staff member.");
        return;
      }
      const { staff: created } = await res.json() as { staff: Staff };
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
    if (!res.ok) { toast.error("Failed to remove staff member."); return; }
    setStaff((p) => p.filter((s) => s.id !== id));
    toast.success(`${name} removed.`);
  }

  const needsPin = form.role === "kitchen" || form.role === "waiter";

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{staff.length} active staff member{staff.length !== 1 ? "s" : ""}</p>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button className="bg-[#C2410C] hover:bg-[#9a3209] text-white">
              <Plus className="mr-1 h-4 w-4" /> Add staff
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Add staff member</SheetTitle>
            </SheetHeader>
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Ravi Kumar"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setField("role", v as StaffRole)}>
                  <SelectTrigger>
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pin">
                    <KeyRound className="inline h-3.5 w-3.5 mr-1" />
                    PIN (4 digits)
                  </Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={form.pin}
                    onChange={(e) => setField("pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <p className="text-xs text-stone-400">Used to log in on the kitchen/waiter screen.</p>
                </div>
              )}
              <Button
                onClick={createStaff}
                disabled={saving}
                className="mt-2 bg-[#C2410C] hover:bg-[#9a3209] text-white"
              >
                {saving ? "Adding…" : "Add staff member"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-16 text-center text-sm text-stone-400">
          No staff members yet. Add your first one above.
        </p>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Phone</th>
                <th className="px-4 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-stone-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-stone-800">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[s.role] ?? ""}`}>
                      {ROLE_LABELS[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-400 hidden sm:table-cell">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {s.role !== "owner" && (
                      <button
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-500"
                        onClick={() => deactivate(s.id, s.name)}
                        aria-label={`Remove ${s.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
