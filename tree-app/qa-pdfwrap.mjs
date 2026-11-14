// QA: measure PDF filename layout in the Attached media grid.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);

  // Find a person who has media attached.
  const found = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    for (const row of rows.slice(0, 400)) {
      row.click();
      const section = [...document.querySelectorAll('.detail-section')]
        .find((s) => /^Attached media/i.test(s.dataset.sectionTitle || ''));
      const n = section ? Number((section.dataset.sectionTitle.match(/\((\d+)\)/) || [])[1] || 0) : 0;
      if (n > 0) return { name: row.textContent.trim().slice(0, 40), media: n };
    }
    return null;
  });
  await page.waitForTimeout(2000);

  return page.evaluate((found) => {
    const items = [...document.querySelectorAll('.media-file-item')];
    const grid = document.querySelector('.media-grid');
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const info = items.slice(0, 4).map((item) => {
      const link = item.querySelector('.media-file-link');
      const ls = link ? getComputedStyle(link) : null;
      const r = link ? link.getBoundingClientRect() : null;
      const itemR = item.getBoundingClientRect();
      return {
        text: (link?.textContent || '').slice(0, 40),
        width: r ? Math.round(r.width) : 0,
        height: r ? Math.round(r.height) : 0,
        itemWidth: Math.round(itemR.width),
        wordBreak: ls?.wordBreak,
        overflowWrap: ls?.overflowWrap,
        writingMode: ls?.writingMode,
        lineHeight: ls?.lineHeight,
        fontSize: ls?.fontSize,
        // A one-character-wide box is the bug: chars-per-line ≈ 1.
        charsWide: r && ls ? Math.round(r.width / (parseFloat(ls.fontSize) * 0.55)) : null
      };
    });
    return {
      found,
      fileItemCount: items.length,
      imageItemCount: document.querySelectorAll('.media-image-item').length,
      gridColumns: gridStyle?.gridTemplateColumns,
      gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
      items: info
    };
  }, found);
}
