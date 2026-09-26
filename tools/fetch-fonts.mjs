// Holt die Schriftdateien des FORTH-TRACE-Systems und legt sie lokal ab.
// Start: node tools/fetch-fonts.mjs
//
// Die Dateien werden bewusst gebündelt und nicht zur Laufzeit von Google
// geladen: die App muss am Schießstand ohne Netz laufen, und die
// Datenschutzerklärung sagt zu, dass keine Verbindungen nach außen entstehen.
//
// Big Shoulders Display — Auszeichnung, Wortmarke, Zeitanzeige.
// Archivo             — Fließtext und Bedienelemente.
// Beide stehen unter der SIL Open Font License 1.1 und dürfen mit einer App
// ausgeliefert werden. Die Lizenztexte werden mitgeladen, weil die OFL das
// verlangt.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../dist/assets/fonts', import.meta.url)));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const FAMILIES = [
  { css: 'Big+Shoulders+Display:wght@500..800', name: 'Big Shoulders Display', slug: 'big-shoulders', ofl: 'bigshouldersdisplay' },
  { css: 'Archivo:wght@400..700', name: 'Archivo', slug: 'archivo', ofl: 'archivo' },
  // Laufende Ziffern brauchen gleiche Breiten. Big Shoulders hat keine
  // Tabellenziffern, deshalb traegt die Mono-Schrift des Systems alle Zahlen.
  { css: 'IBM+Plex+Mono:wght@500;600', name: 'IBM Plex Mono', slug: 'plex-mono', ofl: 'ibmplexmono' }
];
// Deutsch braucht nur "latin"; "latin-ext" kommt dazu, weil Schützennamen
// frei eingegeben werden und osteuropäische Zeichen enthalten können.
const WANTED = ['latin', 'latin-ext'];

async function get(url, asText = true) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });
const faces = [];

for (const family of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${family.css}&display=swap`);
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)]
    .map(m => ({ subset: m[1], body: m[2] }))
    .filter(b => WANTED.includes(b.subset) && b.body.includes(`'${family.name}'`));

  // Variable Familien liefern einen Block je Zeichensatz, statische einen
  // je Zeichensatz und Schnitt. Beides ist zulässig, fehlen darf keiner.
  for (const wanted of WANTED) {
    if (!blocks.some(b => b.subset === wanted)) {
      throw new Error(family.name + ': Zeichensatz ' + wanted + ' nicht gefunden');
    }
  }

  const mehrfach = blocks.length > WANTED.length;
  for (const block of blocks) {
    const src = block.body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = block.body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
    const weight = block.body.match(/font-weight:\s*([^;]+);/)?.[1].trim();
    if (!src || !range || !weight) throw new Error(family.name + '/' + block.subset + ': Block unvollständig');

    const file = `${family.slug}-${block.subset}${mehrfach ? '-' + weight.replace(/\s+/g, '') : ''}.woff2`;
    const data = await get(src, false);
    writeFileSync(resolve(OUT, file), data);
    console.log(file.padEnd(34), (data.length / 1024).toFixed(1) + ' KB');

    faces.push(
      `@font-face{font-family:'${family.name}';font-style:normal;font-weight:${weight};` +
      `font-display:swap;src:url(assets/fonts/${file}) format('woff2');` +
      `unicode-range:${range}}`
    );
  }

  const license = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.ofl}/OFL.txt`);
  writeFileSync(resolve(OUT, `OFL-${family.slug}.txt`), license, 'utf8');
  console.log(`OFL-${family.slug}.txt`.padEnd(34), (license.length / 1024).toFixed(1) + ' KB');
}

// Der CSS-Block wird nicht automatisch eingesetzt – er gehört an den Anfang
// des <style>-Abschnitts in dist/index.html.
writeFileSync(resolve(OUT, 'font-face.css'), faces.join('\n') + '\n', 'utf8');
console.log('\n@font-face-Regeln liegen in dist/assets/fonts/font-face.css');
