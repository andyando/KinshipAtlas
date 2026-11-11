// QA: render the gender icons exactly as the Person Record heading uses them,
// alongside a magnified copy, and screenshot for visual inspection.
export default async function run(page, ui) {
  const paths = await page.evaluate(() => {
    // Pull the icon markup straight out of the app so we test the real thing.
    return new Promise((resolve) => {
      // app.js keeps icons in a closure; reconstruct from the same source strings
      // by triggering a details render is impossible without a tree, so fall back
      // to reading the icon definitions from the served script text.
      fetch('app.js').then((r) => r.text()).then((src) => {
        const male = src.match(/male: '<circle[^']+'/)[0];
        const female = src.match(/female: '<circle[^']+'/)[0];
        resolve({ male, female });
      });
    });
  });

  await page.evaluate(({ /* destructure below */ }) => { }, {});
  await page.evaluate((paths) => {
    const maleInner = paths.male.replace(/^male: '|'$/g, '');
    const femaleInner = paths.female.replace(/^female: '|'$/g, '');
    const svg = (inner, size) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;background:#fff;padding:16px;display:flex;align-items:center;gap:18px;border:2px solid #2f786a;';
    host.innerHTML =
      '<span class="eyebrow" style="font-size:10px;font-weight:800;letter-spacing:1.4px;color:#788983;">' +
      `<span class="button-icon">${svg(maleInner, 12)}</span> PERSON RECORD</span>` +
      `<span>${svg(maleInner, 24)}</span><span>${svg(femaleInner, 24)}</span>` +
      `<span>${svg(maleInner, 72)}</span><span>${svg(femaleInner, 72)}</span>`;
    document.body.append(host);
    host.id = 'qa-icon-host';
  }, paths);

  await page.screenshot({ path: 'qa-icons.png', clip: { x: 0, y: 0, width: 420, height: 110 } });

  // Structural check: each icon must have exactly one circle and no self-crossing strokes.
  return {
    ...paths,
    structural: await page.evaluate(() => {
      const host = document.querySelector('#qa-icon-host');
      const svgs = host.querySelectorAll('svg');
      const report = [];
      for (const svg of svgs) {
        const c = svg.querySelectorAll('circle');
        const p = svg.querySelectorAll('path');
        report.push({ circles: c.length, paths: p.length, r: c.length ? c[0].getAttribute('r') : null, cx: c.length ? c[0].getAttribute('cx') : null });
      }
      return report;
    })
  };
}
