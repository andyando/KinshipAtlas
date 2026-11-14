// QA: verify Europeana guid links and DPLA with a name that has hits.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://127.0.0.1:8811/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const ged = await page.evaluate(async () => {
    const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
    return r.ok ? await r.text() : null;
  });
  await page.evaluate(async (text) => {
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#gedcomInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, ged);
  await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => { });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  // Samuel Magnus (1799) — ancestors are more likely in public collections.
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Samuel Magnus/i.test(r.textContent) && /1799/.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('button[data-public-records-search]')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#searchAllPublicRecords')?.click());
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('.public-record-card')];
    return cards.every((c) => !/Searching/i.test(c.querySelector('.public-record-status')?.textContent || ''));
  }, { timeout: 90000 }).catch(() => { });
  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-providers.png' });
  return page.evaluate(() => ({
    layout: {
      dialogOverflowX: document.querySelector('#researchDialog').scrollWidth - document.querySelector('#researchDialog').clientWidth,
      pageHorizScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialogScrollsY: document.querySelector('#researchDialog').scrollHeight - document.querySelector('#researchDialog').clientHeight
    },
    providers: [...document.querySelectorAll('.public-record-card')].map((c) => ({
      provider: c.dataset.providerId,
      status: c.querySelector('.public-record-status')?.textContent.trim(),
      links: [...c.querySelectorAll('.public-record-item a')].slice(0, 3).map((a) => a.href)
    }))
  }));
}
