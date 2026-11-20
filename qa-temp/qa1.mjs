export default async function run(page, ui) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  await page.waitForTimeout(6000);
  report.steps.push({ step: 'loaded', people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent) });
  const lib = await page.evaluate(() => {
    const btn = document.querySelector('#mediaLibraryButton');
    if (!btn || btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  });
  report.steps.push({ step: 'library', lib });
  await page.waitForTimeout(2500);
  report.steps.push({
    step: 'library view',
    cards: await page.locator('.media-library-card').count(),
    toggle: await page.evaluate(() => ['#mediaLibraryCardsButton', '#mediaLibraryTableButton'].map((s) => {
      const b = document.querySelector(s); return b ? `${s}:${b.getAttribute('aria-pressed')}` : `${s}:missing`;
    })),
    bulkButtons: await page.evaluate(() => [...document.querySelectorAll('.media-library-bulk .button')].map((b) => b.textContent.trim()))
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/library-cards.png' });
  return report;
}
