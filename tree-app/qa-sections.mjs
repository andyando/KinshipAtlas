// QA: collapsible person-record sections — defaults and toggling.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('http://127.0.0.1:8805/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1200);

  // Select a person with plenty of data.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click() || rows[2]?.click();
  });
  await page.waitForTimeout(1600);

  const readSections = () => [...document.querySelectorAll('.details-panel .detail-section')].map((s) => {
    const toggle = s.querySelector('.detail-section-title');
    const body = s.querySelector('.detail-section-body');
    return {
      title: s.dataset.sectionTitle || toggle?.textContent.trim(),
      collapsed: s.classList.contains('is-collapsed'),
      bodyHidden: body?.hidden,
      ariaExpanded: toggle?.getAttribute('aria-expanded'),
      hasChevron: !!s.querySelector('.detail-section-chevron'),
      isButton: toggle?.tagName === 'BUTTON',
      bodyChildren: body?.children.length
    };
  });

  const onLoad = await page.evaluate(readSections);

  // Collapse "Life events" and expand "Source references".
  const afterToggle = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('.details-panel .detail-section')];
    const life = sections.find((s) => s.dataset.sectionTitle === 'Life events');
    const src = sections.find((s) => s.dataset.sectionTitle === 'Source references');
    life.querySelector('.detail-section-title').click();
    src.querySelector('.detail-section-title').click();
    return [...document.querySelectorAll('.details-panel .detail-section')].map((s) => ({
      title: s.dataset.sectionTitle,
      collapsed: s.classList.contains('is-collapsed'),
      bodyHidden: s.querySelector('.detail-section-body')?.hidden,
      ariaExpanded: s.querySelector('.detail-section-title')?.getAttribute('aria-expanded')
    }));
  });

  // Toggle back.
  const restored = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('.details-panel .detail-section')];
    sections.forEach((s) => {
      const want = s.dataset.sectionTitle === 'Source references';
      if (s.classList.contains('is-collapsed') !== want) s.querySelector('.detail-section-title').click();
    });
    return [...document.querySelectorAll('.details-panel .detail-section')].map((s) => ({
      title: s.dataset.sectionTitle,
      collapsed: s.classList.contains('is-collapsed')
    }));
  });

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-sections.png' });
  return { onLoad, afterToggle, restored };
}
