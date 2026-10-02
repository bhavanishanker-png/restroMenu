"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- schemas

const emailSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const pinSchema = z.object({
  restaurantSlug: z.string().min(1, "Enter your restaurant code"),
  staffId: z.string().min(1, "Select your name"),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

type EmailFields = z.infer<typeof emailSchema>;
type PinFields = z.infer<typeof pinSchema>;

type Tab = "email" | "pin";
type StaffOption = { id: string; name: string; role: string };

const TABS: { value: Tab; label: string; hint: string; icon: string }[] = [
  { value: "email", label: "Owner / Manager", hint: "Email", icon: "mail" },
  { value: "pin", label: "Kitchen / Waiter", hint: "PIN", icon: "dialpad" },
];

const NETWORK_ERROR = "Couldn't reach QBite. Check your connection and try again.";

// ---------------------------------------------------------------- sub-components

function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined", className)} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="mt-1 flex items-center gap-1 text-body-sm font-medium text-error">
      <Icon name="error" size={16} />
      {msg}
    </p>
  );
}

const LABEL = "font-label-bold text-label-bold uppercase text-on-surface-variant";

function inputClass(invalid: boolean, extra?: string) {
  return cn(
    "h-12 w-full rounded-xl border bg-surface-container-low pl-11 pr-3 text-body-md text-on-surface",
    "placeholder:text-on-surface-variant/50 transition-[border-color,box-shadow] duration-fast",
    "focus:outline-none focus:ring-2",
    invalid
      ? "border-error focus:border-error focus:ring-error/30"
      : "border-outline-variant hover:border-outline focus:border-brand focus:ring-brand/30",
    extra
  );
}

function InputIcon({ name }: { name: string }) {
  return (
    <Icon
      name={name}
      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-brand-text"
    />
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-display font-semibold text-brand-foreground shadow-level-1 transition-[box-shadow,transform,opacity] duration-fast hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest active:translate-y-px disabled:opacity-60"
    >
      <span>{busy ? "Signing in…" : children}</span>
      {!busy && <Icon name="arrow_forward" />}
    </button>
  );
}

// ---------------------------------------------------------------- component

