// QA: timeline years, trails removal, legend layout.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto('http://127.0.0.1:8803/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(800);
  await page.selectOption('#viewSwitch', 'map');
  await page.waitForTimeout(4000);

  const read = () => ({
    min: document.querySelector('.map-timeline-range')?.min,
    max: document.querySelector('.map-timeline-range')?.max,
    value: document.querySelector('.map-timeline-range')?.value,
    label: document.querySelector('.map-timeline-label')?.textContent,
    markers: document.querySelectorAll('.map-marker').length,
    status: document.querySelector('.map-status')?.textContent,
    trails: document.querySelectorAll('.map-trail, .map-trails').length
  });

  const initial = await page.evaluate(read);

  // Step to a few years and record how markers grow.
  const steps = [];
  for (const year of [1670, 1700, 1750, 1800, 1850, 1900, 1950, 2024]) {
    const sample = await page.evaluate((y) => {
      const range = document.querySelector('.map-timeline-range');
      range.value = String(y);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => setTimeout(() => resolve({
        year: y,
        label: document.querySelector('.map-timeline-label')?.textContent,
        markers: document.querySelectorAll('.map-marker').length,
        status: document.querySelector('.map-status')?.textContent
      }), 300));
    }, year);
    steps.push(sample);
  }

  // Legend geometry.
  const legend = await page.evaluate(() => {
    const el = document.querySelector('.map-relative-legend');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const items = [...el.querySelectorAll('.map-legend-item')].map((i) => {
      const r = i.getBoundingClientRect();
      return { text: i.textContent.trim(), top: Math.round(r.top), left: Math.round(r.left) };
    });
    return {
      hidden: el.hidden,
      display: cs.display,
      flexDirection: cs.flexDirection,
      rect: { left: Math.round(rect.left), bottom: Math.round(window.innerHeight - rect.bottom), w: Math.round(rect.width), h: Math.round(rect.height) },
      items,
      verticallyStacked: items.length > 1 ? items.every((it, i) => i === 0 || it.top > items[i - 1].top) : null,
      allSameLeft: items.length > 1 ? items.every((it) => it.left === items[0].left) : null
    };
  });

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-tl2.png' });
  return { initial, steps, legend };
}
