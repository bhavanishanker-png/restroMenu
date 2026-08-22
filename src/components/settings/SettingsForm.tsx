"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { RestaurantSettings } from "@/types";

type Props = { settings: RestaurantSettings };

export function SettingsForm({ settings: initial }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    serviceChargePct: initial.serviceChargePct,
    packingCharge: initial.packingCharge,
    orderNumberPrefix: initial.orderNumberPrefix,
    acceptsCash: initial.acceptsCash,
    acceptsOnline: initial.acceptsOnline,
    autoAcceptOrders: initial.autoAcceptOrders,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceChargePct: form.serviceChargePct,
          packingCharge: form.packingCharge,
          orderNumberPrefix: form.orderNumberPrefix,
          acceptsCash: form.acceptsCash,
          acceptsOnline: form.acceptsOnline,
          autoAcceptOrders: form.autoAcceptOrders,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: { message: string } };
        toast.error(error?.message ?? "Failed to save settings.");
        return;
      }
      toast.success("Settings saved.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {/* Billing */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-stone-700">Billing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc">Service charge (%)</Label>
            <Input
              id="svc"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.serviceChargePct}
              onChange={(e) => set("serviceChargePct", parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-stone-400">Applied to all dine-in orders.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packing">Packing charge (₹)</Label>
            <Input
              id="packing"
              type="number"
              min={0}
              step={1}
              value={form.packingCharge}
              onChange={(e) => set("packingCharge", parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-stone-400">Applied to takeaway orders.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prefix">Order number prefix</Label>
            <Input
              id="prefix"
              value={form.orderNumberPrefix}
              maxLength={6}
              placeholder="e.g. ORD"
              onChange={(e) => set("orderNumberPrefix", e.target.value.toUpperCase())}
            />
            <p className="text-xs text-stone-400">Uppercase letters and digits only.</p>
          </div>
        </div>
      </section>

      {/* Payment methods */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-stone-700">Payment methods</h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">Accept cash</p>
              <p className="text-xs text-stone-400">Customers can pay at the counter.</p>
            </div>
            <Switch
              checked={form.acceptsCash}
              onCheckedChange={(v) => set("acceptsCash", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">Accept online payments</p>
              <p className="text-xs text-stone-400">Razorpay card / UPI.</p>
            </div>
            <Switch
              checked={form.acceptsOnline}
              onCheckedChange={(v) => set("acceptsOnline", v)}
            />
          </div>
        </div>
      </section>

      {/* Operations */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-stone-700">Operations</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-stone-800">Auto-accept new orders</p>
            <p className="text-xs text-stone-400">
              Orders go straight to &quot;Accepted&quot; without manual confirmation.
            </p>
          </div>
          <Switch
            checked={form.autoAcceptOrders}
            onCheckedChange={(v) => set("autoAcceptOrders", v)}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-[#C2410C] hover:bg-[#9a3209] text-white min-w-[100px]">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
