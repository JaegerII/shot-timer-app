// Erzeugt die Kopfzeile der App-Store-Produktseite aus store/header.html
// in den beiden Größen, die App Store Connect annimmt:
//   3840 x 1646 px (wide) und 5244 x 2950 px (tall)
// Start: node tools/store-header.mjs   Ausgabe: store/header/
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const PORT = 8140;
const FORMATS = [{ name: 'wide', w: 1920, h: 823 }, { name: 'tall', w: 2622, h: 1475 }];
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Kein Chrome gefunden. Pfad per CHROME_PATH setzen.');

const server = spawn(process.execPath, [fileURLToPath(new URL('./dev-server.mjs', import.meta.url)), String(PORT), '.'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const out = fileURLToPath(new URL('../store/header/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
try {
  for (const f of FORMATS) {
    const page = await browser.newPage();
    await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:${PORT}/store/header.html?format=${f.name}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.READY === true', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));
    const file = `${out}header-${f.w * 2}x${f.h * 2}.png`;
    writeFileSync(file, await page.screenshot({ type: 'png' }));
    console.log(file);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
