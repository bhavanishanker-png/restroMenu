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
      <body className="flex min-h-screen items-center justify-center bg-stone-50 p-6 font-sans">
        <div className="max-w-sm text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 text-lg font-semibold text-stone-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-stone-500">
            Our team has been notified. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-[#C2410C] px-5 py-2 text-sm font-medium text-white hover:bg-[#9a3209]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
