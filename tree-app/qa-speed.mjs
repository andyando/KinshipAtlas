// QA: All-years default + three playback speeds.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto('http://127.0.0.1:8804/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /set as primary person/i.test(b.textContent || ''))?.click();
  });
  await page.waitForTimeout(1200);
  await page.selectOption('#viewSwitch', 'map');
  await page.waitForTimeout(5000);

  const initial = await page.evaluate(() => {
    const range = document.querySelector('.map-timeline-range');
    const reset = document.querySelector('.map-timeline-reset');
    return {
      rangeValue: range?.value, rangeMin: range?.min, rangeMax: range?.max,
      label: document.querySelector('.map-timeline-label')?.textContent,
      status: document.querySelector('.map-status')?.textContent,
      allYearsActive: reset?.classList.contains('is-active'),
      resetAria: reset?.getAttribute('aria-pressed'),
      markers: document.querySelectorAll('.map-marker').length,
      buttons: [...document.querySelectorAll('.map-timeline-play')].map((b) => ({
        cls: b.className.replace('icon-button ', ''),
        glyph: b.textContent,
        title: b.title
      }))
    };
  });

  // Measure years advanced per second at each speed.
  const measure = async (mode) => page.evaluate((m) => new Promise((resolve) => {
    const range = document.querySelector('.map-timeline-range');
    const btn = document.querySelector(`.map-timeline-${m}`);
    // Start from the first year each time.
    range.value = String(Number(range.min));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    const before = Number(range.value);
    btn.click();
    setTimeout(() => {
      const during = Number(range.value);
      const glyph = btn.textContent;
      const playing = btn.classList.contains('is-playing');
      btn.click(); // pause
      setTimeout(() => resolve({
        mode: m, before, during,
        advanced: during - before,
        glyphWhilePlaying: glyph,
        highlighted: playing
      }), 150);
    }, 1100);
  }), mode);

  const play = await measure('play');
  const forward = await measure('forward');
  const fastForward = await measure('fastForward');

  await page.evaluate(() => document.querySelector('.map-timeline-reset').click());
  await page.waitForTimeout(400);
  const afterReset = await page.evaluate(() => ({
    label: document.querySelector('.map-timeline-label')?.textContent,
    status: document.querySelector('.map-status')?.textContent,
    markers: document.querySelectorAll('.map-marker').length,
    allYearsActive: document.querySelector('.map-timeline-reset').classList.contains('is-active')
  }));

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-speed.png' });
  return { initial, play, forward, fastForward, afterReset };
}
