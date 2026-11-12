/* Erzeugt von tools/make-sw.mjs – nicht von Hand ändern. */
const VERSION = 'shot-timer-a6573050fc';
const ASSETS = [
  "./",
  "assets/apple-touch-icon.png",
  "assets/fonts/OFL-montserrat.txt",
  "assets/fonts/montserrat-latin-ext.woff2",
  "assets/fonts/montserrat-latin.woff2",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-appstore-1024.png",
  "assets/icon-maskable-512.png",
  "assets/lang/cs.js",
  "assets/lang/en.js",
  "assets/lang/es.js",
  "assets/lang/fr.js",
  "assets/lang/it.js",
  "assets/lang/nl.js",
  "assets/lang/pl.js",
  "assets/lang/pt.js",
  "assets/lang/sv.js",
  "assets/pact-beep.mp3",
  "assets/standby.mp3",
  "assets/topo-light.svg",
  "assets/topo.svg",
  "assets/video.js",
  "index.html",
  "manifest.webmanifest",
  "privacy.html",
  "support.html"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      // cache: 'reload' umgeht den HTTP-Cache, damit nie alte und neue Dateien gemischt werden.
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
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

  // Auch die Seite selbst kommt aus dem Cache dieser Version: Seite und
  // Skripte passen so immer zusammen. Eine neue Version installiert sich im
  // Hintergrund; die Seite lädt dann einmal neu (siehe index.html).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(VERSION)
        .then(cache => cache.match('./'))
        .then(hit => hit || fetch(request))
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
