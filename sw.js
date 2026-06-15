/* ================================================================
   WealthFlow — sw.js
   Service Worker: cache-first per assets, network-first per API
   ================================================================ */

const CACHE_NAME = 'wealthflow-v1.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/mobile.css',
  './css/desktop.css',
  './js/utils.js',
  './js/auth.js',
  './js/drive.js',
  './js/quotes.js',
  './js/portfolio.js',
  './js/transactions.js',
  './js/charts.js',
  './js/app.js',
];

// ── Install ──────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin API calls (Google, Cloudflare Workers)
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin &&
      !url.hostname.endsWith('googleapis.com') &&
      !url.hostname.endsWith('gstatic.com') &&
      !url.hostname.endsWith('jsdelivr.net') &&
      !url.hostname.endsWith('sheetjs.com')) {
    return; // Let external requests (Drive API, Worker) go through normally
  }

  // For CDN resources: cache-first
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // For same-origin: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Stale-while-revalidate: return cache, update in background
        const networkFetch = fetch(event.request).then(res => {
          if (res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    }).catch(() =>
      caches.match('./index.html') // Offline fallback
    )
  );
});

// ── Background sync (future use) ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
