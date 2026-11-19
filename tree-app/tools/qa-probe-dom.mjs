// Probe: why does the Media Library not open for folder-picked media?
// Reports button/input state, what the folder picker actually yields, and
// whether renderMediaLibrary() produces entries.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('tree-app');
const MEDIA = path.resolve('tree-app/tools/artifacts/qa-media/batch');
const PORT = 8902;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ged': 'text/plain',
};
const missing = [];
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { missing.push(urlPath); res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const report = { steps: [], errors: [], consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

report.steps.push({
  step: 'boot',
  dom: await page.evaluate(() => {
    const btn = document.querySelector('#mediaLibraryButton');
    return {
      libraryButton: !!btn,
      libraryButtonDisabled: btn ? btn.disabled : null,
      libraryButtonHidden: btn ? btn.hidden : null,
      mediaInput: !!document.querySelector('#mediaInput'),
      mediaInputDirectory: document.querySelector('#mediaInput')?.hasAttribute('webkitdirectory'),
      mediaView: !!document.querySelector('#mediaLibraryView'),
    };
  }),
});

const images = fs.readdirSync(MEDIA).filter((n) => /\.(jpe?g|png)$/i.test(n)).slice(0, 4);
report.images = images;
if (images.length) {
  await page.locator('#mediaInput').setInputFiles(MEDIA);
  await page.waitForTimeout(3000);
}
await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
await page.waitForTimeout(400);

report.steps.push({
  step: 'after-folder-pick',
  state: await page.evaluate(() => {
    const btn = document.querySelector('#mediaLibraryButton');
    return {
      libraryButtonDisabled: btn ? btn.disabled : null,
      libraryButtonHidden: btn ? btn.hidden : null,
      folderDialogOpen: !!document.querySelector('#mediaFolderDialog[open]'),
      mediaViewHidden: document.querySelector('#mediaLibraryView')?.hidden ?? null,
      summary: (document.querySelector('#mediaLibrarySummary')?.textContent || '').slice(0, 160),
    };
  }),
});

// What does the app itself think it has?
report.steps.push({
  step: 'internals',
  data: await page.evaluate(() => {
    const out = {};
    const g = window.__kinship;
    if (g) {
      out.hasKinship = true;
      out.keys = Object.keys(g).slice(0, 20);
      const st = g.state;
      if (st) {
        out.stateKeys = Object.keys(st).slice(0, 30);
        const f = st.folderMediaFiles || st.mediaFolderFiles;
        if (f) out.folderFiles = f instanceof Map ? [...f.keys()] : Object.keys(f);
        out.mediaCount = (st.media || []).length;
      }
      if (typeof g.getMediaLibraryEntries === 'function') {
        const e = g.getMediaLibraryEntries();
        out.entries = (e || []).slice(0, 12).map((x) => x.key || x.path || x.name || String(x));
        out.entryCount = (e || []).length;
      }
    } else {
      out.hasKinship = false;
    }
    return out;
  }),
});

// Force the click even though the button may still be disabled, to separate
// "button never enabled" from "click handler broken".
report.steps.push({
  step: 'open-view',
  result: await page.evaluate(() => {
    const btn = document.querySelector('#mediaLibraryButton');
    if (!btn) return { error: 'no button' };
    btn.disabled = false;
    btn.click();
    return {
      viewHidden: document.querySelector('#mediaLibraryView')?.hidden ?? null,
      cards: document.querySelectorAll('.media-library-card').length,
      contentHtml: (document.querySelector('#mediaLibraryContent')?.innerHTML || '').slice(0, 300),
      countText: document.querySelector('#mediaLibraryCount')?.textContent || null,
    };
  }),
});
await page.waitForTimeout(800);
report.steps.push({
  step: 'open-view-later',
  result: await page.evaluate(() => ({
    viewHidden: document.querySelector('#mediaLibraryView')?.hidden ?? null,
    cards: document.querySelectorAll('.media-library-card').length,
    names: [...document.querySelectorAll('.media-library-name')].map((n) => n.textContent.trim()).slice(0, 8),
    bodyHasLinkPrompt: /Link the media folder/i.test(document.body.innerText),
  })),
});

report.missing = [...new Set(missing)];
await page.screenshot({ path: 'tree-app/tools/artifacts/qa-probe-dom.png', fullPage: true });
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(0);
