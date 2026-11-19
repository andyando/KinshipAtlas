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
  if (urlPath.startsWith('/Primary GEDCOM/')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(fs.readFileSync('G:/Family/07_Trees_and_Databases/GEDCOM/Ancestry_01112026.ged'));
    return;
  }
  fs.readFile(path.join(ROOT, urlPath.replace(/^\/+/, '')), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(urlPath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
console.log('inputs present:', await page.evaluate(() => ['#gedcomInput', '#mediaUploadInput', '#mediaLibraryButton'].map((s) => s + '=' + !!document.querySelector(s)).join(', ')));

// Load GEDCOM
const ged = await page.evaluate(async () => {
  const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
  return r.ok ? await r.text() : null;
});
await page.evaluate((text) => {
  const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
  const t = new DataTransfer(); t.items.add(file);
  document.querySelector('#gedcomInput').files = t.files;
  document.querySelector('#gedcomInput').dispatchEvent(new Event('change', { bubbles: true }));
}, ged);
await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => { });
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

// Open Media Library
await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(600);

// Inject images through the app's own upload input
const BATCH = ['person.jpg', 'PXL_20240518_025114660.PANO.jpg', 'PXL_20240525_225943283.NIGHT.jpg', 'PXL_20250223_045238503.PANO.jpg', 'trashed-1752037323-PXL_20250530_065827576~2.jpg']; // real photos only, so the detector has something to find (no synthetic skyline.png)
const injected = await page.evaluate(async (names) => {
  const files = [];
  for (const n of names) {
    const r = await fetch('/tools/artifacts/qa-media/batch/' + n);
    if (!r.ok) continue;
    const blob = await r.blob();
    files.push(new File([blob], n, { type: blob.type || 'image/jpeg' }));
  }
  const input = document.querySelector('#mediaUploadInput');
  if (!input) return { error: 'no file input found' };
  const t = new DataTransfer();
  files.forEach((f) => t.items.add(f));
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  return { count: files.length };
}, BATCH);
await page.waitForTimeout(1500);

// --- 1. Sort-by dropdown: filename A-Z, Z-A, then classification A-Z, Z-A
const readNames = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#mediaLibraryContent .media-card, #mediaLibraryContent [data-media-key]')];
  return cards.map((c) => (c.dataset.mediaKey || c.querySelector('.media-card-name')?.textContent || '').trim());
});
async function applySort(value) {
  await page.evaluate((v) => {
    const sel = document.querySelector('#mediaLibrarySort');
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(500);
  return readNames();
}
const sortNameAsc = await applySort('name-asc');
const sortNameDesc = await applySort('name-desc');
const sortTypeAsc = await applySort('type-asc');
const sortTypeDesc = await applySort('type-desc');
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-library-sorted.png' });

// --- 2. Scan faces scoped to the shown list, spinner while running
const shownCount = await page.evaluate(() => document.querySelectorAll('#mediaLibraryContent [data-media-key]').length);
const scanStarted = await page.evaluate(() => {
  const button = document.querySelector('#mediaLibraryScanButton');
  button?.click();
  // The spinner is added synchronously with the click.
  return {
    spinning: !!button?.querySelector('.media-scan-spinner'),
    busy: button?.getAttribute('aria-busy'),
    disabled: button?.disabled
  };
});
let spinnerSeen = scanStarted.spinning;
if (!spinnerSeen) {
  try {
    await page.waitForFunction(() => !!document.querySelector('#mediaLibraryScanButton .media-scan-spinner'), { timeout: 5000 });
    spinnerSeen = true;
  } catch { spinnerSeen = false; }
}
await page.waitForFunction(() => !document.querySelector('#mediaLibraryScanButton')?.disabled, { timeout: 180000 }).catch(() => { });
await page.waitForTimeout(800);
const scanFinished = await page.evaluate(() => {
  const button = document.querySelector('#mediaLibraryScanButton');
  return {
    spinnerGone: !button?.querySelector('.media-scan-spinner'),
    label: button?.textContent?.trim(),
    disabled: button?.disabled
  };
});

// --- 3. Face results screen
const results = await page.evaluate(() => {
  const dialog = [...document.querySelectorAll('dialog[open]')].find((d) => /face/i.test(d.id));
  if (!dialog) return { open: false };
  const rows = [...dialog.querySelectorAll('.face-scan-results-list .profile-review-row')];
  return {
    open: true,
    className: dialog.className,
    hint: dialog.querySelector('.profile-review-hint')?.textContent?.trim(),
    rowCount: rows.length,
    keys: rows.map((r) => r.querySelector('input[type="checkbox"]')?.dataset.mediaKey),
    hasBulkApply: !!dialog.querySelector('.face-scan-apply'),
    bulkApplyDisabled: dialog.querySelector('.face-scan-apply')?.disabled,
    hasCheckboxes: dialog.querySelectorAll('input[type="checkbox"]').length
  };
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-face-results.png' });

// --- 4. Apply Portrait classification to all detected rows
const applied = await page.evaluate(async () => {
  const dialog = [...document.querySelectorAll('dialog[open]')].find((d) => /face/i.test(d.id));
  if (!dialog) return { error: 'no results dialog' };
  const bulk = dialog.querySelector('.face-scan-apply');
  if (!bulk) return { error: 'no bulk apply control' };
  bulk.click();
  await new Promise((r) => setTimeout(r, 1200));
  const open = [...document.querySelectorAll('dialog[open]')].map((d) => d.className);
  const cards = [...document.querySelectorAll('#mediaLibraryContent [data-media-key]')];
  return {
    open,
    stillOpen: !!document.querySelector('.face-scan-results-dialog[open]'),
    portraitKeys: cards.filter((c) => /portrait/i.test(c.textContent)).map((c) => c.dataset.mediaKey)
  };
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-face-applied.png' });

console.log(JSON.stringify({
  injected,
  shownCount,
  sort: { sortNameAsc, sortNameDesc, sortTypeAsc, sortTypeDesc },
  scan: { scanStarted, spinnerSeen, scanFinished },
  results,
  applied,
  errors
}, null, 2));
await browser.close();
server.close();
process.exit(0);
