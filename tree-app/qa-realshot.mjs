// QA: render PDF tiles at two widths and screenshot just that region,
// also dumping the exact box geometry so the image can be checked against it.
export default async function run(page) {
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  const results = {};

  for (const width of [760, 1500]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      document.querySelectorAll('.qa-probe').forEach((n) => n.remove());
      const host = document.querySelector('.details-panel') || document.body;
      const section = document.createElement('section');
      section.className = 'detail-section qa-probe';
      section.style.cssText = 'display:block; padding: 12px;';
      const grid = document.createElement('div');
      grid.className = 'media-grid';

      for (const name of [
        'England_Wales_Civil_Registration_Birth_Index_1837-1915_Thos_Rowland_Anderson.pdf',
        'Border_Cross_Arrival_1912_MARGARET_JEAN_ANDERSON.pdf'
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
        for (const t of ['Unclassified', 'Census']) {
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

      const probe = section.getBoundingClientRect();
      const tiles = [...grid.querySelectorAll('.media-file-item')].map((item) => {
        const link = item.querySelector('.media-file-link');
        const ls = getComputedStyle(link);
        const r = link.getBoundingClientRect();
        const itemR = item.getBoundingClientRect();
        return {
          itemW: Math.round(itemR.width), itemH: Math.round(itemR.height),
          linkW: Math.round(r.width), linkH: Math.round(r.height),
          whiteSpace: ls.whiteSpace, wordBreak: ls.wordBreak, overflowWrap: ls.overflowWrap,
          lineHeight: ls.lineHeight, fontSize: ls.fontSize
        };
      });
      return {
        probeBox: { x: Math.round(probe.x), y: Math.round(probe.y), w: Math.round(probe.width), h: Math.round(probe.height) },
        tiles
      };
    });

    results[width] = info;
    const box = info.probeBox;
    await page.screenshot({
      path: `g:/Git/Kinship_Experimental/qa-tiles-${width}.png`,
      clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: Math.min(box.w + 8, width), height: Math.min(box.h + 8, 860) }
    }).catch((e) => { results[width].screenshotError = String(e).slice(0, 120); });
  }

  return results;
}
