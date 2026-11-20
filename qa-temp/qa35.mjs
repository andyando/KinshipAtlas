export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('request', (r) => { if (r.url().includes('/api/media-delete') || (r.url().includes('/api/media') && r.method() === 'POST')) logs.push(`request ${r.method()} ${r.url()} folder=${r.headers()['x-media-folder']}`); });
  await page.addInitScript(() => {
    sessionStorage.clear();
    window.__qaCalls = { media: 0 };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/media') && init?.method === 'POST') {
        window.__qaCalls.media += 1;
        window.__qaCalls.folder = decodeURIComponent(init.headers['X-Media-Folder'] || '');
      }
      return originalFetch(input, init);
    };
  });
  // Seed the launcher's default tree, then start again so it opens on its own.
  await page.waitForTimeout(12000);
  const seeded = await page.evaluate(async () => {
    if (!window.KINSHIP_PRIMARY) return 'no primary data';
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kinship-atlas-defaults', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put({ gedcomName: window.KINSHIP_PRIMARY.gedcomName }, 'default');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return window.KINSHIP_PRIMARY.media.length;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /2,6/.test(document.querySelector('#peopleCount')?.textContent || ''), null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.evaluate(() => { window.__qaCalls = { media: 0 }; });
  const library = await page.evaluate(async () => {
    document.querySelector('#mediaLibraryButton')?.click();
    await new Promise((r) => setTimeout(r, 2500));
    const card = [...document.querySelectorAll('.media-library-card')][0];
    const image = card?.querySelector('img');
    return {
      cards: document.querySelectorAll('.media-library-card').length,
      firstSrc: image ? image.getAttribute('src').slice(0, 80) : null,
      bulkOrder: [...document.querySelectorAll('.media-library-bulk .button')].map((b) => b.textContent.trim())
    };
  });
  await page.evaluate(() => document.querySelector('#mediaLibraryTableButton')?.click());
  await page.waitForTimeout(800);
  const table = await page.evaluate(() => ({
    rows: document.querySelectorAll('.media-library-table tbody tr').length,
    pressed: document.querySelector('#mediaLibraryTableButton').getAttribute('aria-pressed'),
    thumbBox: (() => { const t = document.querySelector('.media-library-row-thumb'); if (!t) return null; const r = t.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })()
  }));
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa35-table.png' });
  // Person record: open the first person and add a photo through the app's own input.
  await page.evaluate(() => document.querySelector('#mediaLibraryCardsButton')?.click());
  await page.evaluate(() => document.querySelector('#mediaLibraryBackButton')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  // Pick a person who already has media, so the upload has a folder to go into.
  const search = await page.evaluate(() => {
    const box = document.querySelector('#personSearch') || [...document.querySelectorAll('input')].find((i) => /name/i.test(i.placeholder || ''));
    if (!box) return 'no search';
    box.value = 'Isidor';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return 'searching';
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add || add.disabled) return { noButton: true, disabled: add?.disabled };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-final-upload.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 9000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      title: document.querySelector('#title')?.textContent,
      calls: window.__qaCalls,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-final-upload/.test(p)),
      heroAlt: document.querySelector('.detail-monogram-photo')?.alt
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa35-person.png' });
  return { seeded: typeof seeded, search, library, table, upload, logs: logs.slice(0, 30) };
}
