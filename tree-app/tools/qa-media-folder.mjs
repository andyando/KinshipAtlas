// QA: load a real image folder (no GEDCOM person link needed), open the Media
// Library, scan faces, and apply the Portrait classification to the results.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('tree-app');
const MEDIA = 'G:/Git/Kinship_Experimental/tree-app/tools/artifacts/qa-media/batch';
const PORT = 8907;
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

const images = fs.readdirSync(MEDIA).filter((n) => /\.(jpe?g|png)$/i.test(n)).slice(0, 6);
const report = { images, steps: [], errors: [], consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
report.steps.push({ step: 'boot', libraryButtonDisabled: await page.locator('#mediaLibraryButton').isDisabled() });

const input = page.locator('#mediaInput');
await input.setInputFiles(images.map((n) => path.join(MEDIA, n)));
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
await page.waitForTimeout(500);
report.steps.push({
  step: 'ingest',
  libraryButtonDisabled: await page.locator('#mediaLibraryButton').isDisabled(),
  libraryButtonVisible: await page.locator('#mediaLibraryButton').isVisible(),
});

await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(1200);
report.steps.push({
  step: 'library',
  cards: await page.locator('.media-library-card').count(),
  names: await page.evaluate(() => [...document.querySelectorAll('.media-library-name')].map((n) => n.textContent.trim()).slice(0, 10)),
  summary: await page.evaluate(() => document.querySelector('#mediaLibrarySummary')?.textContent || ''),
  scanButton: {
    exists: await page.locator('#mediaLibraryScanButton').count(),
    disabled: await page.locator('#mediaLibraryScanButton').isDisabled(),
    visible: await page.locator('#mediaLibraryScanButton').isVisible(),
  },
});

await page.evaluate(() => {
  window.__watch = { spinner: false, labels: [] };
  const btn = document.querySelector('#mediaLibraryScanButton');
  new MutationObserver(() => {
    if (btn.querySelector('.media-scan-spinner')) window.__watch.spinner = true;
    const t = btn.textContent.trim();
    if (!window.__watch.labels.includes(t)) window.__watch.labels.push(t);
  }).observe(btn, { childList: true, subtree: true, characterData: true, attributes: true });
});
await page.evaluate(() => document.querySelector('#mediaLibraryScanButton')?.click());
await page.waitForTimeout(1500);
report.steps.push({ step: 'scan-start', watch: await page.evaluate(() => window.__watch), disabled: await page.locator('#mediaLibraryScanButton').isDisabled() });
await page.waitForSelector('.face-scan-results-dialog[open]', { timeout: 180000 }).catch(() => { });
await page.waitForTimeout(600);
const resultRows = await page.evaluate(() => [...document.querySelectorAll('.face-scan-results-dialog[open] .profile-review-row')].map((r) => ({
  name: r.querySelector('.profile-review-name, .face-scan-result-name')?.textContent.trim() || r.textContent.trim().slice(0, 60),
  checked: !!r.querySelector('input[type="checkbox"]')?.checked,
})));
report.steps.push({
  step: 'scan-end',
  watch: await page.evaluate(() => window.__watch),
  dialogs: await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className)),
  rows: resultRows,
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-folder-results.png', fullPage: true });

// Apply Portrait to everything the scan flagged.
const applyBtn = page.locator('.face-scan-results-dialog[open] button', { hasText: /apply/i }).first();
if (await applyBtn.count()) {
  await applyBtn.click();
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  document.querySelectorAll('dialog[open]').forEach((d) => { if (d.className.includes('face-scan-results')) d.close(); });
});
await page.waitForTimeout(800);
report.steps.push({
  step: 'after-apply',
  dialogsOpen: await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className)),
  cards: await page.evaluate(() => [...document.querySelectorAll('.media-library-card')].map((c) => ({
    name: c.querySelector('.media-library-name')?.textContent.trim(),
    key: c.dataset.mediaKey || null,
    classification: c.querySelector('.media-library-type, .media-classification')?.textContent.trim() || null,
    text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
  }))),
  mediaTypes: await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /mediaTypes/.test(k));
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key)); } catch { return String(localStorage.getItem(key)).slice(0, 300); }
  }),
  scanButtonAfter: {
    disabled: await page.locator('#mediaLibraryScanButton').isDisabled(),
    text: await page.evaluate(() => document.querySelector('#mediaLibraryScanButton')?.textContent.trim()),
  },
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-media-folder-applied.png', fullPage: true });
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(0);
