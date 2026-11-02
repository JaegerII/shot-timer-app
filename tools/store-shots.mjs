// Erzeugt die App-Store-Screenshots aus store/shots.html: fünf Motive je Sprache,
// 1320 x 2868 px (iPhone 6,9"). Start: node tools/store-shots.mjs [en]
// Standard ist ein englischer Satz; Apple nutzt ihn für alle Store-Sprachen.
// Ausgabe: store/screenshots/<sprache>/<nr>.png
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const LANGS = (process.argv[2] || 'en').split(',');
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
    const out = fileURLToPath(new URL(`../store/screenshots/${lang}/`, import.meta.url));
    mkdirSync(out, { recursive: true });
    for (let shot = 1; shot <= 5; shot++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 3 });
      await page.goto(`http://localhost:${PORT}/store/shots.html?shot=${shot}&lang=${lang}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction('window.READY === true', { timeout: 15000 });
      writeFileSync(`${out}${shot}.png`, await page.screenshot({ type: 'png' }));
      console.log(`${lang}/${shot}.png`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
