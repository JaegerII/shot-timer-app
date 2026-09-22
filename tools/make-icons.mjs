// Erzeugt die App-Icons aus einer einzigen Geometrie-Definition.
// Start: node tools/make-icons.mjs
// Ausgabe: dist/assets/icon-{192,512,1024}.png und dist/assets/icon-maskable-512.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../dist/assets', import.meta.url)));
const BG = [0x09, 0x0b, 0x0c];
const ACCENT = [0xc8, 0xff, 0x24];
const SS = 4; // Supersampling-Faktor für weiche Kanten

/* ---------- Geometrie in Einheitskoordinaten (0..1) ---------- */
// `safe` verkleinert das Motiv, damit es im maskable-Icon innerhalb des
// sicheren Kreises (80 % der Fläche) bleibt.
function shapes(safe) {
  const c = 0.5;
  const s = (v) => c + (v - c) * safe;
  const k = (v) => v * safe;
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

// Liefert null (Hintergrund) oder ACCENT für einen Punkt in Einheitskoordinaten.
function sample(x, y, g) {
  const { ring, stem, crown, hand } = g;
  const d = Math.sqrt(dist2(x, y, ring.x, ring.y));
  if (Math.abs(d - ring.r) <= ring.w / 2) return ACCENT;
  if (inRoundRect(x, y, stem.x0, stem.y0, stem.x1, stem.y1, (stem.x1 - stem.x0) / 2)) return ACCENT;
  if (inRoundRect(x, y, crown.x0, crown.y0, crown.x1, crown.y1, (crown.y1 - crown.y0) / 2)) return ACCENT;
  if (inCapsule(x, y, hand.x0, hand.y0, hand.x1, hand.y1, hand.w)) return ACCENT;
  return null;
}

/* ---------- Rasterung ---------- */
// `maskable`: Android-Maske, Motiv auf 76 % verkleinert, keine Rundung.
// `square`:   App-Store-Vorgabe – volle Fläche, keine Rundung, keine Transparenz.
function render(size, { maskable = false, square = false } = {}) {
  const flat = maskable || square;
  const g = shapes(maskable ? 0.76 : 1);
  const corner = flat ? 0 : size * 0.225;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0, fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = px + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          const inside = flat || inRoundRect(fx, fy, 0, 0, size, size, corner);
          if (!inside) continue;
          bgHits++;
          if (sample(fx / size, fy / size, g)) fgHits++;
        }
      }
      const total = SS * SS;
      const i = (py * size + px) * 4;
      if (!bgHits) continue; // transparent außerhalb der Rundung
      const fg = fgHits / bgHits;
      for (let ch = 0; ch < 3; ch++) {
        rgba[i + ch] = Math.round(BG[ch] * (1 - fg) + ACCENT[ch] * fg);
      }
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
mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-1024.png', 1024, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['icon-appstore-1024.png', 1024, { square: true }]
];
for (const [name, size, opts] of targets) {
  const file = resolve(OUT, name);
  writeFileSync(file, png(size, render(size, opts), !opts.square));
  console.log('geschrieben:', name, size + 'px', opts.square ? '(RGB, ohne Alpha)' : '');
}
