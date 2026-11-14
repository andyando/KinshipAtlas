// QA: confirm DPLA completes, Europeana guid URLs, single-scrollbar layout.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://127.0.0.1:8811/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const ged = await page.evaluate(async () => {
    const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
    return r.ok ? await r.text() : null;
  });
  await page.evaluate(async (text) => {
    if (!text) return;
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#gedcomInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, ged);
  await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => { });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('button[data-public-records-search]')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#searchAllPublicRecords')?.click());
  // Wait up to 45 s for the DPLA card to leave "Searching".
  await page.waitForFunction(() => {
    const card = document.querySelector('.public-record-card[data-provider-id="dpla"]');
    const s = card?.querySelector('.public-record-status')?.textContent || '';
    return !/Searching/i.test(s);
  }, { timeout: 45000 }).catch(() => { });
  return page.evaluate(() => {
    const dlg = document.querySelector('#researchDialog');
    const dRect = dlg.getBoundingClientRect();
    const panel = dlg.querySelector('.public-records-panel');
    const providers = [...document.querySelectorAll('.public-record-card')].map((c) => ({
      provider: c.dataset.providerId,
      status: c.querySelector('.public-record-status')?.textContent.trim(),
      items: [...c.querySelectorAll('.public-record-item')].slice(0, 2).map((i) => ({
        href: i.querySelector('a')?.href,
        text: i.textContent.trim().slice(0, 60)
      }))
    }));
    return {
      dialogOverflowX: dlg.scrollWidth - dlg.clientWidth,
      panelScrollsY: panel ? panel.scrollHeight - panel.clientHeight : null,
      dialogScrollsY: dlg.scrollHeight - dlg.clientHeight,
      pageHorizScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      providers
    };
  });
}
