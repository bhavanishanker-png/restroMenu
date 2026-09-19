"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/**
 * The resolved theme is unknown during SSR, so the first client render must
 * match the server or React will warn and the icon will flicker. We render a
 * correctly-sized inert placeholder until mounted — same box, no layout shift.
 */
export function ThemeToggle({ className }: Props) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light";

  if (!mounted) {
    return (
      <div
        className={cn("h-9 w-9 shrink-0 rounded-lg", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "relative grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        "border border-outline-variant/70 bg-surface-container-low/60 text-on-surface-variant",
        "transition-colors duration-fast ease-out-quart",
        "hover:bg-surface-container-high hover:text-on-surface",
        className
      )}
    >
      {/* Both icons are always mounted and cross-faded, so the button never
          reflows and the swap reads as one motion rather than a repaint. */}
      <Sun
        className={cn(
          "absolute h-[18px] w-[18px] transition-all duration-base ease-out-quart",
          isDark ? "scale-75 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
        aria-hidden="true"
      />
      <Moon
        className={cn(
          "absolute h-[18px] w-[18px] transition-all duration-base ease-out-quart",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-75 -rotate-90 opacity-0"
        )}
        aria-hidden="true"
      />
    </button>
  );
}
