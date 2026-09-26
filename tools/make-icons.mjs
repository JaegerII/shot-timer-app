// Erzeugt alle App-Symbole und Splash-Quellbilder aus der Bildmarke.
// Start: node tools/make-icons.mjs
//
// Die Bildmarke ist der Dolch mit Ringknauf des FORTH-TRACE-Systems. Ihr Pfad
// liegt als assets/brand/mark-path.txt im Projekt und wird laut System nicht
// nachgezeichnet. Farbe: Sage auf Ink — zulässig sind nur Sage, Weiß und Ink.
//
// dist/assets/  -> Symbole für die Web-App und das Manifest
// assets/       -> Quellbilder für `npm run assets` (@capacitor/assets),
//                  das daraus die nativen Varianten ableitet.
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INK = '#0f1010';
const SAGE = '#a3a398';
// Seitenverhältnis der Bildmarke aus ihrem viewBox.
const MARK_W = 166.6, MARK_H = 908.7;
const PATH = readFileSync(resolve(ROOT, 'assets/brand/mark-path.txt'), 'utf8').trim();

// height:  Höhe der Bildmarke als Anteil der Kantenlänge, 0 = nur Fläche
// rounded: abgerundete Ecken, sonst formatfüllend
// bg:      Hintergrundfarbe, null lässt die Fläche frei
function svg(size, { height = 0.74, rounded = false, bg = INK, fg = SAGE } = {}) {
  const h = size * height;
  const k = h / MARK_H;
  const w = MARK_W * k;
  const x = (size - w) / 2, y = (size - h) / 2;
  const flaeche = bg
    ? `<rect width="${size}" height="${size}" rx="${rounded ? size * 0.225 : 0}" fill="${bg}"/>`
    : '';
  const zeichen = height > 0
    ? `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(6)})">` +
      `<path d="${PATH}" fill="${fg}" fill-rule="evenodd"/></g>`
    : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">${flaeche}${zeichen}</svg>`
  );
}

// alpha:false erzwingt RGB. App Store Connect weist Symbole mit Alphakanal
// zurück, und iOS erwartet auch apple-touch-icon ohne.
async function schreibe(rel, size, opts, alpha) {
  const datei = resolve(ROOT, rel);
  mkdirSync(resolve(datei, '..'), { recursive: true });
  // Ohne resize skaliert sharp das SVG anhand der Dichte hoch.
  let bild = sharp(svg(size, opts)).resize(size, size);
  if (!alpha) bild = bild.flatten({ background: opts.bg === null ? INK : (opts.bg || INK) });
  // Ohne Alpha bewusst echtes RGB statt Palette: eine indizierte PNG kann
  // ueber tRNS doch Transparenz tragen, und genau die lehnt Apple ab.
  const info = await bild.png({ compressionLevel: 9, palette: alpha }).toFile(datei);
  console.log(rel.padEnd(36), String(size).padStart(4) + 'px',
    alpha ? 'RGBA' : 'RGB ', (info.size / 1024).toFixed(1) + ' KB');
}

const ZIELE = [
  // Web-App und Manifest
  ['dist/assets/icon-192.png', 192, { rounded: true }, true],
  ['dist/assets/icon-512.png', 512, { rounded: true }, true],
  // Android-Maske: Motiv bleibt im sicheren Bereich
  ['dist/assets/icon-maskable-512.png', 512, { height: 0.56 }, true],
  ['dist/assets/icon-appstore-1024.png', 1024, {}, false],
  // iOS liest das Home-Bildschirm-Symbol hieraus, nicht aus dem Manifest
  ['dist/assets/apple-touch-icon.png', 180, {}, false],
  // Quellbilder für @capacitor/assets
  ['assets/icon-only.png', 1024, {}, false],
  ['assets/icon-foreground.png', 1024, { height: 0.5, bg: null }, true],
  ['assets/icon-background.png', 1024, { height: 0 }, false],
  ['assets/splash.png', 2732, { height: 0.17 }, false],
  ['assets/splash-dark.png', 2732, { height: 0.17 }, false]
];

for (const [rel, size, opts, alpha] of ZIELE) {
  await schreibe(rel, size, opts, alpha);
}
