// Erzeugt alle Bild-Assets aus einer einzigen Geometrie-Definition.
// Start: node tools/make-icons.mjs
//
// dist/assets/  -> Icons für die Web-App und das Manifest
// assets/       -> Quellbilder für `npm run assets` (@capacitor/assets),
//                  das daraus die nativen Icon- und Splash-Varianten ableitet.
import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ICON_BG = [0x1c, 0x1f, 0x1d]; // Dunkelgrau, hebt sich auf dem Home-Bildschirm ab
const SPLASH_BG = [0x0f, 0x10, 0x10]; // App-Hintergrund, damit der Start nahtlos wirkt
const INK = [0xff, 0xff, 0xff];
const SS = 4; // Supersampling-Faktor für weiche Kanten

/* ---------- Geometrie im 1024er-Raster ---------- */
// Stoppuhr in Bewegung: Ring links offen, die obere und untere Tempo-Linie
// gehen nahtlos in die Ringenden über, die mittlere läuft in die Lücke.
// Der Zeiger ist die FORTH-TRACE-Bildmarke (Dolch), unverändert übernommen.
const W = 40;                 // einheitliche Strichstärke
const R = 265;                // Ringradius (Mitte des Strichs)
const CX = 592, CY = 558;     // so gewählt, dass das Motiv optisch mittig sitzt
const LINE_DY = 92;           // Abstand der äußeren Tempo-Linien zur Mitte
const HAND = 50;              // Zeigerstellung in Grad, 0 = oben
const MARK_PIVOT = [83.3, 83];  // Mitte des Ringknaufs im Pfad
const MARK_REACH = 825;         // Knaufmitte bis Spitze in Pfadeinheiten

// Übergang Linie -> Ring: Kreisbogen, der beide tangential berührt.
// Sein Mittelpunkt liegt FILLET über der Linie und R + FILLET vom Ringmittelpunkt.
const FILLET = 70;
const FILLET_Y = CY - LINE_DY - FILLET;
const FILLET_X = CX - Math.sqrt((R + FILLET) ** 2 - (LINE_DY + FILLET) ** 2);
const RING_GAP = Math.atan2(LINE_DY + FILLET, CX - FILLET_X); // halbe Öffnung ab 9 Uhr
const LINE_X0 = CX - 365;
const TOP = CY - R - W / 2;

const GLYPH = {
  lines: [
    [CX - 430, CY, CX - 235, CY]
  ],
  stem: [CX - W / 2, TOP - 72, CX + W / 2, TOP + W / 2],
  crown: [CX - 75, TOP - 92, CX + 75, TOP - 92 + W],
  mark: loadMark(),
  markScale: (R - W / 2 - 24) / MARK_REACH
};

// Die Marke ist sehr schlank. Damit sie neben den 40er-Strichen nicht verloren
// wirkt, wird ihr Umriss gleichmäßig um MARK_BOLD (im 1024er-Raster) verbreitert.
const MARK_BOLD = 5;

// Pfad der Bildmarke besteht nur aus M/L/Z – als Polygone für den Even-Odd-Test.
function loadMark() {
  const d = readFileSync(resolve(ROOT, 'assets/brand/mark-path.txt'), 'utf8');
  return d.split('Z').map((sub) => [...sub.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
    .map((m) => [Number(m[1]), Number(m[2])])).filter((p) => p.length > 2);
}

const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return dist2(x, y, cx, cy) <= r * r;
}

function inCapsule(x, y, x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / len2));
  return dist2(x, y, x0 + t * dx, y0 + t * dy) <= (w / 2) ** 2;
}

function inPolygons(x, y, polys) {
  let inside = false;
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function nearEdge(x, y, polys, d) {
  const d2 = d * d;
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [x0, y0] = p[j], [x1, y1] = p[i];
      const dx = x1 - x0, dy = y1 - y0;
      const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
      if (dist2(x, y, x0 + t * dx, y0 + t * dy) <= d2) return true;
    }
  }
  return false;
}

