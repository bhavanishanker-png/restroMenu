"use client";

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
    <header className="flex items-center justify-between border-b border-outline-variant/30 bg-surface h-16 px-md shadow-level-1 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-sm">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}
        >
          restaurant_menu
        </span>
        <div>
          <p className="font-headline-sm text-on-surface leading-none" style={{ fontSize: 16 }}>
            {restaurantName}
          </p>
          <p className="font-body-sm text-on-surface-variant text-xs">Kitchen Display</p>
        </div>
      </div>

      {/* Clock */}
      <span
        className="font-mono font-medium text-on-surface-variant hidden sm:block"
        style={{ fontSize: 15 }}
        suppressHydrationWarning
      >
        {now === 0 ? "--:--:-- --" : formatClock(now)}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-sm">
        {/* Online badge */}
        <div
          className={`flex items-center gap-xs px-sm py-xs rounded-full font-label-bold text-xs ${
            isOnline
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-error-container text-on-error-container"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isOnline ? "bg-secondary animate-pulse" : "bg-error"}`}
          />
          {isOnline ? "Online" : "Offline"}
        </div>

        {/* Sound toggle */}
        <button
          onClick={onToggleSound}
          className="flex items-center gap-xs rounded-lg px-sm py-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors h-9"
          aria-label={soundEnabled ? "Mute chime" : "Enable chime"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {soundEnabled ? "volume_up" : "volume_off"}
          </span>
          <span className="hidden sm:inline font-label-bold text-label-bold">
            {soundEnabled ? "Sound on" : "Sound off"}
          </span>
        </button>
      </div>
    </header>
  );
}
