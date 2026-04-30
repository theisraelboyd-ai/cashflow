// Cash Flow service worker
// Strategy: cache-first for all same-origin resources, network fallback.
// Bumping CACHE_VERSION forces all clients to refetch on next visit.

const CACHE_VERSION = 'v1.2.1';
const CACHE_NAME = `cashflow-${CACHE_VERSION}`;

// Skip waiting so a new SW activates immediately on next page load
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Clean up old cache versions on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('cashflow-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only cache GET requests on our own origin or our assets path
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Don't cache cross-origin (Google Fonts etc) - browser handles those well already
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache-first: try cache, fall back to network, then cache the response
      const cached = await cache.match(request);
      if (cached) {
        // Background-update: refresh the cache silently for next visit
        // but don't block the response
        fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(request, res.clone());
            }
          })
          .catch(() => {});
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline and not cached - last-ditch fallback for navigation requests
        // is the cached index page
        if (request.mode === 'navigate') {
          const fallback = await cache.match('./');
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
