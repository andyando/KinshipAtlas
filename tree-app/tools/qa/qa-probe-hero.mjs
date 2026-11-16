// Manual QA probe for the hero-photo workflow; requires the local QA server and sample GEDCOM.
export default async function run(page, baseUrl = process.env.KINSHIP_QA_URL || 'http://127.0.0.1:8811') {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/index.html?v=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  // Give the media-folder lookup a moment to register availability.
  await page.waitForTimeout(1500);
  // Load the real GEDCOM via the file input.
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
  await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(800);

  // Pick Daniel Magnus (known to have a photo in the media folder).
  await page.fill('#peopleSearch', 'Daniel Magnus');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button, #peopleList [data-person-id]')];
    rows.find((r) => /Daniel Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(2000);

  const probe1 = await page.evaluate(() => {
    const mono = document.querySelector('.detail-monogram');
    const photo = mono?.querySelector('.detail-monogram-photo');
    return {
      hasMonogram: !!mono,
      hasPhoto: !!photo,
      photoSrc: photo?.src || null,
      reframeBtn: !!document.querySelector('.detail-monogram-reframe'),
      classes: mono ? [...mono.classList] : []
    };
  });

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('kinship-atlas:hero-frame:'));
    if (key) localStorage.removeItem(key);
  });

  // Open the reframe editor.
  await page.evaluate(() => document.querySelector('.detail-monogram-reframe')?.click());
  await page.waitForTimeout(800);
  const editorOpen = await page.evaluate(() => !!document.querySelector('.hero-frame-editor'));

  // Simulate drag pan + wheel zoom inside the editor stage.
  const dragged = await page.evaluate(() => {
    const stage = document.querySelector('.hero-frame-stage');
    if (!stage) return { missing: true };
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: cx, clientY: cy }));
    stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 1, clientX: cx + 40, clientY: cy + 20 }));
    stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: cx + 40, clientY: cy + 20 }));
    stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
    const img = stage.querySelector('img');
    return { transform: img ? img.style.transform : null };
  });
  await page.waitForTimeout(300);

  // Save.
  await page.evaluate(() => {
    document.querySelector('.hero-frame-apply')?.click();
  });
  await page.waitForTimeout(600);

  const saved = await page.evaluate(() => Object.keys(localStorage)
    .filter((k) => k.startsWith('kinship-atlas:hero-frame:'))
    .map((k) => ({ key: k, val: localStorage.getItem(k) })));

  // Navigate away and back to confirm the framing persists and is applied.
  await page.fill('#peopleSearch', 'Erna');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Erna/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1200);
  await page.fill('#peopleSearch', 'Daniel Magnus');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll('#peopleList button')].find((r) => /Daniel Magnus/i.test(r.textContent))?.click();
  });
  await page.waitForTimeout(1500);

  const reopen = await page.evaluate(() => {
    const photo = document.querySelector('.detail-monogram-photo');
    return {
      classes: [...(document.querySelector('.detail-monogram')?.classList || [])],
      transform: photo?.style.transform || null
    };
  });

  // Cancel path: open editor again, cancel — framing unchanged.
  await page.evaluate(() => document.querySelector('.detail-monogram-reframe')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    [...document.querySelectorAll('.hero-frame-editor button')]
      .find((b) => /cancel/i.test(b.textContent || ''))?.click();
  });
  await page.waitForTimeout(400);
  const afterCancel = await page.evaluate(() => ({
    editorOpen: !!document.querySelector('.hero-frame-editor'),
    savedKeys: Object.keys(localStorage).filter((k) => k.startsWith('kinship-atlas:hero-frame:')).length
  }));

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-hero-reframe.png' });
  return { probe1, editorOpen, dragged, saved, reopen, afterCancel };
}
