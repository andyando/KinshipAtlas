export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 200)); });
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
  // Walk the directory until a person with attached media is selected.
  const chosen = await page.evaluate(async () => {
    document.querySelector('#mediaFolderDialog')?.close();
    await new Promise((r) => setTimeout(r, 300));
    const rows = [...document.querySelectorAll('.person-list-button')];
    for (const row of rows.slice(0, 80)) {
      row.click();
      await new Promise((r) => setTimeout(r, 120));
      const heading = document.querySelector('.detail-media-section h3')?.textContent || '';
      const count = Number((heading.match(/\((\d+)\)/) || [])[1] || 0);
      if (count > 0) return { name: document.querySelector('#title')?.textContent, heading };
    }
    return { none: true, tried: rows.length };
  });
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add || add.disabled) return { noButton: true };
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
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 340)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-final-upload/.test(p))
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa36-person.png' });
  return { chosen, upload, logs: logs.slice(0, 30) };
}
