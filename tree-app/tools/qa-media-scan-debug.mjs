// Diagnostic: loads images into the Media Library, clicks Scan faces, and prints
// every pageerror / console error with its stack so the failure is identified.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('tree-app');
const PORT = 8901;
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

const report = { steps: [], errors: [], consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => report.errors.push({ message: String(e), stack: (e.stack || '').split('\n').slice(0, 8).join('\n') }));
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 400));
  if (/face|mediapipe|wasm/i.test(m.text())) report.steps.push({ console: m.type(), text: m.text().slice(0, 300) });
});
page.on('requestfailed', (r) => report.steps.push({ requestFailed: r.url(), failure: r.failure()?.errorText }));

await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

const ged = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME Alpha /One/', '1 SEX M',
  '1 BIRT', '2 DATE 1900', '0 TRLR', '',
].join('\n');
await page.evaluate((text) => {
  const file = new File([text], 'qa-media.ged', { type: 'text/plain' });
  const t = new DataTransfer(); t.items.add(file);
  const input = document.querySelector('#gedcomInput');
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, ged);
await page.waitForFunction(() => (document.querySelector('#peopleCount')?.textContent || '').trim() !== '', { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

// Upload real images through the app's own file input.
const BATCH = ['person.jpg', 'PXL_20240518_025114660.PANO.jpg', 'PXL_20240525_225943283.NIGHT.jpg', 'skyline.png', 'PXL_20250302_045917161.jpg'];
const injected = await page.evaluate(async (names) => {
  const files = [];
  for (const n of names) {
    const r = await fetch('/tools/artifacts/qa-media/batch/' + n);
    if (!r.ok) continue;
    const blob = await r.blob();
    files.push(new File([blob], n, { type: blob.type || 'image/jpeg' }));
  }
  const input = document.querySelector('#mediaUploadInput');
  if (!input) return { error: 'no #mediaUploadInput' };
  const t = new DataTransfer();
  files.forEach((f) => t.items.add(f));
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { uploaded: files.length };
}, BATCH);
await page.waitForTimeout(2500);
report.steps.push({ step: 'injected', injected });

await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(1200);
const libraryState = await page.evaluate(() => ({
  cards: document.querySelectorAll('.media-library-card').length,
  sortOptions: [...document.querySelectorAll('#mediaLibrarySort option')].map((o) => o.value),
  scanButton: document.querySelector('#mediaLibraryScanButton')?.textContent.trim(),
}));
report.steps.push({ step: 'library', libraryState });

const faceScanGlobal = await page.evaluate(() => ({
  hasGlobal: !!window.KinshipFaceScan,
  available: window.KinshipFaceScan?.isAvailable?.(),
  base: window.KinshipFaceScan?.basePath || null,
}));
report.steps.push({ step: 'face-scan-global', faceScanGlobal });

const errorCountBefore = report.errors.length;
await page.evaluate(() => document.querySelector('#mediaLibraryScanButton').click());
await page.waitForTimeout(4000);
const afterClick = await page.evaluate(() => ({
  label: document.querySelector('#mediaLibraryScanButton')?.textContent.trim(),
  disabled: document.querySelector('#mediaLibraryScanButton')?.disabled,
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.className + '|' + d.id),
  resultsRows: document.querySelectorAll('.face-scan-results-list > *').length,
  toast: document.querySelector('.toast, .app-toast')?.textContent?.trim() || null,
}));
report.steps.push({ step: 'after-click', afterClick, newErrors: report.errors.slice(errorCountBefore) });

await page.waitForFunction(() => document.querySelector('#mediaLibraryScanButton')?.disabled === false, { timeout: 180000 }).catch(() => { });
await page.waitForTimeout(1500);
const afterRun = await page.evaluate(() => ({
  label: document.querySelector('#mediaLibraryScanButton')?.textContent.trim(),
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.className + '|' + d.id),
  resultsRows: document.querySelectorAll('.face-scan-results-list > *').length,
  hint: document.querySelector('.face-scan-results-dialog .profile-review-hint')?.textContent || null,
}));
report.steps.push({ step: 'after-run', afterRun });
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-scan-debug.png' });

console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(0);
