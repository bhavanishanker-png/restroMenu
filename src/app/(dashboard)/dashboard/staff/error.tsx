"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Staff-route error boundary. Without it a failed query fell through to the
 * app-wide `global-error` (or, before, rendered as if there were no data).
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[staff] route error", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center shadow-level-1">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-error/25 bg-error-container text-on-error-container">
          <span className="material-symbols-outlined" style={{ fontSize: 26 }} aria-hidden="true">
            cloud_off
          </span>
        </span>
        <div className="space-y-1">
          <h2 className="font-display text-title text-on-surface">We couldn&apos;t load your team</h2>
          <p className="text-body-sm text-on-surface-variant">
            Nothing has been changed. Check your connection and try again.
          </p>
        </div>
        <Button variant="brand" size="touch" onClick={reset}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
            refresh
          </span>
          Try again
        </Button>
      </div>
    </div>
  );
}
