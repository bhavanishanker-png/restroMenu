"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

// ---------------------------------------------------------------- component

export function LoginForm({ defaultSlug }: { defaultSlug?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";

  const [tab, setTab] = useState<Tab>("email");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // ---- email form ----
  const {
    register: regEmail,
    handleSubmit: handleEmail,
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

  // Fetch staff list whenever slug changes.
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
    const json = await res.json() as { error?: { message: string } };
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
    const json = await res.json() as { error?: { message: string } };
    if (!res.ok) { setApiError(json.error?.message ?? "Login failed."); return; }
    router.push(nextPath);
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Logo / brand */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-stone-900">QBite Staff</h1>
        <p className="text-sm text-stone-500">Sign in to continue</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-stone-200 p-1 bg-stone-50 gap-1">
        {(["email", "pin"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setApiError(null); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t === "email" ? "Manager / Owner" : "Kitchen / Waiter"}
          </button>
        ))}
      </div>

      {/* API-level error */}
      {apiError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {apiError}
        </p>
      )}

      {/* Email form */}
      {tab === "email" && (
        <form onSubmit={handleEmail(submitEmail)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...regEmail("email")} />
            {emailErrors.email && <p className="text-xs text-red-600">{emailErrors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...regEmail("password")} />
            {emailErrors.password && <p className="text-xs text-red-600">{emailErrors.password.message}</p>}
          </div>
          <Button type="submit" disabled={emailSubmitting} className="w-full bg-[#C2410C] hover:bg-[#9A3412]">
            {emailSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      )}

      {/* PIN form */}
      {tab === "pin" && (
        <form onSubmit={handlePin(submitPin)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="slug">Restaurant code</Label>
            <Input id="slug" placeholder="e.g. tandoori-hut" {...regPin("restaurantSlug")} />
            {pinErrors.restaurantSlug && <p className="text-xs text-red-600">{pinErrors.restaurantSlug.message}</p>}
          </div>

          {/* Staff selector */}
          {staffLoading && <p className="text-xs text-stone-400">Loading staff…</p>}
          {!staffLoading && staffList.length > 0 && (
            <div className="space-y-1.5">
              <Label>Your name</Label>
              <div className="grid gap-2">
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPinVal("staffId", s.id)}
                    className={`w-full rounded-xl border-2 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                      watchPin("staffId") === s.id
                        ? "border-[#C2410C] bg-[#C2410C]/5 text-[#C2410C]"
                        : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    {s.name}
                    <span className="ml-2 text-xs font-normal capitalize text-stone-400">{s.role}</span>
                  </button>
                ))}
              </div>
              {pinErrors.staffId && <p className="text-xs text-red-600">{pinErrors.staffId.message}</p>}
            </div>
          )}

          {/* PIN input */}
          <div className="space-y-1.5">
            <Label htmlFor="pin">4-digit PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              {...regPin("pin")}
            />
            {pinErrors.pin && <p className="text-xs text-red-600">{pinErrors.pin.message}</p>}
          </div>

          <Button type="submit" disabled={pinSubmitting} className="w-full bg-[#C2410C] hover:bg-[#9A3412]">
            {pinSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      )}
    </div>
  );
}
