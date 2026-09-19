"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-surface-container-low p-6 font-sans">
        <div className="max-w-sm text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 text-lg font-semibold text-on-surface">Something went wrong</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Our team has been notified. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-on-surface px-5 py-2 text-sm font-medium text-surface-container-lowest hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
