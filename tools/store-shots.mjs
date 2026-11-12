// Erzeugt die App-Store-Screenshots aus store/shots.html: acht Motive in zwei
// iPhone-Größen, die App Store Connect verlangt:
//   6.9  → 1320 x 2868 px (großes Display)
//   6.3  → 1206 x 2622 px (mittleres Display)
// Start: node tools/store-shots.mjs [en] [nummern, z. B. 7 oder 1,2,7]
// Standard ist ein englischer Satz; Apple nutzt ihn für alle Store-Sprachen.
// Ausgabe: store/screenshots/<sprache>-<größe>/<nr>.png
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

// --play: Google-Play-Fassung in 1080 x 2160 (Play erlaubt höchstens 1:2), Ausgabe <sprache>-play.
const PLAY = process.argv.includes('--play');
process.argv = process.argv.filter((a) => a !== '--play');
const LANGS = (process.argv[2] || 'en').split(',');
const SHOTS = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
// Die Vorlage ist 440 x 956 gebaut; kleinere Größen werden per Zoom verkleinert.
const SIZES = PLAY ? [{ name: 'play', w: 440, h: 880, scale: 1080 / 440 }] : [{ name: '6.9', w: 440, h: 956 }, { name: '6.3', w: 402, h: 874 }];
const PORT = 8139;
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Kein Chrome gefunden. Pfad per CHROME_PATH setzen.');

// Projektordner ausliefern, damit Vorlage und App denselben Ursprung haben.
const server = spawn(process.execPath, [fileURLToPath(new URL('./dev-server.mjs', import.meta.url)), String(PORT), '.'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const lang of LANGS) {
    for (const size of SIZES) {
      const out = fileURLToPath(new URL(`../store/screenshots/${lang}-${size.name}/`, import.meta.url));
      mkdirSync(out, { recursive: true });
      for (const shot of SHOTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: size.scale || 3 });
        await page.goto(`http://localhost:${PORT}/store/shots.html?shot=${shot}&lang=${lang}${PLAY ? '&play=1' : ''}`, { waitUntil: 'networkidle0' });
        await page.waitForFunction('window.READY === true', { timeout: 40000 });
        if (size.w !== 440 && !PLAY) {
          await page.evaluate((z) => { document.documentElement.style.zoom = z; document.documentElement.style.background = '#0b0c0c'; }, size.w / 440);
          await new Promise((r) => setTimeout(r, 200));
        }
        writeFileSync(`${out}${shot}.png`, await page.screenshot({ type: 'png' }));
        console.log(`${lang}-${size.name}/${shot}.png`);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
