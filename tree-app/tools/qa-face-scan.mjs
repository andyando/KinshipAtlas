import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('tree-app');
const PORT = 8899;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ged': 'text/plain',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, urlPath);
  if (urlPath.startsWith('/Primary%20GEDCOM/')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(fs.readFileSync('G:/Git/Kinship_Experimental/Primary GEDCOM/Ancestry_01112026.ged'));
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const globals = await page.evaluate(() => ({
  probe2: typeof window.__probe2,
  faceScan: typeof window.KinshipFaceScan,
  title: document.title,
}));
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-face-globals.png' });

// Load GEDCOM
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
const ged = await page.evaluate(async () => {
  const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
  return r.ok ? await r.text() : null;
});
await page.evaluate((text) => {
  if (!text) return;
  const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
  const t = new DataTransfer(); t.items.add(file);
  const input = document.querySelector('#gedcomInput');
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, ged);
await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => { });
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

// Load media folder via DataTransfer into the folder input (path-based)
const folder = 'G:/Git/Kinship_Experimental/qa-media';
let mediaLoad = null;
try {
  // Find how the app loads media folders
  mediaLoad = await page.evaluate(() => ({
    folderInput: !!document.querySelector('#mediaFolderInput'),
    dialogOpen: !!document.querySelector('#mediaFolderDialog[open]'),
    buttons: [...document.querySelectorAll('#mediaFolderDialog button')].map(b => b.textContent.trim()).slice(0, 10),
  }));
} catch (e) { mediaLoad = { error: String(e) }; }

// Instead of folder picker (needs real FS access), inject images directly into the scanner
// via KinshipFaceScan.analyse to prove the detector works on real faces.
const scanResult = await page.evaluate(async () => {
  const scanner = window.KinshipFaceScan;
  if (!scanner) return { error: 'no scanner global' };
  const out = [];
  // fetch real test images from the server if present
  for (const name of ['tools/artifacts/qa-media/batch/person.jpg', 'tools/artifacts/qa-media/batch/PXL_20240518_025114660.PANO.jpg', 'tools/artifacts/qa-media/batch/trashed-1752037323-PXL_20250530_065827576~2.jpg']) {
    try {
      const r = await fetch('/' + name);
      if (!r.ok) { out.push({ name, missing: r.status }); continue; }
      const blob = await r.blob();
      const file = new File([blob], name, { type: blob.type });
      const rec = await scanner.analyse(file);
      out.push({ name, ...rec });
    } catch (e) { out.push({ name, error: String(e) }); }
  }
  return out;
});

await page.screenshot({ path: 'tree-app/tools/artifacts/qa-face-scan.png' });
console.log(JSON.stringify({ globals, mediaLoad, scanResult, errors }, null, 2));
await browser.close();
server.close();
process.exit(0);
