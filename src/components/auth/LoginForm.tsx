"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

// ---------------------------------------------------------------- sub-components

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="font-body-sm text-body-sm text-[#ba1a1a] flex items-center gap-1 mt-xs" role="alert">
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------- component

export function LoginForm({ defaultSlug, nextPath = "/dashboard" }: { defaultSlug?: string; nextPath?: string }) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("email");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
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

  useEffect(() => {
    const s = slug?.trim();
    if (!s) { setStaffList([]); return; }
    let cancelled = false;
    setStaffLoading(true);
    fetch(`/api/auth/staff-list?slug=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((data: { staff?: StaffOption[] }) => {
        if (!cancelled) setStaffList(data.staff ?? []);
      })
      .catch(() => { if (!cancelled) setStaffList([]); })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  async function submitEmail(data: EmailFields) {
    setApiError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "email", ...data }),
    });
    const json = (await res.json()) as { error?: { message: string } };
    if (!res.ok) { setApiError(json.error?.message ?? "Login failed."); return; }
    router.push(nextPath);
  }

  async function submitPin(data: PinFields) {
    setApiError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "pin", ...data }),
    });
    const json = (await res.json()) as { error?: { message: string } };
    if (!res.ok) { setApiError(json.error?.message ?? "Login failed."); return; }
    router.push(nextPath);
  }

  // No mount gate here on purpose. This form reads nothing that differs
  // between server and client — no cart store, no localStorage, no Date — so
  // gating it behind `mounted` bought nothing and actively caused a hydration
  // mismatch: the server emitted an empty 520px box while the client rendered
  // the real form. It also meant the login screen first painted as a blank
  // card. The cart-backed components still need their gate; this one does not.
  return (
    <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-level-2 border border-outline-variant/30 p-xl flex flex-col items-center">
      {/* Branding */}
      <div className="flex flex-col items-center mb-lg text-center">
        <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mb-md">
          <span
            className="material-symbols-outlined text-on-primary-container"
            style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}
          >
            restaurant_menu
          </span>
        </div>
        <h1
          className="font-display text-primary mb-xs"
          style={{ fontSize: 40, lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: 700 }}
        >
          QBite
        </h1>
        <h2 className="font-headline-sm text-on-surface-variant">Staff Access</h2>
      </div>

      {/* Demo credentials */}
      <div className="w-full mb-md p-sm rounded-xl border border-outline-variant bg-surface-container-low flex items-start justify-between gap-sm">
        <div>
          <p className="font-label-bold text-label-bold text-on-surface" style={{ fontSize: 12 }}>Demo Restaurant</p>
          <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 11 }}>
            test-kitchen · testowner@qbite.dev / Test1234!
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTab("email");
            setApiError(null);
            setEmailVal("email", "testowner@qbite.dev");
            setEmailVal("password", "Test1234!");
          }}
          className="flex items-center gap-xs px-sm py-xs rounded-lg bg-secondary-container text-on-secondary-container font-label-bold text-label-bold hover:bg-secondary-container/80 transition-colors whitespace-nowrap shrink-0"
          style={{ fontSize: 12 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
          Use Demo
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex w-full rounded-xl border border-outline-variant bg-surface-container p-1 gap-1 mb-md">
        {(["email", "pin"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setApiError(null); }}
            className={`flex-1 rounded-lg py-2 font-label-bold text-label-bold transition-all ${
              tab === t
                ? "bg-primary-container text-on-primary-container shadow-level-1"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {t === "email" ? "Manager / Owner" : "Kitchen / Waiter"}
          </button>
        ))}
      </div>

      {/* API error */}
      {apiError && (
        <div className="w-full mb-md px-4 py-3 rounded-lg bg-error-container flex items-center gap-2">
          <span className="material-symbols-outlined text-[#93000a]" style={{ fontSize: 18 }}>error</span>
          <p className="font-body-sm text-body-sm text-[#93000a]">{apiError}</p>
        </div>
      )}

      {/* Email / owner form */}
      {tab === "email" && (
        <form onSubmit={handleEmail(submitEmail)} className="w-full flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide">
              Email
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors">
                person
              </span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...regEmail("email")}
                className="w-full h-12 pl-10 pr-sm bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/40"
              />
            </div>
            <FieldError msg={emailErrors.email?.message} />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide">
              Password
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors">
                lock
              </span>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                {...regEmail("password")}
                className="w-full h-12 pl-10 pr-10 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <FieldError msg={emailErrors.password?.message} />
          </div>

          <button
            type="submit"
            disabled={emailSubmitting}
            className="w-full h-12 bg-primary text-on-primary rounded-lg font-headline-sm flex items-center justify-center gap-2 hover:bg-surface-tint transition-all active:translate-y-[2px] disabled:opacity-60 mt-xs"
          >
            <span>{emailSubmitting ? "Signing in…" : "Sign In"}</span>
            {!emailSubmitting && (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            )}
          </button>
        </form>
      )}

      {/* PIN form */}
      {tab === "pin" && (
        <form onSubmit={handlePin(submitPin)} className="w-full flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide">
              Restaurant Code
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors">
                store
              </span>
              <input
                placeholder="e.g. tandoori-hut"
                {...regPin("restaurantSlug")}
                className="w-full h-12 pl-10 pr-sm bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/40"
              />
            </div>
            <FieldError msg={pinErrors.restaurantSlug?.message} />
          </div>

          {staffLoading && (
            <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs">
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>autorenew</span>
              Loading staff…
            </p>
          )}

          {!staffLoading && staffList.length > 0 && (
            <div className="flex flex-col gap-xs">
              <label className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide">
                Your Name
              </label>
              <div className="flex flex-col gap-2">
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPinVal("staffId", s.id)}
                    className={`w-full rounded-xl border-2 px-4 py-2.5 text-left font-body-md transition-all ${
                      watchPin("staffId") === s.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline"
                    }`}
                  >
                    {s.name}
                    <span className="ml-2 font-label-bold text-label-bold text-on-surface-variant capitalize">
                      {s.role}
                    </span>
                  </button>
                ))}
              </div>
              <FieldError msg={pinErrors.staffId?.message} />
            </div>
          )}

          <div className="flex flex-col gap-xs">
            <label className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span>
              4-digit PIN
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors">
                lock
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                {...regPin("pin")}
                className="w-full h-12 pl-10 pr-sm bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/40 tracking-[0.5em]"
              />
            </div>
            <FieldError msg={pinErrors.pin?.message} />
          </div>

          <button
            type="submit"
            disabled={pinSubmitting}
            className="w-full h-12 bg-primary text-on-primary rounded-lg font-headline-sm flex items-center justify-center gap-2 hover:bg-surface-tint transition-all active:translate-y-[2px] disabled:opacity-60 mt-xs"
          >
            <span>{pinSubmitting ? "Signing in…" : "Sign In"}</span>
            {!pinSubmitting && (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            )}
          </button>
        </form>
      )}

      {/* Security footer */}
      <div className="mt-lg flex items-center justify-center gap-1 text-on-surface-variant opacity-70">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>encrypted</span>
        <span className="font-body-sm text-body-sm">Secure Staff Access</span>
      </div>
    </div>
  );
}
