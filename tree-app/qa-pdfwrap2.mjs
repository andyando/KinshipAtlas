// QA: build a media grid with long PDF filenames and measure wrapping.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1000);

  // Render a real media grid with representative PDF filenames, using the same
  // classes the app produces, so the CSS under test is the shipped CSS.
  const result = await page.evaluate(() => {
    const host = document.querySelector('.details-panel') || document.body;
    const section = document.createElement('section');
    section.className = 'detail-section';
    section.style.cssText = 'display:block';
    const grid = document.createElement('div');
    grid.className = 'media-grid';
    const names = [
      'England_Wales_Civil_Registration_Birth_Index_1837-1915_Thos_Rowland_Anderson.pdf',
      'Border_Cross_Arrival_1912_MARGARET_JEAN_ANDERSON_and_children.pdf',
      'N',
      'Scottish_Statutory_Deaths_1855-1972_Ernestine_Hortense_Oulmann.pdf'
    ];
    for (const name of names) {
      const item = document.createElement('div');
      item.className = 'media-file-item';
      const link = document.createElement('a');
      link.className = 'media-file-link';
      link.textContent = name;
      link.href = '#';
      item.append(link);
      grid.append(item);
    }
    section.append(grid);
    host.append(section);
    return grid;
  });

  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const items = [...document.querySelectorAll('.media-file-item')];
    return items.map((item) => {
      const link = item.querySelector('.media-file-link');
      const ls = getComputedStyle(link);
      const r = link.getBoundingClientRect();
      const itemR = item.getBoundingClientRect();
      const fontSize = parseFloat(ls.fontSize);
      return {
        text: (link.textContent || '').slice(0, 30),
        linkWidth: Math.round(r.width),
        linkHeight: Math.round(r.height),
        itemWidth: Math.round(itemR.width),
        gridColumnWidth: Math.round(itemR.width),
        wordBreak: ls.wordBreak,
        overflowWrap: ls.overflowWrap,
        minWidth: ls.minWidth,
        // Roughly how many characters fit on a line.
        charsPerLine: Math.max(1, Math.round(r.width / (fontSize * 0.52))),
        lineCount: Math.round(r.height / parseFloat(ls.lineHeight || fontSize * 1.4))
      };
    });
  });
}
