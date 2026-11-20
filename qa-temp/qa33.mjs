export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.__qaCalls = { media: 0 };
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
  await page.waitForTimeout(4000);
  const loaded = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Primary|Open tree|Load/i.test(b.textContent) && !b.disabled);
    if (!btn) return 'no button';
    btn.click();
    return btn.textContent.trim();
  });
  await page.waitForTimeout(30000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  return { loaded, people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent), logs: logs.slice(-15) };
}
