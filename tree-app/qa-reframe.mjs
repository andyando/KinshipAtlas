// QA: click the hero image in the Person Record panel → reframe editor opens,
// drag/zoom changes it, Apply persists to localStorage, Cancel discards.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://127.0.0.1:8816/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1200);

  // Load the real GEDCOM.
  const ged = await page.evaluate(async () => {
    const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
    return r.ok ? await r.text() : null;
  });
  await page.evaluate(async (text) => {
    if (!text) return;
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#gedcomInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, ged);
  await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => { });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  // Pick a person with a photo (Erna) and clear any saved framing.
  await page.fill('#peopleSearch', 'Erna Johanna Magnus');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1800);

  const setup = await page.evaluate(() => {
    const photo = document.querySelector('.detail-monogram-photo');
    if (!photo) return { noPhoto: true };
    const monogram = photo.closest('.detail-monogram');
    // Ensure a hero image is set: pick the first card-image candidate if none.
    return {
      hasPhoto: true,
      title: photo.title,
      cursor: getComputedStyle(photo).cursor,
      hasReframeBtn: !!monogram.querySelector('.detail-monogram-reframe'),
      hasExpandBtn: !!monogram.querySelector('.detail-monogram-expand')
    };
  });
  if (setup.noPhoto) {
    // No card image chosen yet — choose one via the media section primary button.
    await page.evaluate(() => {
      const btn = document.querySelector('.media-primary-button');
      btn?.click();
    });
    await page.waitForTimeout(1200);
  }

  // Click the photo itself.
  await page.evaluate(() => document.querySelector('.detail-monogram-photo')?.click());
  await page.waitForTimeout(800);
  const editorOpen = await page.evaluate(() => {
    const d = document.querySelector('dialog.hero-frame-editor');
    if (!d) return { open: false };
    return {
      open: d.open,
      title: d.querySelector('h2')?.textContent?.trim(),
      hasStage: !!d.querySelector('.hero-frame-stage'),
      hasCircle: !!d.querySelector('.hero-frame-circle'),
      hint: d.querySelector('.hero-frame-hint')?.textContent?.trim().slice(0, 60),
      zoomLabel: d.querySelector('.hero-frame-zoom-value')?.textContent
    };
  });

  // Zoom in twice via the + button, drag the photo, then Apply.
  const afterEdit = await page.evaluate(async () => {
    const d = document.querySelector('dialog.hero-frame-editor');
    if (!d) return { missing: true };
    const stage = d.querySelector('.hero-frame-stage');
    const img = d.querySelector('.hero-frame-photo');
    const rect = stage.getBoundingClientRect();
    const start = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    // Simulate a drag: pointerdown, moves, pointerup on the img.
    const fire = (type, x, y) => img.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire('pointerdown', start, startY);
    fire('pointermove', start + 40, startY + 30);
    fire('pointerup', start + 40, startY + 30);
    d.querySelector('[data-zoom="in"]').click();
    d.querySelector('[data-zoom="in"]').click();
    const zoomShown = d.querySelector('.hero-frame-zoom-value')?.textContent;
    const transform = img.style.transform;
    d.querySelector('.hero-frame-apply').click();
    return { zoomShown, transform, toast: document.querySelector('#toast')?.textContent?.trim() };
  });
  await page.waitForTimeout(1200);

  const persisted = await page.evaluate(() => {
    const photo = document.querySelector('.detail-monogram-photo');
    const saved = Object.keys(localStorage).filter((k) => k.includes('hero-frame'));
    const raw = saved[0] ? localStorage.getItem(saved[0]) : null;
    return {
      savedKeys: saved.length,
      framing: raw ? JSON.parse(raw) : null,
      panelTransform: photo ? photo.style.transform : null,
      panelHasFlag: !!document.querySelector('.detail-monogram.hero-frame-applied')
    };
  });

  // Reopen and Cancel — changes made then discarded must not persist.
  await page.evaluate(() => document.querySelector('.detail-monogram-photo')?.click());
  await page.waitForTimeout(700);
  const cancelTest = await page.evaluate(() => {
    const d = document.querySelector('dialog.hero-frame-editor');
    d.querySelector('.hero-frame-reset').click();
    d.querySelector('[data-zoom="in"]').click();
    d.querySelector('.hero-frame-cancel').click();
    const keys = Object.keys(localStorage).filter((k) => k.includes('hero-frame'));
    return { afterCancelKeys: keys.length };
  });
  await page.waitForTimeout(600);

  // Change person and back — framing still applied.
  await page.fill('#peopleSearch', 'Daniel Magnus');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Daniel Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1500);
  await page.fill('#peopleSearch', 'Erna Johanna Magnus');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Erna Johanna Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1500);
  const afterSwitch = await page.evaluate(() => ({
    stillApplied: !!document.querySelector('.detail-monogram.hero-frame-applied')
  }));

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-reframe.png' });
  // Clean up saved framing so the test is repeatable.
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.includes('hero-frame')).forEach((k) => localStorage.removeItem(k));
  });
  return { setup, editorOpen, afterEdit, persisted, cancelTest, afterSwitch };
}
