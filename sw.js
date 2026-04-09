var CACHE_NAME = 'thanotectas-v2';
var OFFLINE_URL = '/offline.html';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(['/', '/offline.html', '/manifest.json']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = event.request.url;
  // Skip non-http schemes, API calls, and Supabase
  if (!url.startsWith('http') || url.includes('supabase.co') || url.includes('.netlify/functions') || url.includes('googleapis.com') || url.includes('chrome-extension')) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.status === 200 && url.startsWith(self.location.origin)) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          try { cache.put(event.request, clone); } catch(e) {}
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_URL);
      });
    })
  );
});
