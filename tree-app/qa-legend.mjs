// QA: verify the vertical legend with a primary person set.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto('http://127.0.0.1:8803/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1200);

  // The legend needs a primary person to show lineage categories.
  const primarySet = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /set as primary person/i.test(b.textContent || ''));
    if (btn) { btn.click(); return 'clicked'; }
    return 'no button';
  });
  await page.waitForTimeout(1500);
  await page.selectOption('#viewSwitch', 'map');
  await page.waitForTimeout(4000);

  return page.evaluate(() => {
    const el = document.querySelector('.map-relative-legend');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const items = [...el.querySelectorAll('.map-legend-item')].map((i) => {
      const r = i.getBoundingClientRect();
      return { text: i.textContent.trim().slice(0, 24), top: Math.round(r.top), left: Math.round(r.left) };
    });
    const pill = document.querySelector('.map-timeline')?.getBoundingClientRect();
    return {
      hidden: el.hidden,
      display: cs.display,
      flexDirection: cs.flexDirection,
      left: Math.round(rect.left),
      bottomFromViewport: Math.round(window.innerHeight - rect.bottom),
      boxW: Math.round(rect.width), boxH: Math.round(rect.height),
      items,
      itemCount: items.length,
      stacked: items.length > 1 && items.every((it, i) => i === 0 || it.top > items[i - 1].top),
      alignedLeft: items.length > 1 && items.every((it) => Math.abs(it.left - items[0].left) < 2),
      overlapsPill: pill ? !(rect.bottom < pill.top || rect.top > pill.bottom || rect.right < pill.left || rect.left > pill.right) : null
    };
  });
}
