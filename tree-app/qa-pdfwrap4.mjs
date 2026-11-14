// QA: real PDF tile structure (link + delete + classify) in a narrow panel.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  const out = {};
  for (const width of [1500, 1100, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);

    out[width] = await page.evaluate(() => {
      document.querySelectorAll('.qa-probe').forEach((n) => n.remove());
      const host = document.querySelector('.details-panel') || document.body;
      const section = document.createElement('section');
      section.className = 'detail-section qa-probe';
      section.style.cssText = 'display:block';
      const grid = document.createElement('div');
      grid.className = 'media-grid';

      const names = [
        'England_Wales_Civil_Registration_Birth_Index_1837-1915_Thos_Rowland_Anderson.pdf',
        'Border_Cross_Arrival_1912_MARGARET_JEAN_ANDERSON.pdf'
      ];
      for (const name of names) {
        // Mirror the real renderMedia() structure exactly.
        const item = document.createElement('div');
        item.className = 'media-file-item';
        const link = document.createElement('a');
        link.className = 'media-file-link';
        link.href = '#';
        link.textContent = name;
        const unlink = document.createElement('button');
        unlink.type = 'button';
        unlink.className = 'media-remove-button';
        unlink.textContent = '🗑';
        item.append(link, unlink);
        const classify = document.createElement('label');
        classify.className = 'media-classify';
        classify.textContent = 'Classify';
        const select = document.createElement('select');
        for (const t of ['Unclassified', 'Census', 'Certificate']) {
          const o = document.createElement('option');
          o.textContent = t;
          select.append(o);
        }
        classify.append(select);
        item.append(classify);
        grid.append(item);
      }
      section.append(grid);
      host.append(section);

      return [...grid.querySelectorAll('.media-file-item')].map((item) => {
        const link = item.querySelector('.media-file-link');
        const ls = getComputedStyle(link);
        const r = link.getBoundingClientRect();
        const itemR = item.getBoundingClientRect();
        const fontSize = parseFloat(ls.fontSize);
        const lineH = parseFloat(ls.lineHeight) || fontSize * 1.35;
        return {
          itemWidth: Math.round(itemR.width),
          itemHeight: Math.round(itemR.height),
          linkWidth: Math.round(r.width),
          linkHeight: Math.round(r.height),
          charsPerLine: Math.max(1, Math.round(r.width / (fontSize * 0.52))),
          lines: Math.round(r.height / lineH),
          wordBreak: ls.wordBreak,
          overflowWrap: ls.overflowWrap
        };
      });
    });
  }
  await page.screenshot({
    path: 'g:/Git/Kinship_Experimental/qa-pdf-fixed.png',
    clip: { x: Math.max(0, 1500 - 320), y: 0, width: 300, height: 820 }
  }).catch(() => { });
  return out;
}
