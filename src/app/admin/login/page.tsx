"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div
      className="flex min-h-screen items-center justify-center p-margin-mobile md:p-margin-desktop font-body-md antialiased"
      style={{
        backgroundColor: "#fff8f5",
        backgroundImage: "radial-gradient(#e1bfb4 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <main className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-level-2 border border-outline-variant/30 p-xl flex flex-col items-center relative overflow-hidden">
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
            style={{ fontSize: 48, lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: 700 }}
          >
            QBite
          </h1>
          <h2 className="font-headline-sm text-on-surface-variant">Admin Control</h2>
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
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors">
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
                className="w-full h-12 pl-10 pr-10 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/40"
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
            <div className="px-4 py-3 rounded-lg bg-error-container flex items-center gap-2">
              <span className="material-symbols-outlined text-[#93000a]" style={{ fontSize: 18 }}>error</span>
              <p className="font-body-sm text-body-sm text-[#93000a]">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !secret}
            className="w-full h-12 bg-primary text-on-primary rounded-lg font-headline-sm flex items-center justify-center gap-2 hover:bg-surface-tint transition-all active:translate-y-[2px] disabled:opacity-60"
          >
            <span>{loading ? "Checking…" : "Login to Platform"}</span>
            {!loading && (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-lg flex items-center justify-center gap-1 text-on-surface-variant opacity-70">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>encrypted</span>
          <span className="font-body-sm text-body-sm">Secure Enterprise Access</span>
        </div>
      </main>
    </div>
  );
}
