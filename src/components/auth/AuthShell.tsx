import type { ReactNode } from "react";
import { Aurora } from "@/components/aceternity/Aurora";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Shared frame for the staff and platform-admin sign-in screens. Both used to
 * hardcode a stone dot-grid as an inline style, which meant neither responded
 * to the theme at all.
 *
 * Server component — the backdrop is CSS and SVG only. Decoration sits behind
 * a `relative z-10` card and is `aria-hidden`, so nothing here reaches the
 * accessibility tree or intercepts a click.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-margin-mobile md:p-margin-desktop">
      {/* Backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-dot-grid mask-radial" />
        <Aurora />
      </div>

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative z-10 w-full max-w-md">{children}</main>
    </div>
  );
}
