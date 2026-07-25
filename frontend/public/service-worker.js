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
