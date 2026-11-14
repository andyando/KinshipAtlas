// QA: full click path — load GEDCOM, pick Erna, click Search Public Records.
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
  await page.waitForTimeout(800);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(() => {
    const btn = document.querySelector('button[data-public-records-search]');
    if (!btn) return { noBtn: true };
    const info = { text: btn.textContent, title: btn.title, aria: btn.getAttribute('aria-label'), visible: btn.getBoundingClientRect().width > 0 };
    btn.click();
    return info;
  });
  await page.waitForTimeout(1500);

  const modal = await page.evaluate(() => ({
    open: document.querySelector('#researchDialog')?.open,
    title: document.querySelector('#researchDialog h2, #researchDialog .modal-title, #researchDialog [class*="title"]')?.textContent?.trim(),
    name: document.querySelector('#publicRecordsPersonName')?.textContent,
    dates: document.querySelector('#publicRecordsPersonDates')?.textContent,
    cards: [...document.querySelectorAll('.public-record-card')].map((c) => ({
      provider: c.dataset.providerId,
      name: c.querySelector('.public-record-name')?.textContent,
      status: c.querySelector('.public-record-status')?.textContent.trim()
    })),
    searchAll: !!document.querySelector('#searchAllPublicRecords')
  }));

  // Trigger Search All and watch statuses stream in (real network calls).
  await page.evaluate(() => document.querySelector('#searchAllPublicRecords')?.click());
  await page.waitForTimeout(9000);
  const live = await page.evaluate(() => [...document.querySelectorAll('.public-record-card')].map((c) => ({
    provider: c.dataset.providerId,
    status: c.querySelector('.public-record-status')?.textContent.trim(),
    results: c.querySelectorAll('.public-record-item').length
  })));

  // Close via ESC and confirm focus/state reset.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const closed = await page.evaluate(() => ({
    open: document.querySelector('#researchDialog')?.open,
    btnStillThere: !!document.querySelector('button[data-public-records-search]')
  }));

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-modal.png' });
  return { probe, modal, live, closed, errors };
}
