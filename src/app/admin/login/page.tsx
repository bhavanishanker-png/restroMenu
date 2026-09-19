"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const { error: err } = (await res.json()) as { error: { message: string } };
        setError(err?.message ?? "Incorrect secret.");
        return;
      }
      router.replace("/admin/restaurants");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="edge-light relative flex w-full flex-col items-center overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest/90 p-lg shadow-level-3 backdrop-blur-xl sm:p-xl">
        {/* Branding */}
        <div className="mb-lg flex flex-col items-center text-center">
          <div className="mb-md grid h-14 w-14 place-items-center rounded-2xl border border-brand-border bg-brand-subtle">
            <span
              className="material-symbols-outlined text-brand-text"
              style={{ fontSize: 30, fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              shield_person
            </span>
          </div>
          <h1 className="font-display text-display-lg text-on-surface">QBite</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Platform administration
          </p>
        </div>

        {/* Demo credentials */}
        <div className="w-full mb-md p-sm rounded-xl border border-outline-variant bg-surface-container-low flex items-center justify-between gap-sm">
          <div>
            <p className="font-label-bold text-label-bold text-on-surface" style={{ fontSize: 12 }}>Demo Access</p>
            <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 11 }}>Super admin secret pre-filled</p>
          </div>
          <button
            type="button"
            onClick={() => setSecret("qbite-dev-admin-secret-change-before-prod")}
            className="flex items-center gap-xs px-sm py-xs rounded-lg bg-secondary-container text-on-secondary-container font-label-bold text-label-bold hover:bg-secondary-container/80 transition-colors whitespace-nowrap shrink-0"
            style={{ fontSize: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
            Use Demo
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="w-full flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label
              htmlFor="admin-secret"
              className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wide"
            >
              Enter Super Admin Secret
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-brand-text transition-colors">
                lock
              </span>
              <input
                id="admin-secret"
                type={showSecret ? "text" : "password"}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full h-12 pl-10 pr-10 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-all placeholder:text-on-surface-variant/40"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {showSecret ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg border border-error/25 bg-error-container flex items-center gap-2">
              <span className="material-symbols-outlined text-on-error-container" style={{ fontSize: 18 }}>error</span>
              <p className="font-body-sm text-body-sm text-on-error-container">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !secret}
            className="w-full h-12 bg-brand text-brand-foreground rounded-lg font-display font-semibold flex items-center justify-center gap-2 hover:bg-brand/90 hover:shadow-glow transition-all active:translate-y-[2px] disabled:opacity-60"
          >
            <span>{loading ? "Checking…" : "Login to Platform"}</span>
            {!loading && (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-lg flex items-center justify-center gap-1.5 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
            encrypted
          </span>
          <span className="text-body-sm">Secure enterprise access</span>
        </div>
      </div>
    </AuthShell>
  );
}
