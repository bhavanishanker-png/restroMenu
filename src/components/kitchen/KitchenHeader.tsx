"use client";

import { Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";

type Props = {
  restaurantName: string;
  isOnline: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  now: number;
};

function formatClock(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m}:${s} ${ampm}`;
}

export function KitchenHeader({
  restaurantName,
  isOnline,
  soundEnabled,
  onToggleSound,
  now,
}: Props) {
  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2 shadow-sm">
      <span className="text-base font-bold text-[#C2410C]">{restaurantName}</span>

      <span className="font-mono text-sm font-medium text-stone-600">
        {formatClock(now)}
      </span>

      <div className="flex items-center gap-3">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" aria-label="Online" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500" aria-label="Offline" />
        )}

        <button
          onClick={onToggleSound}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
          aria-label={soundEnabled ? "Mute chime" : "Enable chime"}
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-[#C2410C]" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {soundEnabled ? "Sound on" : "Sound off"}
          </span>
        </button>
      </div>
    </header>
  );
}
