export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 220)}`));
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
  await page.waitForTimeout(12000);
  await page.evaluate(async () => {
    if (!window.KINSHIP_PRIMARY) return;
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
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /2,6/.test(document.querySelector('#peopleCount')?.textContent || ''), null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const opened = await page.evaluate(() => {
    document.querySelector('.person-list-button')?.click();
    return document.querySelector('#title')?.textContent;
  });
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => ({
    section: document.querySelector('.detail-media-section h3')?.textContent,
    addButton: !!document.querySelector('button[data-add-media-for]'),
    disabled: document.querySelector('button[data-add-media-for]')?.disabled,
    title: document.querySelector('button[data-add-media-for]')?.title
  }));
  // Click through Playwright so the picker is treated as cancelled, then feed the input.
  await page.locator('button[data-add-media-for]').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.setInputFiles('#mediaUploadInput', 'G:/Git/Kinship_Experimental/qa-temp/app/14-Magnus.jpg').catch((e) => logs.push(`setInputFiles: ${String(e).slice(0, 120)}`));
  await page.waitForTimeout(9000);
  const after = await page.evaluate(() => ({
    calls: window.__qaCalls,
    toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 340)),
    heading: document.querySelector('.detail-media-section h3')?.textContent,
    newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /14-Magnus/.test(p))
  }));
  await page.evaluate(() => document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa37-person.png' });
  return { opened, before, after, logs: logs.filter((l) => /QA|pageerror|error/i.test(l)).slice(0, 20) };
}
