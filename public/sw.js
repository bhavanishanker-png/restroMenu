// Bump this on any release that changes the app shell. `activate` deletes
// every cache whose key differs from this one, so a version bump is what
// evicts stale assets from clients that already have the old worker installed
// — without it, returning users can be pinned to pre-release chunks.
// v2: full visual redesign (design tokens, fonts, dark default).
const CACHE = "qbite-shell-v2";

// Cache-first on /_next/static/ below is only safe because production build
// output is content-hashed. This worker must never run against `next dev`,
// where those paths are stable and their contents change on every recompile;
// registration is gated to production in ServiceWorkerRegistration.tsx.

// App-shell assets to pre-cache on install
const PRECACHE = ["/", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept API, auth, or cross-origin requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Static assets (_next/static): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network-first, fall back to cache
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
