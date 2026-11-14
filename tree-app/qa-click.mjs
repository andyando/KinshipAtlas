// QA: debug the click path from button to dialog.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8807/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1800);

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    window.__stage = [];
    document.querySelector('button[data-public-records-search]')?.click();
  });
  await page.waitForTimeout(800);
  const stage = await page.evaluate(() => ({
    stage: window.__stage || null,
    person: document.querySelector('#publicRecordsPersonName')?.textContent,
    open: document.querySelector('#researchDialog')?.open,
    cards: document.querySelectorAll('.public-record-card').length
  }));
  return { stage, errors };
}
