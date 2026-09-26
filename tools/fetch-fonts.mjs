// Holt die Schriftdateien und legt sie lokal ab.
// Start: node tools/fetch-fonts.mjs
//
// Die Dateien werden bewusst gebündelt und nicht zur Laufzeit von Google
// geladen: die App muss am Schießstand ohne Netz laufen, und die
// Datenschutzerklärung sagt zu, dass keine Verbindungen nach außen entstehen.
//
// Montserrat steht unter der SIL Open Font License 1.1 und darf damit
// weitergegeben und in einer App ausgeliefert werden. Die Lizenzdatei wird
// mitgeladen, weil die OFL genau das verlangt.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../dist/assets/fonts', import.meta.url)));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Variable Schrift: ein Datei-Satz deckt die Strichstärken 100 bis 900 ab.
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&display=swap';
const LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/OFL.txt';
// Deutsch braucht nur "latin"; "latin-ext" kommt dazu, weil Schützennamen
// frei eingegeben werden und osteuropäische Zeichen enthalten können.
const WANTED = ['latin', 'latin-ext'];

async function get(url, asText = true) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

const css = await get(CSS_URL);

// Die Antwort ist nach Zeichensätzen gegliedert: /* latin */ vor dem Block.
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)]
  .map(m => ({ subset: m[1], body: m[2] }))
  .filter(b => WANTED.includes(b.subset));

if (blocks.length !== WANTED.length) {
  throw new Error('Erwartete Zeichensätze nicht gefunden: ' + blocks.map(b => b.subset).join(', '));
}

mkdirSync(OUT, { recursive: true });
const faces = [];

for (const block of blocks) {
  const src = block.body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  const range = block.body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
  if (!src || !range) throw new Error('Block unvollständig: ' + block.subset);

  const name = `montserrat-${block.subset}.woff2`;
  const data = await get(src, false);
  writeFileSync(resolve(OUT, name), data);
  console.log(name.padEnd(30), (data.length / 1024).toFixed(1) + ' KB');

  faces.push(
    `@font-face{font-family:'Montserrat';font-style:normal;font-weight:100 900;` +
    `font-display:swap;src:url(assets/fonts/${name}) format('woff2');` +
    `unicode-range:${range}}`
  );
}

const license = await get(LICENSE_URL);
writeFileSync(resolve(OUT, 'OFL.txt'), license, 'utf8');
console.log('OFL.txt'.padEnd(30), (license.length / 1024).toFixed(1) + ' KB');

// Der CSS-Block wird nicht automatisch eingesetzt – er gehört an den Anfang
// des <style>-Abschnitts in dist/index.html.
writeFileSync(resolve(OUT, 'font-face.css'), faces.join('\n') + '\n', 'utf8');
console.log('\n@font-face-Regeln liegen in dist/assets/fonts/font-face.css');
