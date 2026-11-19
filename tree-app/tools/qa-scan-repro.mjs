// Repro: import GEDCOM + real image files, then click "Scan faces".
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

const report = { steps: [], errors: [], consoleErrors: [], requests: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => report.errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
page.on('requestfailed', (r) => report.requests.push(r.url().slice(0, 180)));

await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

const ged = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME Alpha /One/', '1 SEX M',
  '1 BIRT', '2 DATE 1900', '1 OBJE', '2 FILE person.jpg', '3 FORM jpg',
  '0 @I2@ INDI', '1 NAME Bravo /Two/', '1 SEX F', '1 BIRT', '2 DATE 1901',
  '1 OBJE', '2 FILE skyline.png', '3 FORM png',
  '0 TRLR', '',
].join('\n');
await page.evaluate((text) => {
  const file = new File([text], 'qa-media.ged', { type: 'text/plain' });
  const t = new DataTransfer(); t.items.add(file);
  const input = document.querySelector('#gedcomInput');
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, ged).catch((error) => console.log('ged step failed:', String(error).slice(0, 200)));
await page.waitForFunction(() => (document.querySelector('#peopleCount')?.textContent || '').trim() !== '', { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
console.log('stage: ged loaded', await page.evaluate(() => document.querySelector('#peopleCount')?.textContent));

const injected = await page.evaluate(async () => {
  const names = ['person.jpg', 'skyline.png'];
  const files = [];
  for (const n of names) {
    const r = await fetch('/tools/artifacts/qa-media/batch/' + n);
    if (!r.ok) continue;
    const blob = await r.blob();
    files.push(new File([blob], n, { type: blob.type || 'image/jpeg' }));
  }
  const t = new DataTransfer();
  files.forEach((f) => t.items.add(f));
  const input = document.querySelector('#mediaUploadInput');
  if (!input) return { count: files.length, error: 'no #mediaUploadInput' };
  input.files = t.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  return {
    count: files.length,
    toast: document.querySelector('#mediaFolderDialog[open]') ? 'folder-dialog-open' : null,
    body: (document.body.innerText.match(/[^\n]*(media folder|helper|upload)[^\n]*/gi) || []).slice(0, 4),
  };
});

await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
await page.waitForTimeout(1500);
report.steps.push({
  step: 'library',
  cards: await page.locator('.media-library-card').count(),
  names: await page.evaluate(() => [...document.querySelectorAll('.media-library-card .media-library-name')].map((n) => n.textContent.trim())),
  uploaded: injected,
});

await page.evaluate(() => document.querySelector('#mediaLibraryScanButton').click());
await page.waitForTimeout(1500);
await page.waitForFunction(() => document.querySelector('#mediaLibraryScanButton')?.disabled === false, { timeout: 120000 }).catch(() => { });
report.steps.push({
  step: 'scan',
  status: await page.evaluate(() => {
    const el = document.querySelector('#mediaLibraryToast, .media-library-status, #mediaLibraryStatus, .toast');
    return {
      bodyText: (document.body.innerText.match(/No images[^\n]*|Scann[^\n]*|Face[^\n]*/g) || []).slice(0, 6),
      dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id),
      resultsRows: document.querySelectorAll('#mediaFaceResultsDialog .face-scan-results-list > *').length,
    };
  }),
});
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-scan-repro.png' });
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(0);
