// QA: reproduce the narrow-column PDF wrapping bug.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  const results = {};
  for (const width of [1500, 1100, 900, 760]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      document.querySelectorAll('.qa-media-probe').forEach((n) => n.remove());
      const host = document.querySelector('.details-panel') || document.body;
      const section = document.createElement('section');
      section.className = 'detail-section qa-media-probe';
      section.style.cssText = 'display:block';
      const grid = document.createElement('div');
      grid.className = 'media-grid';
      for (const name of [
        'England_Wales_Civil_Registration_Birth_Index_1837-1915_Thos_Rowland_Anderson.pdf',
        'Border_Cross_Arrival_1912_MARGARET_JEAN_ANDERSON_and_children.pdf'
      ]) {
        const item = document.createElement('div');
        item.className = 'media-file-item';
        const link = document.createElement('a');
        link.className = 'media-file-link';
        link.href = '#';
        link.textContent = name;
        item.append(link);
        grid.append(item);
      }
      section.append(grid);
      host.append(section);

      const first = grid.querySelector('.media-file-link');
      const ls = getComputedStyle(first);
      const r = first.getBoundingClientRect();
      const cols = getComputedStyle(grid).gridTemplateColumns;
      return {
        panelWidth: Math.round(document.querySelector('.details-panel').getBoundingClientRect().width),
        gridWidth: Math.round(grid.getBoundingClientRect().width),
        gridColumns: cols,
        linkWidth: Math.round(r.width),
        linkHeight: Math.round(r.height),
        wordBreak: ls.wordBreak,
        overflowWrap: ls.overflowWrap,
        charsPerLine: Math.max(1, Math.round(r.width / (parseFloat(ls.fontSize) * 0.52))),
        charHeight: Math.round(r.height / Math.max(1, name_lines(r.height, ls)))
      };
      function name_lines(h, s) { return Math.round(h / parseFloat(s.lineHeight || parseFloat(s.fontSize) * 1.4)); }
    });
    results[width] = data;

    await page.screenshot({ path: `g:/Git/Kinship_Experimental/qa-wrap-${width}.png`, clip: { x: width - 340, y: 0, width: 340, height: 700 } }).catch(() => { });
  }
  return results;
}
