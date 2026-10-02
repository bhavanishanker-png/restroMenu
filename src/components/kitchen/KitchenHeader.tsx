"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  restaurantName: string;
  isOnline: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  now: number;
  serviceRequestCount: number;
  onServiceRequestsClick: () => void;
  /** Orders not yet served or cancelled. */
  activeCount: number;
  /** Active orders past the 15-minute amber threshold. */
  lateCount: number;
};

function formatClock(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// Every control meets the 60px kitchen tap target — the header is touched
// with wet or gloved hands just as often as the cards are.
const CONTROL =
  "relative flex h-[60px] min-w-[60px] items-center justify-center gap-2 rounded-xl px-3 font-label-bold text-on-surface-variant transition-colors duration-fast hover:bg-surface-container hover:text-on-surface";

function Icon({ name, filled = false }: { name: string; filled?: boolean }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontSize: 24, fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/**
 * Fullscreen hides the browser chrome on a wall-mounted tablet. iPad Safari
 * has no Fullscreen API for documents, so the control only renders where it
 * can actually work.
 */
function useFullscreen() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    request.catch((err: unknown) => {
      console.error("Fullscreen toggle failed", err);
      toast.error("Couldn't switch full screen. Use the browser menu instead.");
    });
  }, []);

  return { supported, active, toggle };
}

export function KitchenHeader({
  restaurantName,
  isOnline,
  soundEnabled,
  onToggleSound,
  now,
  serviceRequestCount,
  onServiceRequestsClick,
  activeCount,
  lateCount,
}: Props) {
  const fullscreen = useFullscreen();

  return (
    <header className="flex h-[84px] shrink-0 items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-3 shadow-level-1">
      {/* Exit + identity */}
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          className={cn(CONTROL, "border border-outline-variant bg-surface-container-lowest")}
          aria-label="Back to dashboard"
        >
          <Icon name="arrow_back" />
          <span className="hidden text-[16px] lg:inline">Dashboard</span>
        </Link>

        <div className="min-w-0">
          <p className="truncate font-display text-[20px] font-bold leading-tight text-on-surface">
            {restaurantName}
          </p>
          <p className="flex items-center gap-1.5 text-[14px] text-on-surface-variant">
            <span
              className={cn("h-2 w-2 rounded-full", isOnline ? "bg-success animate-pulse" : "bg-error")}
              aria-hidden="true"
            />
            {/* The word carries the state; the dot only reinforces it. */}
            Kitchen display · {isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      {/* Live summary — what a head chef glances at from across the pass. */}
      <div className="hidden items-center gap-2 md:flex">
        <span
          className="font-mono text-[24px] font-bold tabular-nums text-on-surface"
          suppressHydrationWarning
        >
          {now === 0 ? "--:-- --" : formatClock(now)}
        </span>
        <span className="mx-1 h-8 w-px bg-outline-variant" aria-hidden="true" />
        <span className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-[16px] font-semibold text-on-surface">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
            receipt_long
          </span>
          {activeCount} active
        </span>
        {lateCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-container px-3 py-1.5 text-[16px] font-semibold text-on-warning-container">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
              timer
            </span>
            {lateCount} running late
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onServiceRequestsClick}
          className={CONTROL}
          aria-label={`Table requests — ${serviceRequestCount} pending`}
        >
          <Icon name="notifications" filled={serviceRequestCount > 0} />
          <span className="hidden text-[16px] lg:inline">Requests</span>
          {serviceRequestCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-on-error">
              {serviceRequestCount > 9 ? "9+" : serviceRequestCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleSound}
          className={cn(CONTROL, soundEnabled && "text-brand-text")}
          aria-label={soundEnabled ? "Mute new-order chime" : "Turn on new-order chime"}
          aria-pressed={soundEnabled}
        >
          <Icon name={soundEnabled ? "volume_up" : "volume_off"} />
          <span className="hidden text-[16px] lg:inline">
            {soundEnabled ? "Sound on" : "Sound off"}
          </span>
        </button>

        {fullscreen.supported && (
          <button
            type="button"
            onClick={fullscreen.toggle}
            className={CONTROL}
            aria-label={fullscreen.active ? "Exit full screen" : "Enter full screen"}
          >
            <Icon name={fullscreen.active ? "fullscreen_exit" : "fullscreen"} />
          </button>
        )}
      </div>
    </header>
  );
}
