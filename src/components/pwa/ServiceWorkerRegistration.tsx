"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker — in production only.
 *
 * It used to register unconditionally, which broke local development in a way
 * that looked like a build bug. `public/sw.js` serves `/_next/static/**`
 * cache-first under a cache name that never changes. In a production build
 * those URLs are content-hashed, so that is correct and fast. In development
 * Next serves `webpack.js`, `main-app.js` and friends at *stable, unhashed*
 * paths whose contents change on every recompile — so the worker pinned the
 * very first `webpack.js` it saw and kept serving it forever. The HTML and RSC
 * payload then referenced module ids that the stale module table did not have,
 * and webpack blew up with:
 *
 *     TypeError: Cannot read properties of undefined (reading 'call')
 *         at options.factory (webpack.js)
 *
 * Deleting `.next` never fixed it, because the stale copy lived in the
 * browser's Cache Storage rather than on disk.
 *
 * In development this registers nothing. Tearing down a worker left over from
 * a previous session is handled by an inline script in the root layout rather
 * than here — when the stale chunk wins, React never finishes rendering, so an
 * effect in this component would never run and the app could not recover
 * itself. The guard below is kept as a second line of defence.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((r) => r.unregister()))
        )
        .then(() => {
          if (!("caches" in window)) return undefined;
          return caches
            .keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        })
        .catch((err) => console.warn("[SW] dev teardown failed:", err));
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[SW] registration failed:", err));
  }, []);

  return null;
}
