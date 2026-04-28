// AdorAPP service worker — minimal, hand-rolled.
//
// Strategy:
//   * Navigation requests (HTML)        → network-first, cache fallback.
//     Keeps users on the latest build but lets them open the app offline
//     using the last good HTML.
//   * Same-origin /assets/* (hashed JS/CSS/font/image) → cache-first.
//     Vite emits new filenames per build, so old hashes can sit in the cache
//     forever without ever serving stale content. New HTML requests new hashes.
//   * Other static images at /             → cache-first.
//   * Anything cross-origin (Supabase, Sentry-style URLs, etc.) → bypass.
//     We deliberately do NOT cache Supabase responses: RLS-scoped data must
//     never be served to the wrong user.
//
// On activate, old caches are pruned. clients.claim() so the new SW takes
// over immediately when the user accepts the "update available" prompt.

const CACHE_VERSION = 'v3';
const SHELL_CACHE = `adorapp-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `adorapp-assets-${CACHE_VERSION}`;
const IMAGE_CACHE = `adorapp-images-${CACHE_VERSION}`;

const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// Allow the page to ask the waiting SW to take over right now.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isAssetRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}
function isImageRequest(url) {
  return (
    url.origin === self.location.origin &&
    /\.(png|jpe?g|svg|webp|ico|woff2?)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin (Supabase, fonts CDN, etc.) — let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, cache fallback (last-good HTML).
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const c = await caches.open(SHELL_CACHE);
          c.put('/index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Hashed assets — cache-first, populate on first hit.
  if (isAssetRequest(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const c = await caches.open(ASSET_CACHE);
            c.put(req, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          return new Response('', { status: 504 });
        }
      })()
    );
    return;
  }

  // Static images / fonts at root — cache-first.
  if (isImageRequest(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const c = await caches.open(IMAGE_CACHE);
            c.put(req, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          return new Response('', { status: 504 });
        }
      })()
    );
  }
});
