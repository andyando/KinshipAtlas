export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
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
  await page.waitForFunction(() => document.querySelectorAll('.person-list-button').length > 100, null, { timeout: 120000, polling: 500 });
  await page.waitForTimeout(2000);
  const upload = await page.evaluate(async () => {
    document.querySelector('#mediaFolderDialog')?.close();
    document.querySelector('.person-list-button')?.click();
    await new Promise((r) => setTimeout(r, 2500));
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { noButton: true };
    add.click();
    await new Promise((r) => setTimeout(r, 400));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-E2E.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 9000));
    return {
      person: add.dataset.addMediaFor,
      title: document.querySelector('#title')?.textContent,
      calls: window.__qaCalls,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-person-upload-E2E/.test(p))
    };
  });
  await page.evaluate(() => document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa43-person.png' });
  return { upload, logs: logs.filter((l) => /error|Upload|save/i.test(l)).slice(0, 8) };
}
