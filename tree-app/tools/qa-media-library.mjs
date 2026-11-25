// Drives the simplified Media Library end to end with REAL image files:
// upload real photos, import a GEDCOM that references them, sort by the
// drop-down, run "Scan faces" on the shown list, and apply "Portrait" from the
// results screen (individually and in bulk).
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

const report = { steps: [], errors: [], consoleErrors: [], failedRequests: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => report.errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
page.on('requestfailed', (r) => report.failedRequests.push(`${r.url().slice(-90)} ${r.failure()?.errorText || ''}`));

await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

// 1. Upload real images through the app's own media input.
const BATCH = ['person.jpg', 'PXL_20240518_025114660.PANO.jpg', 'PXL_20240525_225943283.NIGHT.jpg', 'skyline.png'];
const uploaded = await page.evaluate(async (names) => {
  const files = [];
  for (const n of names) {
    const r = await fetch('/tools/artifacts/qa-media/batch/' + n);
    if (!r.ok) return { error: 'missing sample ' + n };
    const blob = await r.blob();
    files.push(new File([blob], n, { type: blob.type || 'image/jpeg' }));
  }
  const input = document.querySelector('#mediaUploadInput');
  if (!input) return { error: 'no #mediaUploadInput' };
  const t = new DataTransfer();
  files.forEach((f) => t.items.add(f));
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 2000));
  return { count: files.length };
}, BATCH);
report.steps.push({ step: 'upload', uploaded });

// 2. GEDCOM that references exactly those uploaded files.
const ged = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
  '0 @I1@ INDI', '1 NAME Alpha /One/', '1 SEX M', '1 BIRT', '2 DATE 1900', '1 OBJE', '2 FILE person.jpg', '3 FORM jpg',
  '0 @I2@ INDI', '1 NAME Bravo /Two/', '1 SEX F', '1 BIRT', '2 DATE 1901', '1 OBJE', '2 FILE PXL_20240518_025114660.PANO.jpg', '3 FORM jpg',
  '0 @I3@ INDI', '1 NAME Charlie /Three/', '1 SEX M', '1 BIRT', '2 DATE 1902', '1 OBJE', '2 FILE PXL_20240525_225943283.NIGHT.jpg', '3 FORM jpg',
  '0 TRLR', '',
].join('\n');
await page.evaluate((text) => {
  const file = new File([text], 'qa-media.ged', { type: 'text/plain' });
  const t = new DataTransfer(); t.items.add(file);
  const input = document.querySelector('#gedcomInput');
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, ged);
await page.waitForFunction(() => (document.querySelector('#peopleCount')?.textContent || '').trim() !== '', { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(1200);
report.steps.push({
  step: 'library opened',
  sortExists: await page.locator('#mediaLibrarySort').count(),
  facesFilterGone: (await page.locator('#mediaLibraryFaceFilter').count()) === 0,
  sortOptions: await page.evaluate(() => [...document.querySelectorAll('#mediaLibrarySort option')].map((o) => o.value)),
  cardCount: await page.locator('.media-library-card').count(),
  cardNames: await page.evaluate(() => [...document.querySelectorAll('.media-library-card .media-library-name')].map((n) => n.textContent.trim())),
  missingFiles: await page.evaluate(() => [...document.querySelectorAll('.media-library-card')].filter((c) => /not found/i.test(c.textContent)).length),
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-library.png' });

// 3. Sort semantics.
const sortProbe = await page.evaluate(async () => {
  const sel = document.querySelector('#mediaLibrarySort');
  const names = () => [...document.querySelectorAll('.media-library-card .media-library-name')].map((n) => n.textContent.trim());
  const out = {};
  for (const v of ['name-asc', 'name-desc', 'type-asc', 'type-desc']) {
    sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    out[v] = names();
  }
  return out;
});
report.steps.push({ step: 'sort', sortProbe });

// 4. Spinner watch, then run the scan.
await page.evaluate(() => {
  window.__scanWatch = { seen: false, labels: [] };
  const btn = document.querySelector('#mediaLibraryScanButton');
  const obs = new MutationObserver(() => {
    if (btn.querySelector('.media-scan-spinner')) window.__scanWatch.seen = true;
    const label = btn.textContent.trim();
    if (!window.__scanWatch.labels.includes(label)) window.__scanWatch.labels.push(label);
  });
  obs.observe(btn, { childList: true, subtree: true, characterData: true, attributes: true });
});
await page.evaluate(() => document.querySelector('#mediaLibraryScanButton').click());
await page.waitForTimeout(1500);
report.steps.push({ step: 'scan started', watch: await page.evaluate(() => window.__scanWatch), disabled: await page.locator('#mediaLibraryScanButton').isDisabled() });
await page.waitForFunction(() => document.querySelector('#mediaLibraryScanButton')?.disabled === false, { timeout: 180000 }).catch(() => { });
const resultsOpen = await page.waitForSelector('#mediaFaceResultsDialog[open]', { timeout: 20000 }).then(() => true).catch(() => false);
const rows = await page.evaluate(() => [...document.querySelectorAll('#mediaFaceResultsDialog .face-scan-result, #mediaFaceResultsDialog .face-scan-results-list > *')]
  .map((r) => ({ name: r.querySelector('.face-scan-result-name, .media-library-name')?.textContent.trim() || r.textContent.trim().slice(0, 60), text: r.textContent.trim().slice(0, 120) })));
report.steps.push({
  step: 'scan finished',
  watch: await page.evaluate(() => window.__scanWatch),
  resultsOpen,
  rowCount: await page.locator('#mediaFaceResultsDialog .face-scan-results-list > *').count(),
  rows,
  dialogIds: await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id)),
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-scan-results.png' });

// 5. Apply: tick the first row, then bulk apply.
const applyProbe = await page.evaluate(async () => {
  const out = {};
  const list = document.querySelector('#mediaFaceResultsDialog .face-scan-results-list');
  const first = list?.children?.[0];
  const check = first?.querySelector('input[type="checkbox"]');
  if (check) { check.checked = true; check.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise((r) => setTimeout(r, 400));
  out.individualApplied = !!check?.checked;
  document.querySelector('#mediaFaceResultsDialog .face-scan-apply')?.click();
  await new Promise((r) => setTimeout(r, 600));
  out.dialogStillOpen = !!document.querySelector('#mediaFaceResultsDialog[open]');
  const classifications = [...document.querySelectorAll('.media-library-card')].map((c) => ({
    name: c.querySelector('.media-library-name')?.textContent.trim(),
    text: (c.textContent || '').slice(0, 120),
  }));
  return { ...out };
});
report.steps.push({ step: 'apply', applyProbe });
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-applied.png' });

console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(0);
