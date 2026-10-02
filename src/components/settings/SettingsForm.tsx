"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { RestaurantSettings } from "@/types";

type Props = {
  settings: RestaurantSettings;
  restaurantName?: string;
  logoUrl: string | null;
};

type FormState = {
  serviceChargePct: number;
  packingCharge: number;
  orderNumberPrefix: string;
  acceptsCash: boolean;
  acceptsOnline: boolean;
  autoAcceptOrders: boolean;
};

/** Mirrors the zod schema on PATCH /api/settings. */
const PREFIX_MAX = 6;
const PREFIX_PATTERN = /^[A-Z0-9]+$/;

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

/** Heading on the left, fields on the right from lg up; stacked below. */
function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <div className="flex items-start gap-3 lg:flex-col lg:gap-3 lg:pt-1">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant"
          aria-hidden="true"
        >
          <Icon name={icon} size={22} />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-display text-title text-on-surface">{title}</h2>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
        {children}
      </div>
    </section>
  );
}

/** One setting per row inside a section card. */
function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 p-4 sm:p-5", className)}>{children}</div>;
}

/**
 * A whole-row switch. The label wraps the row, so the tap target is the full
 * row rather than the 24px track. On/Off is spelled out next to the switch so
 * state never relies on its colour.
 */
function SwitchRow({
  id,
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  icon?: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[60px] cursor-pointer items-center gap-4 p-4 transition-colors duration-fast first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-container-low sm:p-5"
    >
      {icon && <Icon name={icon} size={22} className="text-on-surface-variant" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-on-surface">{title}</span>
        <span id={`${id}-desc`} className="mt-0.5 block text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="w-6 text-right text-xs font-semibold text-on-surface-variant" aria-hidden="true">
          {checked ? "On" : "Off"}
        </span>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={`${id}-desc`}
          className="data-[state=unchecked]:bg-surface-container-highest data-[state=unchecked]:ring-1 data-[state=unchecked]:ring-inset data-[state=unchecked]:ring-outline-variant"
        />
      </span>
    </label>
  );
}

export function SettingsForm({ settings: initial, restaurantName, logoUrl: initialLogoUrl }: Props) {
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const initialForm: FormState = {
    serviceChargePct: initial.serviceChargePct,
    packingCharge: initial.packingCharge,
    orderNumberPrefix: initial.orderNumberPrefix,
    acceptsCash: initial.acceptsCash,
    acceptsOnline: initial.acceptsOnline,
    autoAcceptOrders: initial.autoAcceptOrders,
  };
  const [form, setForm] = useState<FormState>(initialForm);
  // What the server last confirmed — drives "Unsaved changes" and Discard.
  const [saved, setSaved] = useState<{ form: FormState; logoUrl: string | null }>({
    form: initialForm,
    logoUrl: initialLogoUrl,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const errors = {
    orderNumberPrefix:
      form.orderNumberPrefix === ""
        ? "Enter a prefix — it starts every order number."
        : form.orderNumberPrefix.length > PREFIX_MAX
          ? `Keep it to ${PREFIX_MAX} characters or fewer.`
          : !PREFIX_PATTERN.test(form.orderNumberPrefix)
            ? "Use only letters A–Z and digits 0–9 — no spaces or symbols."
            : null,
    serviceChargePct:
      form.serviceChargePct < 0 || form.serviceChargePct > 100
        ? "Service charge must be between 0% and 100%."
        : null,
    packingCharge: form.packingCharge < 0 ? "Packing charge can't be negative." : null,
  };
  const errorCount = Object.values(errors).filter((e) => e !== null).length;
  const dirty =
    logoUrl !== saved.logoUrl ||
    (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== saved.form[k]);
  const noPaymentMethod = !form.acceptsCash && !form.acceptsOnline;

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file still fires a change event.
    e.target.value = "";
    if (!file) return;

    setUploadingLogo(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      });

      const formData = new FormData();
      formData.append("file", compressed, compressed.name);

      const res = await fetch("/api/settings/logo", { method: "POST", body: formData });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        toast.error(body.error?.message ?? "Logo upload failed.");
        return;
      }

      const { url } = (await res.json()) as { url: string };
      setLogoUrl(url);
      toast.success("Logo uploaded. Save changes to apply it.");
    } catch (err) {
      console.error("[settings logo]", err);
      toast.error("Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function save() {
    if (errorCount > 0) return;
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
          logoUrl,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: { message: string } };
        toast.error(error?.message ?? "Failed to save settings.");
        return;
      }
      setSaved({ form, logoUrl });
      toast.success("Settings saved.");
    } catch (err) {
      console.error("[settings] save failed", err);
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(saved.form);
    setLogoUrl(saved.logoUrl);
  }

  return (
    <div className="flex flex-col p-margin-mobile pb-36 md:p-5 md:pb-32">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {/* ── Restaurant profile ─────────────────────────────────────────── */}
        <SettingsSection
          icon="storefront"
          title="Restaurant profile"
          description="How your restaurant appears to guests on the menu."
        >
          {restaurantName && (
            <Row>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="restaurant-name">Restaurant name</Label>
                <div className="relative max-w-md">
                  <Input
                    id="restaurant-name"
                    value={restaurantName}
                    readOnly
                    aria-describedby="restaurant-name-hint"
                    className="h-11 cursor-default bg-surface-container pr-10 text-on-surface-variant"
                  />
                  <Icon name="lock" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                </div>
                <p id="restaurant-name-hint" className="text-body-xs text-on-surface-variant">
                  Contact support to change your restaurant name.
                </p>
              </div>
            </Row>
          )}

          <Row>
            <span className="text-sm font-medium text-on-surface">Logo</span>
            <div className="flex items-start gap-4">
              <div className="relative grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Restaurant logo"
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <span className="font-display text-3xl font-bold text-on-surface-variant" aria-label="No logo yet">
                    {(restaurantName?.trim()[0] ?? "Q").toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoSelect}
                  className="hidden"
                  aria-label="Choose a logo image"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="px-4"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <Icon name="upload" />
                    {uploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                  </Button>
                  {logoUrl && !uploadingLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      className="px-4 text-error hover:bg-error-container hover:text-on-error-container"
                      onClick={() => setLogoUrl(null)}
                    >
                      <Icon name="delete" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-body-xs text-on-surface-variant">
                  Square image, JPEG, PNG or WebP. Shown in the customer menu header.
                </p>
              </div>
            </div>
          </Row>

          {/*
            Cover photo stays a placeholder on purpose: `restaurants.cover_url`
            exists in the schema but no screen renders it yet, so an upload here
            would write a field nothing reads. Wire it up alongside whichever
            screen first displays the cover.
          */}
          <Row>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-on-surface">Cover photo</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                <Icon name="schedule" size={14} />
                Coming soon
              </span>
            </div>
            <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant bg-surface-container-low text-on-surface-variant">
              <Icon name="image" size={22} />
              <span className="text-body-xs">A wide banner for the top of your menu.</span>
            </div>
          </Row>
        </SettingsSection>

        {/* ── Ordering ───────────────────────────────────────────────────── */}
        <SettingsSection
          icon="receipt_long"
          title="Ordering"
          description="How new orders are numbered and whether they need confirming."
        >
          <Row>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-prefix">Order number prefix</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="order-prefix"
                  type="text"
                  value={form.orderNumberPrefix}
                  maxLength={PREFIX_MAX}
                  placeholder="e.g. ORD"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => set("orderNumberPrefix", e.target.value.toUpperCase())}
                  aria-invalid={errors.orderNumberPrefix !== null}
                  aria-describedby={errors.orderNumberPrefix ? "order-prefix-error" : "order-prefix-hint"}
                  className={cn(
                    "h-11 w-36 font-mono uppercase tracking-wider",
                    errors.orderNumberPrefix && "border-error focus-visible:ring-error"
                  )}
                />
                {errors.orderNumberPrefix === null && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1.5 text-body-xs text-on-surface-variant">
                    Next order
                    <span className="font-mono font-bold text-on-surface">#{form.orderNumberPrefix}-0001</span>
                  </span>
                )}
              </div>
              {errors.orderNumberPrefix ? (
                <FieldError id="order-prefix-error">{errors.orderNumberPrefix}</FieldError>
              ) : (
                <p id="order-prefix-hint" className="text-body-xs text-on-surface-variant">
                  Up to {PREFIX_MAX} letters or digits. Numbers restart from 0001 each day.
                </p>
              )}
            </div>
          </Row>
          <SwitchRow
            id="auto-accept"
            title="Auto-accept new orders"
            description="Orders go straight to “Accepted” without someone confirming them."
            checked={form.autoAcceptOrders}
            onChange={(v) => set("autoAcceptOrders", v)}
          />
        </SettingsSection>

        {/* ── Charges ────────────────────────────────────────────────────── */}
        <SettingsSection
          icon="request_quote"
          title="Charges"
          description="Added to the bill on top of item prices and tax."
        >
          <Row className="sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Label htmlFor="service-charge" className="text-sm font-semibold">Service charge</Label>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">
                A percentage added to dine-in orders. Set 0 to turn it off.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:items-end">
              <div className="relative w-32">
                <Input
                  id="service-charge"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.serviceChargePct}
                  onChange={(e) =>
                    set("serviceChargePct", parseFloat(e.target.value) || 0)
                  }
                  aria-invalid={errors.serviceChargePct !== null}
                  aria-describedby={errors.serviceChargePct ? "service-charge-error" : undefined}
                  className={cn(
                    "h-11 pr-9 text-right tabular-nums",
                    errors.serviceChargePct && "border-error focus-visible:ring-error"
                  )}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true">
                  %
                </span>
              </div>
              {errors.serviceChargePct && (
                <FieldError id="service-charge-error">{errors.serviceChargePct}</FieldError>
              )}
            </div>
          </Row>
          <Row className="sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Label htmlFor="packing-charge" className="text-sm font-semibold">Packing charge</Label>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">
                A flat fee per takeaway order for packaging.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:items-end">
              <div className="relative w-32">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true">
                  ₹
                </span>
                <Input
                  id="packing-charge"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1}
                  value={form.packingCharge}
                  onChange={(e) =>
                    set("packingCharge", parseFloat(e.target.value) || 0)
                  }
                  aria-invalid={errors.packingCharge !== null}
                  aria-describedby={errors.packingCharge ? "packing-charge-error" : undefined}
                  className={cn(
                    "h-11 pl-8 text-right tabular-nums",
                    errors.packingCharge && "border-error focus-visible:ring-error"
                  )}
                />
              </div>
              {errors.packingCharge && (
                <FieldError id="packing-charge-error">{errors.packingCharge}</FieldError>
              )}
            </div>
          </Row>
        </SettingsSection>

        {/* ── Payments ───────────────────────────────────────────────────── */}
        <SettingsSection
          icon="payments"
          title="Payments"
          description="How guests can settle the bill when they check out."
        >
          <SwitchRow
            id="accepts-cash"
            icon="payments"
            title="Cash"
            description="Guests pay at the counter or to a waiter."
            checked={form.acceptsCash}
            onChange={(v) => set("acceptsCash", v)}
          />
          <SwitchRow
            id="accepts-online"
            icon="credit_card"
            title="Online payments"
            description="UPI and cards through Razorpay, paid from the guest's phone."
            checked={form.acceptsOnline}
            onChange={(v) => set("acceptsOnline", v)}
          />
          <div className="p-4 sm:p-5">
            {noPaymentMethod ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-container px-3 py-2.5 text-body-sm text-on-warning-container">
                <Icon name="warning" size={18} className="mt-px" />
                With both turned off, guests have no way to pay at checkout. Turn on at least one.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                <Icon name="info" size={18} className="mt-px" />
                Online payments require Razorpay integration setup.
              </p>
            )}
          </div>
        </SettingsSection>
      </div>

      {/* Save bar — fixed so it stays reachable on long forms. Offsets the
          280px sidebar from md up. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container-lowest/90 backdrop-blur-md md:left-[280px]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-margin-mobile py-3 md:px-5">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-body-sm" aria-live="polite">
            {errorCount > 0 ? (
              <>
                <Icon name="error" size={18} className="text-error" />
                <span className="truncate text-on-surface">
                  Fix {errorCount} field{errorCount === 1 ? "" : "s"} to save
                </span>
              </>
            ) : dirty ? (
              <>
                <Icon name="edit" size={18} className="text-on-surface-variant" />
                <span className="truncate font-medium text-on-surface">Unsaved changes</span>
              </>
            ) : (
              <>
                <Icon name="check_circle" size={18} className="text-success" />
                <span className="truncate text-on-surface-variant">All changes saved</span>
              </>
            )}
          </p>
          {dirty && (
            <Button variant="ghost" size="touch" className="px-3" onClick={discard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button
            variant="brand"
            size="touch"
            onClick={save}
            disabled={saving || !dirty || errorCount > 0}
          >
            <Icon name="save" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
