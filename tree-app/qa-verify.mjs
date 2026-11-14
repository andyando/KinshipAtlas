// QA: verify PDF tiles wrap properly at the narrow width that used to break.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  await page.setViewportSize({ width: 760, height: 1000 });
  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => {
    document.querySelectorAll('.qa-probe').forEach((n) => n.remove());
    const host = document.querySelector('.details-panel') || document.body;
    const section = document.createElement('section');
    section.className = 'detail-section qa-probe';
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
        wordBreak: ls.wordBreak
      };
    });
  });

  await page.screenshot({
    path: 'g:/Git/Kinship_Experimental/qa-wrap-fixed-760.png',
    clip: { x: 760 - 300, y: 0, width: 280, height: 820 }
  }).catch(() => { });

  return metrics;
}
