import type { ReactNode } from "react";
import Link from "next/link";
import { InteractiveGrid } from "@/components/aceternity/InteractiveGrid";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Shared frame for the staff and platform-admin sign-in screens.
 *
 * Server component. The backdrop is the cursor-reactive line grid scoped to
 * this frame — calmer than the old Aurora colour wash, and it reads the same
 * in both themes. Decoration is `aria-hidden` and `pointer-events-none`, so
 * nothing here reaches the accessibility tree or intercepts a click.
 *
 * `aside` is optional: when passed (the staff login does) it shows beside the
 * form from `lg` up and is hidden on smaller screens, where the form is the
 * whole job.
 */
export function AuthShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <InteractiveGrid scope="parent" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand/[0.06] to-transparent"
      />

      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-4 md:px-6">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            arrow_back
          </span>
          <span className="text-body-sm">Back to home</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-margin-mobile pb-10 md:px-margin-desktop">
        {aside ? (
          <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_minmax(0,28rem)]">
            <div className="hidden lg:block">{aside}</div>
            <main className="mx-auto w-full min-w-0 max-w-md">{children}</main>
          </div>
        ) : (
          <main className="w-full max-w-md">{children}</main>
        )}
      </div>
    </div>
  );
}
