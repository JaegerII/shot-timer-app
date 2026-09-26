/* Erzeugt von tools/make-sw.mjs – nicht von Hand ändern. */
const VERSION = 'shot-timer-ce719b7cf4';
const ASSETS = [
  "./",
  "assets/apple-touch-icon.png",
  "assets/fonts/montserrat-latin-ext.woff2",
  "assets/fonts/montserrat-latin.woff2",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-appstore-1024.png",
  "assets/icon-maskable-512.png",
  "assets/pact-beep.mp3",
  "assets/standby.mp3",
  "assets/topo-light.svg",
  "assets/topo.svg",
  "index.html",
  "manifest.webmanifest"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Die Seite selbst zuerst aus dem Netz, damit Aktualisierungen ankommen;
  // ohne Netz aus dem Cache. Alles andere zuerst aus dem Cache, das ist
  // am Schießstand der Normalfall.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