export function LoginForm({ defaultSlug, nextPath = "/dashboard" }: { defaultSlug?: string; nextPath?: string }) {
  const router = useRouter();
  const uid = useId();
  const ids = {
    email: `${uid}-email`,
    password: `${uid}-password`,
    slug: `${uid}-slug`,
    staff: `${uid}-staff`,
    pin: `${uid}-pin`,
    panel: `${uid}-panel`,
  };

  const [tab, setTab] = useState<Tab>("email");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // ---- email form ----
  const {
    register: regEmail,
    handleSubmit: handleEmail,
    setValue: setEmailVal,
    formState: { errors: emailErrors, isSubmitting: emailSubmitting },
  } = useForm<EmailFields>({ resolver: zodResolver(emailSchema) });

  // ---- PIN form ----
  const {
    register: regPin,
    handleSubmit: handlePin,
    watch: watchPin,
    setValue: setPinVal,
    formState: { errors: pinErrors, isSubmitting: pinSubmitting },
  } = useForm<PinFields>({
    resolver: zodResolver(pinSchema),
    defaultValues: { restaurantSlug: defaultSlug ?? "" },
  });

  const slug = watchPin("restaurantSlug");
  const selectedStaffId = watchPin("staffId");

  useEffect(() => {
    const s = slug?.trim();
    setStaffError(null);
    if (!s) { setStaffList([]); return; }
    let cancelled = false;
    setStaffLoading(true);
    fetch(`/api/auth/staff-list?slug=${encodeURIComponent(s)}`)
      .then(async (r) => {
        const data = (await r.json()) as { staff?: StaffOption[]; error?: { message: string } };
        if (cancelled) return;
        setStaffList(data.staff ?? []);
        // A 404 here just means the code is wrong (or still being typed).
        if (!r.ok) {
          setStaffError(
            r.status === 404
              ? "No restaurant with that code. Check it with your manager."
              : data.error?.message ?? "Couldn't load staff names."
          );
        }
      })
      .catch((err: unknown) => {
        console.error("Staff list fetch failed", err);
        if (!cancelled) { setStaffList([]); setStaffError(NETWORK_ERROR); }
      })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  async function submitEmail(data: EmailFields) {
    setApiError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "email", ...data }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) { setApiError(json.error?.message ?? "Login failed."); return; }
      router.push(nextPath);
    } catch (err) {
      console.error("Email login failed", err);
      setApiError(NETWORK_ERROR);
    }
  }

  async function submitPin(data: PinFields) {
    setApiError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "pin", ...data }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) { setApiError(json.error?.message ?? "Login failed."); return; }
      router.push(nextPath);
    } catch (err) {
      console.error("PIN login failed", err);
      setApiError(NETWORK_ERROR);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setApiError(null);
  }

  // No mount gate here on purpose. This form reads nothing that differs
  // between server and client — no cart store, no localStorage, no Date — so
  // gating it behind `mounted` bought nothing and actively caused a hydration
  // mismatch. The cart-backed components still need their gate; this one does not.
  return (
    <div className="edge-light flex w-full flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest/95 p-5 shadow-level-3 backdrop-blur-xl sm:p-8">
      {/* Branding */}
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-border bg-brand-subtle">
          <span
            className="material-symbols-outlined text-brand-text"
            style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            restaurant_menu
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[24px] font-bold leading-tight text-on-surface">Sign in to QBite</h1>
          <p className="text-body-sm text-on-surface-variant">Your restaurant workspace</p>
        </div>
      </div>

      {/* Sign-in method. Tabs, not a radio group: each one swaps the whole
          form below, and arrow keys move between them. */}
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const next: Tab = tab === "email" ? "pin" : "email";
          switchTab(next);
          document.getElementById(`${uid}-tab-${next}`)?.focus();
        }}
      >
        {TABS.map((t) => {
          const selected = tab === t.value;
          return (
            <button
              key={t.value}
              id={`${uid}-tab-${t.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={ids.panel}
              tabIndex={selected ? 0 : -1}
              onClick={() => switchTab(t.value)}
              className={cn(
                "flex min-h-[48px] flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-[background-color,color,box-shadow] duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                selected
                  ? "bg-surface-container-lowest text-on-surface shadow-level-1"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              )}
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold leading-tight sm:text-sm">
                {/* Wrapped: the icon font's own `display` would beat `hidden`. */}
                <span className="hidden sm:inline-flex">
                  <Icon name={t.icon} size={16} className={selected ? "text-brand-text" : undefined} />
                </span>
                {t.label}
              </span>
              <span className="text-[11px] leading-tight text-on-surface-variant">Sign in with {t.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Demo credentials */}
      {tab === "email" && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-on-surface">Demo restaurant</p>
            <p className="truncate font-mono text-[11px] text-on-surface-variant">
              testowner@qbite.dev · Test1234!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              setEmailVal("email", "testowner@qbite.dev", { shouldValidate: true });
              setEmailVal("password", "Test1234!", { shouldValidate: true });
            }}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-[13px] font-semibold text-on-surface transition-colors hover:border-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="bolt" size={16} className="text-brand-text" />
            Use demo
          </button>
        </div>
      )}

      {/* API error */}
      {apiError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container"
        >
          <Icon name="error" size={18} className="mt-px shrink-0" />
          <p>{apiError}</p>
        </div>
      )}

      <div id={ids.panel} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        {/* Email / owner form */}
        {tab === "email" && (
          <form onSubmit={handleEmail(submitEmail)} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor={ids.email} className={LABEL}>Email</label>
              <div className="group relative mt-1.5">
                <InputIcon name="person" />
                <input
                  id={ids.email}
                  type="email"
                  autoComplete="email"
                  placeholder="you@restaurant.com"
                  aria-invalid={Boolean(emailErrors.email)}
                  aria-describedby={emailErrors.email ? `${ids.email}-err` : undefined}
                  {...regEmail("email")}
                  className={inputClass(Boolean(emailErrors.email))}
                />
              </div>
              <FieldError id={`${ids.email}-err`} msg={emailErrors.email?.message} />
            </div>

            <div>
              <label htmlFor={ids.password} className={LABEL}>Password</label>
              <div className="group relative mt-1.5">
                <InputIcon name="lock" />
                <input
                  id={ids.password}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  aria-invalid={Boolean(emailErrors.password)}
                  aria-describedby={emailErrors.password ? `${ids.password}-err` : undefined}
                  {...regEmail("password")}
                  className={inputClass(Boolean(emailErrors.password), "pr-12")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} />
                </button>
              </div>
              <FieldError id={`${ids.password}-err`} msg={emailErrors.password?.message} />
            </div>

            <SubmitButton busy={emailSubmitting}>Sign in</SubmitButton>
          </form>
        )}

        {/* PIN form */}
        {tab === "pin" && (
          <form onSubmit={handlePin(submitPin)} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor={ids.slug} className={LABEL}>Restaurant code</label>
              <div className="group relative mt-1.5">
                <InputIcon name="store" />
                <input
                  id={ids.slug}
                  placeholder="e.g. tandoori-hut"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(pinErrors.restaurantSlug || staffError)}
                  aria-describedby={`${ids.slug}-hint`}
                  {...regPin("restaurantSlug")}
                  className={inputClass(Boolean(pinErrors.restaurantSlug))}
                />
              </div>
              {pinErrors.restaurantSlug ? (
                <FieldError id={`${ids.slug}-hint`} msg={pinErrors.restaurantSlug.message} />
              ) : staffError ? (
                <FieldError id={`${ids.slug}-hint`} msg={staffError} />
              ) : (
                <p id={`${ids.slug}-hint`} className="mt-1 text-body-sm text-on-surface-variant">
                  Ask your manager — it is the word after /r/ in your menu link.
                </p>
              )}
            </div>

            {/* Skeleton, not a spinner, while names load. */}
            {staffLoading && (
              <div className="flex flex-col gap-2" aria-busy="true">
                <span className="sr-only">Loading staff names</span>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            )}

            {!staffLoading && staffList.length > 0 && (
              <div role="radiogroup" aria-labelledby={ids.staff}>
                <p id={ids.staff} className={LABEL}>Your name</p>
                <div className="mt-1.5 flex flex-col gap-2">
                  {staffList.map((s) => {
                    const selected = selectedStaffId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPinVal("staffId", s.id, { shouldValidate: true })}
                        className={cn(
                          "flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-[border-color,background-color] duration-fast",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          selected
                            ? "border-brand bg-brand-subtle"
                            : "border-outline-variant bg-surface-container-lowest hover:border-outline"
                        )}
                      >
                        {/* The check icon carries selection; the border only reinforces it. */}
                        <Icon
                          name={selected ? "radio_button_checked" : "radio_button_unchecked"}
                          className={selected ? "text-brand-text" : "text-on-surface-variant"}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-on-surface">{s.name}</span>
                        <span className="shrink-0 rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                          {s.role}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FieldError id={`${ids.staff}-err`} msg={pinErrors.staffId?.message} />
              </div>
            )}

            {/* Name not picked yet and no list to pick from — still say so. */}
            {!staffLoading && staffList.length === 0 && pinErrors.staffId && !staffError && !pinErrors.restaurantSlug && (
              <FieldError id={`${ids.staff}-err`} msg="Enter your restaurant code to choose your name" />
            )}

            <div>
              <label htmlFor={ids.pin} className={LABEL}>4-digit PIN</label>
              <div className="group relative mt-1.5">
                <InputIcon name="key" />
                <input
                  id={ids.pin}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="••••"
                  aria-invalid={Boolean(pinErrors.pin)}
                  aria-describedby={pinErrors.pin ? `${ids.pin}-err` : undefined}
                  {...regPin("pin")}
                  className={inputClass(Boolean(pinErrors.pin), "font-mono tracking-[0.5em]")}
                />
              </div>
              <FieldError id={`${ids.pin}-err`} msg={pinErrors.pin?.message} />
            </div>

            <SubmitButton busy={pinSubmitting}>Sign in with PIN</SubmitButton>
          </form>
        )}
      </div>

      {/* Security footer */}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-body-sm text-on-surface-variant">
        <Icon name="encrypted" size={16} />
        Staff-only access. Accounts are set up by your restaurant owner.
      </p>
    </div>
  );
}
