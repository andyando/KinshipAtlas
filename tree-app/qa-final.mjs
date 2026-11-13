// QA: final verification with cache disabled — no trails, vertical legend, correct years.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  const url = 'http://127.0.0.1:8803/index.html?v=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);

  // Ensure a primary person so the lineage legend is populated.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /set as primary person/i.test(b.textContent || ''));
    btn?.click();
  });
  await page.waitForTimeout(1200);

  await page.selectOption('#viewSwitch', 'map');
  await page.waitForTimeout(5000);

  const probe = await page.evaluate(() => {
    const legend = document.querySelector('.map-relative-legend');
    const pill = document.querySelector('.map-timeline');
    const range = document.querySelector('.map-timeline-range');
    const items = legend ? [...legend.querySelectorAll('.map-legend-item')] : [];
    const rects = items.map((i) => i.getBoundingClientRect());
    const lr = legend?.getBoundingClientRect();
    const pr = pill?.getBoundingClientRect();
    return {
      // Trails must be gone entirely.
      trailPaths: document.querySelectorAll('.map-trail, .map-trails').length,
      trailTogglePresent: !!document.querySelector('.map-timeline-trails'),
      // Timeline state.
      rangeMin: range?.min, rangeMax: range?.max, rangeValue: range?.value,
      label: document.querySelector('.map-timeline-label')?.textContent,
      status: document.querySelector('.map-status')?.textContent,
      // Legend.
      legendHidden: legend?.hidden,
      legendDirection: legend ? getComputedStyle(legend).flexDirection : null,
      legendLeft: lr ? Math.round(lr.left) : null,
      legendBottomGap: lr ? Math.round(window.innerHeight - lr.bottom) : null,
      itemCount: items.length,
      itemsStacked: rects.length > 1 && rects.every((r, i) => i === 0 || r.top > rects[i - 1].top),
      itemsSameLeft: rects.length > 1 && rects.every((r) => Math.abs(r.left - rects[0].left) < 2),
      legendOverlapsPill: lr && pr ? !(lr.bottom < pr.top || lr.top > pr.bottom || lr.right < pr.left || lr.left > pr.right) : null,
      legendTexts: items.map((i) => i.textContent.trim().slice(0, 22))
    };
  });

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-final-map.png' });
  return probe;
}
