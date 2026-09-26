// Erzeugt den Service Worker aus dem tatsächlichen Inhalt von dist/.
// Start: node tools/make-sw.mjs
//
// Die Dateiliste wird gescannt statt gepflegt – sonst vergisst man beim
// Hinzufügen einer Datei den Eintrag und die App fällt offline aus.
// Die Version ist ein Hash über alle Inhalte und ändert sich damit genau
// dann, wenn sich wirklich etwas geändert hat.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
// Nicht in den Cache: der Service Worker selbst und Beiwerk ohne Laufzeitnutzen.
const SKIP = new Set(['sw.js', 'assets/fonts/font-face.css', 'assets/fonts/OFL.txt']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST)
  .map(f => relative(DIST, f).split('\\').join('/'))
  .filter(f => !SKIP.has(f))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(resolve(DIST, f)));
const version = hash.digest('hex').slice(0, 10);

const sw = `/* Erzeugt von tools/make-sw.mjs – nicht von Hand ändern. */
const VERSION = 'shot-timer-${version}';
const ASSETS = ${JSON.stringify(['./', ...files], null, 2).replace(/\n/g, '\n')};

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
`;

writeFileSync(resolve(DIST, 'sw.js'), sw, 'utf8');
console.log('sw.js geschrieben – Version', version + ',', files.length, 'Dateien im Cache');
for (const f of files) console.log('  ', f);
