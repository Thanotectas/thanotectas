// Thanotectas — Service Worker v3
// Estrategia: Network-first para todo lo dinámico (HTML, auth, Supabase).
// Caché solo para iconos y manifest. Las páginas HTML NUNCA se sirven desde caché
// para evitar problemas de sesión y datos viejos.

var CACHE_NAME = 'thanotectas-v3';
var OFFLINE_URL = '/offline.html';

// Solo cacheamos estos recursos estáticos críticos al instalar
var PRECACHE = [
  '/offline.html',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    Promise.all([
      // Borra todas las versiones anteriores del caché
      caches.keys().then(function(names) {
        return Promise.all(
          names.filter(function(n) { return n !== CACHE_NAME; })
               .map(function(n) {
                 console.log('[SW] Borrando caché viejo:', n);
                 return caches.delete(n);
               })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Escucha mensajes de la app para forzar actualización
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function esHTML(req) {
  var accept = req.headers.get('accept') || '';
  return req.mode === 'navigate' || accept.indexOf('text/html') !== -1;
}

function esEstaticoCacheable(url) {
  return url.pathname === '/manifest.json'
      || url.pathname.indexOf('/icons/') === 0
      || /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url;
  try { url = new URL(event.request.url); } catch(e) { return; }

  // Skip: schemes raros, otros dominios que no son el nuestro para assets,
  // Supabase, Netlify functions, Google APIs, extensiones
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname.indexOf('supabase.co') !== -1) return;
  if (url.hostname.indexOf('googleapis.com') !== -1) return;
  if (url.hostname.indexOf('gstatic.com') !== -1) return;
  if (url.hostname.indexOf('bold.co') !== -1) return;
  if (url.hostname.indexOf('jsdelivr.net') !== -1) return;
  if (url.pathname.indexOf('/.netlify/functions') === 0) return;

  // Estrategia 1: HTML → SIEMPRE red, nunca caché. Si falla red, offline.html
  if (esHTML(event.request)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(function() {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Estrategia 2: Assets estáticos (iconos, fuentes locales) → cache-first
  if (esEstaticoCacheable(url) && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              try { cache.put(event.request, clone); } catch(e) {}
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Todo lo demás: pasar directo a red, sin tocarlo
});
