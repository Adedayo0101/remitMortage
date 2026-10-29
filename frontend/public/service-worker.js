const CACHE_NAME = 'remitmortgage-offline-v1';
const RUNTIME_CACHE = 'remitmortgage-runtime-v1';

// Resources to cache on install
const STATIC_CACHE_URLS = [
  '/',
  '/offline',
];

// API endpoints to cache for offline access
const CACHE_API_PATTERNS = [
  /\/api\/loans\/.*/,
  /\/api\/borrower\/profile/,
  /\/api\/verification\/history/,
  /\/api\/dashboard\/metrics/,
  /\/api\/deposits\/.*/,
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static resources');
      return cache.addAll(STATIC_CACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName.startsWith('remitmortgage-') && 
                   cacheName !== CACHE_NAME && 
                   cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Check if this is a cacheable API endpoint
  const isCacheableApi = CACHE_API_PATTERNS.some((pattern) => 
    pattern.test(url.pathname)
  );

  if (isCacheableApi) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) => {
        return fetch(request)
          .then((response) => {
            // Clone the response before caching
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // Network failed - try cache
            return cache.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                console.log('[ServiceWorker] Serving from cache:', url.pathname);
                // Add custom header to indicate offline response
                const headers = new Headers(cachedResponse.headers);
                headers.append('X-Served-From', 'cache');
                return new Response(cachedResponse.body, {
                  status: cachedResponse.status,
                  statusText: cachedResponse.statusText,
                  headers: headers,
                });
              }
              // No cache available - return offline response
              return new Response(
                JSON.stringify({ 
                  error: 'Offline', 
                  message: 'Data not available offline' 
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            });
          });
      })
    );
  } else {
    // For non-API requests, use cache-first strategy
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request);
      })
    );
  }
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('remitmortgage-')) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  }
});

// ── Web Push ────────────────────────────────────────────────────────────────
// The backend filters deliveries against each subscriber's topic preferences,
// so anything arriving here is already something the user opted into. The
// topic is still read off the payload to route the click and tag the toast.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Some push services deliver plain text; fall back to showing it as the body.
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'RemitMortgage';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/globe.svg',
    badge: payload.badge || '/globe.svg',
    // Tagging by topic collapses repeat alerts of the same kind instead of
    // stacking a notification per event.
    tag: payload.topic || 'remitmortgage',
    renotify: Boolean(payload.renotify),
    timestamp: payload.timestamp || Date.now(),
    data: {
      url: payload.url || '/dashboard',
      topic: payload.topic || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/dashboard';

  // Focus an existing tab on the same origin rather than opening a duplicate.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const sameOrigin = new URL(client.url).origin === self.location.origin;
          if (sameOrigin && 'focus' in client) {
            if ('navigate' in client) {
              return client.navigate(target).then((navigated) => navigated && navigated.focus());
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

// A subscription can be rotated by the push service without user action; tell
// the app so it can re-register the new endpoint on next load.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
      }
    })
  );
});
