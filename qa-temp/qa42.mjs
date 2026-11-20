export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 160)); });
  await page.addInitScript(() => {
    sessionStorage.clear();
    window.__qaCalls = { media: 0 };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/media') && init?.method === 'POST') {
        window.__qaCalls.media += 1;
        window.__qaCalls.folder = decodeURIComponent(init.headers['X-Media-Folder'] || '');
        window.__qaCalls.name = decodeURIComponent(init.headers['X-File-Name'] || '');
      }
      return originalFetch(input, init);
    };
  });
  await page.waitForFunction(() => document.querySelectorAll('.person-list-button').length > 100, null, { timeout: 120000, polling: 500 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const step1 = await page.evaluate(() => {
    const row = document.querySelector('.person-list-button');
    row.click();
    return { clicked: row.textContent.trim().slice(0, 40) };
  });
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => ({
    title: document.querySelector('#title')?.textContent,
    add: document.querySelectorAll('button[data-add-media-for]').length,
    disabled: document.querySelector('button[data-add-media-for]')?.disabled,
    section: document.querySelector('.detail-media-section h3')?.textContent
  }));
  await page.locator('button[data-add-media-for]').first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.setInputFiles('#mediaUploadInput', 'G:/Git/Kinship_Experimental/qa-temp/app/14-Magnus.jpg').catch((e) => logs.push(`picker: ${String(e).slice(0, 80)}`));
  await page.waitForTimeout(9000);
  const result = await page.evaluate(() => ({
    calls: window.__qaCalls,
    toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 340)),
    heading: document.querySelector('.detail-media-section h3')?.textContent,
    newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /14-Magnus/.test(p))
  }));
  await page.evaluate(() => document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa42-person.png' });
  return { step1, state, result, logs: logs.slice(0, 10) };
}
