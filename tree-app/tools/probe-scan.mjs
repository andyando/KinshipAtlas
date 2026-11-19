import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('tree-app');
const PORT = 8899;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ged': 'text/plain',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const out = { errors: [], console: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => out.errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') out.console.push(m.type() + ': ' + m.text().slice(0, 300)); });
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

out.scanner = await page.evaluate(() => ({
  hasScanner: !!window.KinshipFaceScan,
  available: window.KinshipFaceScan?.isAvailable?.(),
  scanBtn: !!document.querySelector('#mediaLibraryScanButton'),
}));

// Does the scan button exist before the library opens? (likely not)
out.beforeOpen = await page.evaluate(() => ({
  scanBtn: !!document.querySelector('#mediaLibraryScanButton'),
  libBtn: !!document.querySelector('#mediaLibraryButton'),
}));

await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(600);
out.afterOpen = await page.evaluate(() => ({
  scanBtn: !!document.querySelector('#mediaLibraryScanButton'),
  scanBtnText: document.querySelector('#mediaLibraryScanButton')?.textContent?.trim() || null,
  cards: document.querySelectorAll('.media-library-card').length,
  dialogsOpen: [...document.querySelectorAll('dialog[open]')].map((d) => d.id),
}));

// Try to force-create a scan run even with no images, to see any error path.
out.scanClickEmpty = await page.evaluate(async () => {
  const btn = document.querySelector('#mediaLibraryScanButton');
  if (!btn) return 'no button';
  const before = [];
  btn.click();
  await new Promise((r) => setTimeout(r, 600));
  return { disabled: btn.disabled, text: btn.textContent.trim(), running: window.__kinship?.mediaFaceScanRunning ?? null };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
process.exit(0);
