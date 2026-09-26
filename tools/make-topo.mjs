// Erzeugt die Höhenlinien-Textur für den Hintergrund.
// Start: node tools/make-topo.mjs
//
// Wertrauschen über ein umlaufendes Gitter -> nahtlos kachelbar.
// Marching Squares zieht daraus Isolinien, die zu Polylinien verkettet werden,
// damit die Datei klein bleibt.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../dist/assets', import.meta.url)));
const TILE = 620;   // Kantenlänge der Kachel in SVG-Einheiten
const GRID = 110;   // Abtastpunkte je Achse
const LEVELS = 11;  // Anzahl der Höhenlinien
const SEED = 20260926;

/* ---------- Wertrauschen mit umlaufendem Gitter ---------- */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const smooth = (t) => t * t * (3 - 2 * t);

// Ein Oktav: Gitter aus period×period Zufallswerten, an den Rändern umlaufend.
function octave(period, random) {
  const g = Array.from({ length: period }, () => Array.from({ length: period }, random));
  return (x, y) => {
    const fx = x * period, fy = y * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = g[y0 % period][x0 % period];
    const b = g[y0 % period][(x0 + 1) % period];
    const c = g[(y0 + 1) % period][x0 % period];
    const d = g[(y0 + 1) % period][(x0 + 1) % period];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

const random = rng(SEED);
const octaves = [[3, 1], [6, 0.5], [12, 0.25], [24, 0.12]].map(([p, w]) => [octave(p, random), w]);
const totalWeight = octaves.reduce((s, [, w]) => s + w, 0);
const field = (x, y) => octaves.reduce((s, [fn, w]) => s + fn(x, y) * w, 0) / totalWeight;

/* ---------- Abtasten ---------- */
const values = [];
for (let iy = 0; iy <= GRID; iy++) {
  const row = [];
  for (let ix = 0; ix <= GRID; ix++) row.push(field(ix / GRID, iy / GRID));
  values.push(row);
}
let min = Infinity, max = -Infinity;
for (const row of values) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }

/* ---------- Marching Squares ---------- */
const step = TILE / GRID;
const at = (ix, iy) => (values[iy][ix] - min) / (max - min || 1);
const lerp = (a, b, level) => (level - a) / (b - a || 1);

function segmentsFor(level) {
  const out = [];
  for (let iy = 0; iy < GRID; iy++) {
    for (let ix = 0; ix < GRID; ix++) {
      const tl = at(ix, iy), tr = at(ix + 1, iy), br = at(ix + 1, iy + 1), bl = at(ix, iy + 1);
      const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = ix * step, y = iy * step;
      const top = [x + lerp(tl, tr, level) * step, y];
      const right = [x + step, y + lerp(tr, br, level) * step];
      const bottom = [x + lerp(bl, br, level) * step, y + step];
      const left = [x, y + lerp(tl, bl, level) * step];
      const edges = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]],
        4: [[top, right]], 6: [[top, bottom]], 7: [[left, top]],
        8: [[left, top]], 9: [[top, bottom]], 11: [[top, right]],
        12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
        5: [[left, top], [bottom, right]], 10: [[left, bottom], [top, right]]
      }[code];
      for (const e of edges) out.push(e);
    }
  }
  return out;
}

/* ---------- Segmente zu Polylinien verketten ---------- */
const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
function chain(segments) {
  const ends = new Map();
  for (const seg of segments) {
    for (const p of [seg[0], seg[1]]) {
      const k = key(p);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(seg);
    }
  }
  const used = new Set();
  const lines = [];
  for (const seg of segments) {
    if (used.has(seg)) continue;
    used.add(seg);
    const line = [seg[0], seg[1]];
    // In beide Richtungen weiterlaufen, solange ein Anschluss existiert.
    for (const dir of [0, 1]) {
      for (;;) {
        const tip = dir ? line[0] : line[line.length - 1];
        const next = (ends.get(key(tip)) || []).find(s => !used.has(s));
        if (!next) break;
        used.add(next);
        const other = key(next[0]) === key(tip) ? next[1] : next[0];
        if (dir) line.unshift(other); else line.push(other);
      }
    }
    if (line.length > 3) lines.push(line);
  }
  return lines;
}

const paths = [];
for (let i = 1; i <= LEVELS; i++) {
  const level = i / (LEVELS + 1);
  for (const line of chain(segmentsFor(level))) {
    paths.push('M' + line.map(p => Math.round(p[0]) + ' ' + Math.round(p[1])).join('L'));
  }
}

/* ---------- Schreiben ---------- */
function svg(stroke, opacity) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">` +
    `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map(d => `<path d="${d}"/>`).join('') +
    `</g></svg>`;
}

mkdirSync(OUT, { recursive: true });
for (const [name, stroke, opacity] of [['topo.svg', '#edede6', '0.085'], ['topo-light.svg', '#0a0b0a', '0.075']]) {
  const content = svg(stroke, opacity);
  writeFileSync(resolve(OUT, name), content, 'utf8');
  console.log(name.padEnd(16), paths.length, 'Linien,', (content.length / 1024).toFixed(1) + ' KB');
}
