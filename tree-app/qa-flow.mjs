// QA: minimum viable click path check.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8807/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);

  // Select Erna.
  const sel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    const match = rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent));
    if (!match) return { noMatch: true, total: rows.length };
    match.click();
    return { ok: true, total: rows.length };
  });
  await page.waitForTimeout(2000);

  const btns = await page.evaluate(() => ({
    count: document.querySelectorAll('button[data-public-records-search]').length,
    id: document.querySelector('button[data-public-records-search]')?.dataset.publicRecordsSearch,
    personName: document.querySelector('#focusTitle')?.textContent.trim()
  }));

  await page.evaluate(() => {
    const b = document.querySelector('button[data-public-records-search]');
    b?.click();
  });
  await page.waitForTimeout(1400);

  const dlg = await page.evaluate(() => ({
    open: document.querySelector('#researchDialog')?.open,
    person: document.querySelector('#publicRecordsPersonName')?.textContent,
    cards: document.querySelectorAll('.public-record-card').length
  }));
  return { sel, btns, dlg };
}
