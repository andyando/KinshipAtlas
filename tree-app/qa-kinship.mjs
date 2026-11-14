// QA: confirm the "Relationship to primary person" section is collapsible too.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('http://127.0.0.1:8805/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);

  // Set a primary person, then select a different one so kinship shows.
  const setup = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
    return rows.length;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /set as primary person/i.test(b.textContent || ''))?.click();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Andrew Graeme Anderson/i.test(r.textContent))?.click() || rows[0]?.click();
  });
  await page.waitForTimeout(1800);

  const titles = await page.evaluate(() => [...document.querySelectorAll('.details-panel .detail-section')].map((s) => ({
    title: s.dataset.sectionTitle,
    collapsed: s.classList.contains('is-collapsed'),
    isButton: s.querySelector('.detail-section-title')?.tagName === 'BUTTON',
    hasChevron: !!s.querySelector('.detail-section-chevron')
  })));

  // Toggle the kinship section off and on.
  const toggled = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.details-panel .detail-section')]
      .find((x) => x.dataset.sectionTitle === 'Relationship to primary person');
    if (!s) return { missing: true };
    s.querySelector('.detail-section-title').click();
    const collapsedNow = s.classList.contains('is-collapsed');
    const bodyHidden = s.querySelector('.detail-section-body')?.hidden;
    s.querySelector('.detail-section-title').click();
    return { missing: false, collapsedAfterClick: collapsedNow, bodyHidden, reopened: !s.classList.contains('is-collapsed') };
  });

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-kinship.png' });
  return { rows: setup, titles, toggled };
}
