"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ServiceRequestType } from "@/types";

type Props = {
  slug: string;
  token: string;
};

const BUTTONS: { type: ServiceRequestType; icon: string; label: string; description: string }[] = [
  { type: "waiter",  icon: "support_agent",  label: "Call Waiter",    description: "Someone will come to your table" },
  { type: "water",   icon: "water_drop",      label: "Request Water",  description: "We'll bring water shortly" },
  { type: "bill",    icon: "receipt_long",    label: "Ask for Bill",   description: "We'll bring your bill" },
];

export function ServiceRequestPanel({ slug, token }: Props) {
  // Track per-type cooldown so the button is briefly disabled after tapping
  const [cooldowns, setCooldowns] = useState<Record<ServiceRequestType, boolean>>({
    waiter: false,
    water: false,
    bill: false,
  });

  async function handleRequest(type: ServiceRequestType) {
    if (cooldowns[type]) return;

    // Optimistic cooldown — 30 seconds to prevent accidental double-taps
    setCooldowns((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setCooldowns((prev) => ({ ...prev, [type]: false }));
    }, 30_000);

    try {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantSlug: slug, tableToken: token, type }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: { message: string } };
        toast.error(json?.error?.message ?? "Could not send request. Try again.");
        // Release cooldown on failure so they can retry
        setCooldowns((prev) => ({ ...prev, [type]: false }));
        return;
      }

      const labels: Record<ServiceRequestType, string> = {
        waiter: "Waiter called — someone is on their way.",
        water: "Water requested — coming right up.",
        bill: "Bill requested — we'll bring it shortly.",
      };
      toast.success(labels[type]);
    } catch {
      toast.error("Network error. Please try again.");
      setCooldowns((prev) => ({ ...prev, [type]: false }));
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8">
      <div className="text-center mb-2">
        <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>
          Need something?
        </p>
        <p className="font-body-md text-on-surface-variant mt-1">
          Tap below and staff will be notified.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {BUTTONS.map(({ type, icon, label, description }) => {
          const active = cooldowns[type];
          return (
            <button
              key={type}
              onClick={() => handleRequest(type)}
              disabled={active}
              className={`
                w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left
                transition-all active:scale-[0.98]
                ${active
                  ? "border-outline-variant/30 bg-surface-container opacity-60 cursor-default"
                  : "border-outline-variant/40 bg-surface-container-lowest shadow-level-1 hover:bg-surface-container hover:border-primary/40 hover:shadow-level-2"
                }
              `}
            >
              <span
                className={`material-symbols-outlined shrink-0 ${active ? "text-on-surface-variant/50" : "text-primary"}`}
                style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}
              >
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-headline-sm ${active ? "text-on-surface-variant" : "text-on-surface"}`} style={{ fontSize: 16 }}>
                  {label}
                </p>
                <p className="font-body-sm text-on-surface-variant mt-0.5" style={{ fontSize: 13 }}>
                  {active ? "Request sent — staff notified" : description}
                </p>
              </div>
              {active ? (
                <span className="material-symbols-outlined text-secondary shrink-0" style={{ fontSize: 20 }}>
                  check_circle
                </span>
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant/50 shrink-0" style={{ fontSize: 20 }}>
                  chevron_right
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="font-body-sm text-on-surface-variant/60 text-center mt-2" style={{ fontSize: 12 }}>
        You can send each request again after 30 seconds.
      </p>
    </div>
  );
}
