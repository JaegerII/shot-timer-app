// Erzeugt die Kopfzeile der App-Store-Produktseite aus store/header.html
// in den beiden Größen, die App Store Connect annimmt:
//   3840 x 1646 px (wide) und 5244 x 2950 px (tall)
// Start: node tools/store-header.mjs [--video] [wide|tall]   Ausgabe: store/header/
// --video rendert die Animation (8 s Schleife, 30 fps) Bild für Bild als MP4.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import ffmpeg from 'ffmpeg-static';

const PORT = 8140;
const VIDEO = process.argv.includes('--video');
const ONLY = process.argv.find((a) => a === 'wide' || a === 'tall');
const FPS = 30, LOOP = 8;
const FORMATS = [{ name: 'wide', w: 1920, h: 823 }, { name: 'tall', w: 2622, h: 1475 }].filter((f) => !ONLY || f.name === ONLY);

function encoder(file) {
  const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), file],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg Fehler ' + c)))));
  return { write: (buf) => new Promise((r) => (p.stdin.write(buf) ? r() : p.stdin.once('drain', r))), end: () => { p.stdin.end(); return done; } };
}
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
    await page.goto(`http://localhost:${PORT}/store/header.html?format=${f.name}${VIDEO ? '&anim=1' : ''}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.READY === true', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));
    const base = `${out}header-${f.w * 2}x${f.h * 2}`;
    if (VIDEO) {
      const enc = encoder(`${base}.mp4`);
      const frames = FPS * LOOP;
      for (let i = 0; i < frames; i++) {
        await page.evaluate((t) => window.renderAt(t), i / FPS);
        await enc.write(await page.screenshot({ type: 'png' }));
        if (i % 30 === 0) process.stdout.write(`\r${f.name}: ${i}/${frames}`);
      }
      await enc.end();
      console.log(`\r${base}.mp4`);
    } else {
      writeFileSync(`${base}.png`, await page.screenshot({ type: 'png' }));
      console.log(`${base}.png`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