// Ring, äußere Tempo-Linien und die Ausrundung dazwischen bilden einen Strich
// konstanter Stärke. Die Ausrundung ist ein Kreisbogen (Radius FILLET), der die
// Linie und den Ring jeweils tangential berührt. Oben und unten sind
// spiegelgleich, deshalb wird nur die obere Hälfte geprüft.
function onArc(x, y) {
  const yy = CY - Math.abs(y - CY);
  const half = W / 2;
  // Ring außerhalb der Öffnung
  if (Math.abs(Math.atan2(y - CY, CX - x)) >= RING_GAP &&
      Math.abs(Math.sqrt(dist2(x, y, CX, CY)) - R) <= half) return true;
  // Linie bis zum Beginn der Ausrundung
  if (inCapsule(x, yy, LINE_X0, CY - LINE_DY, FILLET_X, CY - LINE_DY, W)) return true;
  // Ausrundung: nur der Sektor zwischen den beiden Berührpunkten
  if (Math.abs(Math.sqrt(dist2(x, yy, FILLET_X, FILLET_Y)) - FILLET) > half) return false;
  const px = x - FILLET_X, py = yy - FILLET_Y;
  const ax = 0, ay = 1;                                // Richtung zum Berührpunkt der Linie
  const bx = CX - FILLET_X, by = CY - FILLET_Y;        // Richtung zum Berührpunkt des Rings
  const cross = (ux, uy, vx, vy) => ux * vy - uy * vx;
  const s = Math.sign(cross(ax, ay, bx, by));
  return Math.sign(cross(ax, ay, px, py)) === s && Math.sign(cross(px, py, bx, by)) === s;
}

const COS = Math.cos(((HAND - 180) * Math.PI) / 180);
const SIN = Math.sin(((HAND - 180) * Math.PI) / 180);

// x, y im 1024er-Raster
function onGlyph(x, y) {
  if (onArc(x, y)) return true;
  for (const [x0, y0, x1, y1] of GLYPH.lines) if (inCapsule(x, y, x0, y0, x1, y1, W)) return true;
  const [sx0, sy0, sx1, sy1] = GLYPH.stem;
  if (inRoundRect(x, y, sx0, sy0, sx1, sy1, 4)) return true;
  const [cx0, cy0, cx1, cy1] = GLYPH.crown;
  if (inRoundRect(x, y, cx0, cy0, cx1, cy1, W / 2)) return true;
  // Rücktransformation in den Pfadraum der Bildmarke: verschieben, drehen, skalieren.
  const dx = x - CX, dy = y - CY;
  const mx = (dx * COS + dy * SIN) / GLYPH.markScale + MARK_PIVOT[0];
  const my = (-dx * SIN + dy * COS) / GLYPH.markScale + MARK_PIVOT[1];
  const pad = MARK_BOLD / GLYPH.markScale;
  if (mx < -pad || mx > 167 + pad || my < -pad || my > 909 + pad) return false;
  return inPolygons(mx, my, GLYPH.mark) || nearEdge(mx, my, GLYPH.mark, pad);
}

