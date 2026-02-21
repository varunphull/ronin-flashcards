// Ronin's Maths Tool — Service Worker
// Version bump this string to force cache refresh after updates
const CACHE_NAME = 'ronins-maths-v4.0';

// All files to cache for offline use
const CACHE_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// ── INSTALL: cache all core files ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installing cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cache local files reliably, fonts best-effort
      return cache.addAll(['./index.html', './manifest.json']).then(function() {
        // Try to cache fonts but don't fail install if unavailable
        return cache.addAll([
          'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        ]).catch(function() {
          console.log('[SW] Font caching skipped (offline install)');
        });
      });
    }).then(function() {
      console.log('[SW] Install complete');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim(); // Take control immediately
    })
  );
});

// ── FETCH: cache-first for local, network-first for fonts ──
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and dev tool requests
  if (url.startsWith('chrome-extension') || url.includes('extension')) return;

  // For Google Fonts — network first, fall back to cache
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function() {
          return caches.match(event.request);
        })
    );
    return;
  }

  // For everything else — cache first, then network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve from cache, but also refresh in background
        const networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {});
        return cached;
      }
      // Not in cache — fetch from network
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        // Completely offline and not cached — return offline page
        return new Response(
          '<html><body style="background:#080d1a;color:#64748b;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h2 style="color:#a5b4fc">📶 You\'re offline</h2><p>Open the app once online to cache it for offline use.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    })
  );
});

// ── MESSAGE: allow manual cache refresh from the app ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
