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

const CACHE_VERSION = 'v4';
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

  // (push handlers below — they don't intercept fetch.)
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

// ---- Web Push -------------------------------------------------------------
// Server posts an empty push (no payload encryption) and the SW shows a
// generic notification. If we ever switch to encrypted payloads, parse from
// `event.data` here. Title/body live in the SW so we don't need encryption
// to render something useful.

self.addEventListener('push', (event) => {
  let title = 'AdorAPP';
  let body = 'Tenés una novedad';
  let url = '/';
  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.title) title = payload.title;
      if (payload.body) body = payload.body;
      if (payload.url) url = payload.url;
    } catch {
      // If payload isn't JSON, fall back to defaults.
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/adorapp-logo.png',
      badge: '/adorapp-logo.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab on the same origin if there's one.
      for (const c of all) {
        if (c.url && new URL(c.url).origin === self.location.origin) {
          c.focus();
          c.navigate?.(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