/* ---------- Rasterung ---------- */
// rounded:     abgerundete Ecken (sonst formatfüllendes Quadrat)
// glyph:       Motivgröße relativ zur Kantenlänge, 0 = nur Fläche
// transparent: Hintergrund freistellen (für Android-Adaptive-Icons)
// bg:          Hintergrundfarbe
function render(size, { rounded = false, glyph = 1, transparent = false, bg = ICON_BG } = {}) {
  const BG = bg;
  const ACCENT = INK;
  const g = glyph > 0;
  // Pixel -> 1024er-Raster, das Motiv um die Bildmitte auf `glyph` skaliert.
  const toGrid = (v) => 512 + (v / size - 0.5) * 1024 / glyph;
  const corner = rounded ? size * 0.225 : 0;
  const rgba = Buffer.alloc(size * size * 4);
  // Begrenzungsrahmen des Motivs, damit große Flächen nicht supergesampelt werden.
  const pad = 0.42 * glyph;
  const box = { x0: (0.5 - pad) * size, x1: (0.5 + pad) * size, y0: (0.5 - pad) * size, y1: (0.5 + pad) * size };
  const total = SS * SS;

  for (let py = 0; py < size; py++) {
    const farY = py + 1 < box.y0 || py > box.y1;
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const plain = !rounded && (!g || farY || px + 1 < box.x0 || px > box.x1);

      if (plain) { // reine Hintergrundfläche – ein Sample genügt
        if (transparent) continue;
        rgba[i] = BG[0]; rgba[i + 1] = BG[1]; rgba[i + 2] = BG[2]; rgba[i + 3] = 255;
        continue;
      }

      let bgHits = 0, fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = px + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          if (rounded && !inRoundRect(fx, fy, 0, 0, size, size, corner)) continue;
          bgHits++;
          if (g && onGlyph(toGrid(fx), toGrid(fy))) fgHits++;
        }
      }
      if (!bgHits) continue; // außerhalb der Rundung: transparent

      if (transparent) {
        // Nur das Motiv bleibt stehen, die Fläche wird freigestellt.
        rgba[i] = ACCENT[0]; rgba[i + 1] = ACCENT[1]; rgba[i + 2] = ACCENT[2];
        rgba[i + 3] = Math.round((fgHits / total) * 255);
        continue;
      }
      const fg = fgHits / bgHits;
      for (let ch = 0; ch < 3; ch++) rgba[i + ch] = Math.round(BG[ch] * (1 - fg) + ACCENT[ch] * fg);
      rgba[i + 3] = Math.round((bgHits / total) * 255);
    }
  }
  return rgba;
}

/* ---------- PNG-Kodierung ---------- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// App Store Connect weist Icons mit Alphakanal zurück – `alpha:false`
// kodiert als RGB (Farbtyp 2) und blendet vorher auf den Hintergrund.
function png(size, rgba, alpha = true, BG = ICON_BG) {
  const channels = alpha ? 4 : 3;
  const stride = size * channels + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // Filter: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * stride + 1 + x * channels;
      if (alpha) {
        rgba.copy(raw, dst, src, src + 4);
      } else {
        const a = rgba[src + 3] / 255;
        for (let ch = 0; ch < 3; ch++) raw[dst + ch] = Math.round(rgba[src + ch] * a + BG[ch] * (1 - a));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;              // Bittiefe
  ihdr[9] = alpha ? 6 : 2;  // RGBA bzw. RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- Ausgabe ---------- */
const targets = [
  // Web-App und Manifest
  ['dist/assets/icon-192.png', 192, { rounded: true }, true],
  ['dist/assets/icon-512.png', 512, { rounded: true }, true],
  ['dist/assets/icon-maskable-512.png', 512, { glyph: 0.76 }, true],
  ['dist/assets/icon-appstore-1024.png', 1024, {}, false],
  // iOS nimmt fuer den Home-Bildschirm dieses Bild, nicht das Manifest.
  ['dist/assets/apple-touch-icon.png', 180, { square: true }, false],
  // Quellbilder für @capacitor/assets
  ['assets/icon-only.png', 1024, {}, false],
  ['assets/icon-foreground.png', 1024, { glyph: 0.62, transparent: true }, true],
  ['assets/icon-background.png', 1024, { glyph: 0 }, false],
  ['assets/splash.png', 2732, { glyph: 0.2, bg: SPLASH_BG }, false],
  ['assets/splash-dark.png', 2732, { glyph: 0.2, bg: SPLASH_BG }, false]
];

for (const [rel, size, opts, alpha] of targets) {
  const file = resolve(ROOT, rel);
  mkdirSync(resolve(file, '..'), { recursive: true });
  const started = Date.now();
  writeFileSync(file, png(size, render(size, opts), alpha, opts.bg));
  console.log(`${rel.padEnd(36)} ${size}px ${alpha ? 'RGBA' : 'RGB '} ${Date.now() - started}ms`);
}
