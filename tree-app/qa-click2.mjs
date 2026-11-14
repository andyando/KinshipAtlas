// QA: trace the click path with error capture.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8807/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(() => {
    window.__openCalls = [];
    const btn = document.querySelector('button[data-public-records-search]');
    if (!btn) return { noBtn: true };
    const info = {
      btnText: btn.textContent,
      title: btn.title,
      visible: btn.getBoundingClientRect().width > 0,
      disabled: btn.disabled,
      personId: btn.dataset.publicRecordsSearch
    };
    btn.click();
    return info;
  });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    open: document.querySelector('#researchDialog')?.open,
    name: document.querySelector('#publicRecordsPersonName')?.textContent
  }));
  return { probe, after, errors };
}
