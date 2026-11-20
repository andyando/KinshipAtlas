export default async function run(page, ui) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#mediaLibraryButton')?.click());
  await page.waitForTimeout(2000);

  // Table view
  await page.evaluate(() => document.querySelector('#mediaLibraryTableButton').click());
  await page.waitForTimeout(1200);
  report.steps.push({
    step: 'table',
    rows: await page.locator('.media-library-table tbody tr').count(),
    thumbs: await page.locator('.media-library-table .media-library-row-thumb').count(),
    thumbSize: await page.evaluate(() => {
      const t = document.querySelector('.media-library-table .media-library-row-thumb');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), tag: t.tagName };
    }),
    pressed: await page.evaluate(() => [document.querySelector('#mediaLibraryCardsButton').getAttribute('aria-pressed'), document.querySelector('#mediaLibraryTableButton').getAttribute('aria-pressed')]),
    cardsGone: (await page.locator('.media-library-card').count()) === 0,
    headers: await page.evaluate(() => [...document.querySelectorAll('.media-library-table th')].map((th) => th.textContent.trim())),
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/library-table.png' });

  // Selection from a row stays in step with the bulk bar.
  const selection = await page.evaluate(async () => {
    const box = document.querySelector('.media-library-table tbody tr .media-library-select');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      count: document.querySelector('#mediaLibrarySelectionCount').textContent,
      rowSelected: box.closest('tr').classList.contains('is-selected')
    };
  });
  report.steps.push({ step: 'row select', selection });

  // Back to cards, remembered.
  await page.evaluate(() => document.querySelector('#mediaLibraryCardsButton').click());
  await page.waitForTimeout(800);
  report.steps.push({ step: 'cards again', cards: await page.locator('.media-library-card').count() });

  // Person record: open the first person with a card image and check folder creation
  // happens for everyone once the media folder is writable.
  report.steps.push({
    step: 'folder count',
    dirs: await page.evaluate(async () => {
      const q = await fetch('/api/media-info').then((r) => r.json()).catch(() => null);
      return q;
    })
  });
  return report;
}
