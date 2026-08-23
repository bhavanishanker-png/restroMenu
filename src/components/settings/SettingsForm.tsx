"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { RestaurantSettings } from "@/types";

type Props = { settings: RestaurantSettings; restaurantName?: string };

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
        checked ? "bg-primary" : "bg-surface-container-highest"
      }`}
    >
      <div
        className={`absolute left-1 top-1 w-4 h-4 rounded-full shadow-sm transition-transform ${
          checked ? "bg-on-primary translate-x-6" : "bg-outline translate-x-0"
        }`}
      />
    </button>
  );
}

export function SettingsForm({ settings: initial, restaurantName }: Props) {
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
        const { error } = (await res.json()) as { error: { message: string } };
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
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop pb-24 md:pb-lg">
      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-gutter md:gap-md">
        {/* Left column */}
        <div className="col-span-1 md:col-span-8 flex flex-col gap-md">
          {/* General Settings */}
          <section className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-md pb-sm border-b border-surface-container-high">
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>store</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">General Settings</h3>
            </div>
            <div className="space-y-sm">
              {restaurantName && (
                <div>
                  <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs">
                    Restaurant Name
                  </label>
                  <div className="w-full h-12 bg-surface-container border border-outline-variant/50 rounded-lg px-4 flex items-center font-body-md text-on-surface-variant select-none">
                    {restaurantName}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                    Contact support to change your restaurant name.
                  </p>
                </div>
              )}
              <div>
                <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs">
                  Order Number Prefix
                </label>
                <input
                  type="text"
                  value={form.orderNumberPrefix}
                  maxLength={6}
                  placeholder="e.g. ORD"
                  onChange={(e) => set("orderNumberPrefix", e.target.value.toUpperCase())}
                  className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md focus:border-primary focus:ring-2 focus:ring-primary-fixed/50 transition-all text-on-surface outline-none uppercase"
                />
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                  Uppercase letters and digits only.
                </p>
              </div>
            </div>
          </section>

          {/* Billing & Charges */}
          <section className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-md pb-sm border-b border-surface-container-high">
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>receipt_long</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Billing &amp; Charges</h3>
            </div>
            <div className="space-y-md">
              {/* Service Charge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/50 bg-surface-container-lowest">
                <div>
                  <h4 className="font-body-md font-medium text-on-surface">Service Charge</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Apply a percentage fee to dine-in orders.
                  </p>
                </div>
                <div className="relative w-24">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.serviceChargePct}
                    onChange={(e) =>
                      set("serviceChargePct", parseFloat(e.target.value) || 0)
                    }
                    className="w-full h-10 pr-8 bg-surface-container border border-outline-variant rounded-md text-right font-body-md focus:border-primary outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    %
                  </span>
                </div>
              </div>

              {/* Packing Charge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/50 bg-surface-container-lowest">
                <div>
                  <h4 className="font-body-md font-medium text-on-surface">Packing Charge (Takeaway)</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Fixed fee per order for takeaway packaging.
                  </p>
                </div>
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.packingCharge}
                    onChange={(e) =>
                      set("packingCharge", parseFloat(e.target.value) || 0)
                    }
                    className="w-full h-10 pl-8 bg-surface-container border border-outline-variant rounded-md font-body-md focus:border-primary outline-none"
                  />
                </div>
              </div>

              {/* Auto-accept */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/50 bg-surface-container-lowest">
                <div>
                  <h4 className="font-body-md font-medium text-on-surface">Auto-accept new orders</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Orders go straight to &quot;Accepted&quot; without manual confirmation.
                  </p>
                </div>
                <Toggle
                  checked={form.autoAcceptOrders}
                  onChange={(v) => set("autoAcceptOrders", v)}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="col-span-1 md:col-span-4 flex flex-col gap-md">
          {/* Branding */}
          <section className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-md pb-sm border-b border-surface-container-high">
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>palette</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Branding</h3>
            </div>
            <div className="space-y-md">
              <div>
                <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs">
                  Restaurant Logo
                </label>
                <div className="mt-2 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center overflow-hidden">
                    <span className="font-display text-2xl text-primary">Q</span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="h-10 px-4 rounded border border-outline-variant text-on-surface-variant font-label-bold text-label-bold opacity-60 cursor-not-allowed"
                  >
                    Change Logo
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-label-bold text-label-bold text-on-surface-variant mb-xs">
                  Cover Photo
                </label>
                <div className="mt-2 h-32 w-full rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-lowest flex flex-col items-center justify-center opacity-60 cursor-not-allowed">
                  <span className="material-symbols-outlined text-outline-variant mb-2">cloud_upload</span>
                  <span className="font-body-sm text-on-surface-variant text-center px-4">
                    Coming soon
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Payment Methods */}
          <section className="bg-surface-container-lowest rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-md pb-sm border-b border-surface-container-high">
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Payment Methods</h3>
            </div>
            <div className="space-y-xs">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/50 transition-all">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-on-surface-variant">payments</span>
                  <span className="font-body-md text-on-surface">Accept Cash</span>
                </div>
                <Toggle
                  checked={form.acceptsCash}
                  onChange={(v) => set("acceptsCash", v)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/50 transition-all">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-on-surface-variant">credit_card</span>
                  <span className="font-body-md text-on-surface">Accept Online Payments</span>
                </div>
                <Toggle
                  checked={form.acceptsOnline}
                  onChange={(v) => set("acceptsOnline", v)}
                />
              </div>
              <div className="mt-sm p-3 bg-surface-container-low rounded-lg flex items-start gap-2">
                <span
                  className="material-symbols-outlined text-on-surface-variant mt-0.5"
                  style={{ fontSize: 16 }}
                >
                  info
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Online payments require Razorpay integration setup.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Save — desktop inline */}
      <div className="hidden md:flex max-w-4xl mx-auto w-full justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 h-12 px-6 bg-primary text-on-primary rounded-lg font-label-bold text-label-bold shadow-level-1 hover:bg-primary-container active:translate-y-[2px] transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Save — mobile fixed bottom */}
      <div className="md:hidden fixed bottom-0 left-0 w-full p-4 bg-surface/90 backdrop-blur-md border-t border-outline-variant/30 z-40">
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-12 bg-primary text-on-primary rounded-lg flex items-center justify-center gap-2 active:translate-y-[2px] transition-all font-label-bold text-label-bold shadow-level-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
