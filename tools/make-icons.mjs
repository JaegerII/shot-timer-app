// Erzeugt alle Bild-Assets aus einer einzigen Geometrie-Definition.
// Start: node tools/make-icons.mjs
//
// dist/assets/  -> Icons für die Web-App und das Manifest
// assets/       -> Quellbilder für `npm run assets` (@capacitor/assets),
//                  das daraus die nativen Icon- und Splash-Varianten ableitet.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BG = [0x09, 0x0b, 0x0c];
const ACCENT = [0xff, 0x31, 0x31];
const SS = 4; // Supersampling-Faktor für weiche Kanten

/* ---------- Geometrie in Einheitskoordinaten (0..1) ---------- */
// `scale` verkleinert das Motiv um den Mittelpunkt: 1 = formatfüllend,
// 0.76 = innerhalb der Android-Maske, 0.2 = kleines Logo auf dem Splash.
function shapes(scale) {
  const c = 0.5;
  const s = (v) => c + (v - c) * scale;
  const k = (v) => v * scale;
  return {
    ring: { x: c, y: s(0.565), r: k(0.255), w: k(0.09) },
    stem: { x0: c - k(0.043), x1: c + k(0.043), y0: s(0.175), y1: s(0.325) },
    crown: { x0: c - k(0.125), x1: c + k(0.125), y0: s(0.13), y1: s(0.185) },
    hand: { x0: c, y0: s(0.565), x1: c + k(0.135), y1: s(0.45), w: k(0.088) }
  };
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

function onGlyph(x, y, g) {
  const { ring, stem, crown, hand } = g;
  if (Math.abs(Math.sqrt(dist2(x, y, ring.x, ring.y)) - ring.r) <= ring.w / 2) return true;
  if (inRoundRect(x, y, stem.x0, stem.y0, stem.x1, stem.y1, (stem.x1 - stem.x0) / 2)) return true;
  if (inRoundRect(x, y, crown.x0, crown.y0, crown.x1, crown.y1, (crown.y1 - crown.y0) / 2)) return true;
  if (inCapsule(x, y, hand.x0, hand.y0, hand.x1, hand.y1, hand.w)) return true;
  return false;
}

/* ---------- Rasterung ---------- */
// rounded:     abgerundete Ecken (sonst formatfüllendes Quadrat)
// glyph:       Motivgröße relativ zur Kantenlänge, 0 = nur Fläche
// transparent: Hintergrund freistellen (für Android-Adaptive-Icons)
function render(size, { rounded = false, glyph = 1, transparent = false } = {}) {
  const g = glyph > 0 ? shapes(glyph) : null;
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
          if (g && onGlyph(fx / size, fy / size, g)) fgHits++;
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
function png(size, rgba, alpha = true) {
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
  ['assets/splash.png', 2732, { glyph: 0.2 }, false],
  ['assets/splash-dark.png', 2732, { glyph: 0.2 }, false]
];

for (const [rel, size, opts, alpha] of targets) {
  const file = resolve(ROOT, rel);
  mkdirSync(resolve(file, '..'), { recursive: true });
  const started = Date.now();
  writeFileSync(file, png(size, render(size, opts), alpha));
  console.log(`${rel.padEnd(36)} ${size}px ${alpha ? 'RGBA' : 'RGB '} ${Date.now() - started}ms`);
}
