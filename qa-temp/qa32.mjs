export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('request', (r) => { if (r.url().includes('/api/media')) logs.push(`request ${r.method()} ${r.url()} folder=${r.headers()['x-media-folder']}`); });
  await page.addInitScript(() => {
    sessionStorage.clear();
    window.__qaCalls = { media: 0 };
    // Record the helper's reply so the path the app takes can be checked.
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/media') && init?.method === 'POST') {
        window.__qaCalls.media += 1;
        window.__qaCalls.folder = init.headers['X-Media-Folder'];
      }
      return originalFetch(input, init);
    };
  });
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
  // Start again so the launcher opens the seeded tree.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /2,6/.test(document.querySelector('#peopleCount')?.textContent || ''), null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  // Nothing cached, so the launcher's tree has to be brought in explicitly.
  const tree = await page.evaluate(async () => {
    const button = [...document.querySelectorAll('button')].find((b) => /tree/i.test(b.textContent) && !b.disabled);
    if (button && /open|load|primary|default/i.test(button.textContent + button.title)) { button.click(); return button.textContent.trim(); }
    return 'no tree button';
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-22.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 8000));
    return {
      person: add.dataset.addMediaFor,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-person-upload/.test(p)),
      calls: window.__qaCalls
    };
  });
  return { upload, logs: logs.filter((l) => /QA|request|error|pageerror/.test(l)) };
}
