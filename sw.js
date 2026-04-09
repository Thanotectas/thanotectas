var CACHE_NAME = 'thanotectas-v1';
var OFFLINE_URL = '/offline.html';

var PRECACHE_URLS = [
  '/',
  '/oraculo.html',
  '/panel.html',
  '/cuenta.html',
  '/offline.html',
  '/manifest.json'
];

// Install — cache essential files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase and API calls
  var url = event.request.url;
  if (url.includes('supabase.co') || url.includes('.netlify/functions') || url.includes('googleapis.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Cache successful responses
        if (response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        // Offline — try cache
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // Show offline page for navigation
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});
