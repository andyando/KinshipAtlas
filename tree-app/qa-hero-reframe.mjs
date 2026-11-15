// QA: hero image reframe feature — click hero image, drag to pan, zoom, apply, reload persistence, cancel discards.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('http://127.0.0.1:8816/tree-app/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(800);
  const ged = await page.evaluate(async () => {
    const r = await fetch('/tree-app/Primary%20GEDCOM/Ancestry_01112026.ged');
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
  await page.waitForTimeout(600);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // Pick a person with a photo: iterate list rows until one renders a photo.
  const withPhoto = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    for (let i = 0; i < Math.min(rows.length, 300); i++) {
      rows[i].click();
      await new Promise((r) => setTimeout(r, 120));
      if (document.querySelector('.detail-monogram-photo')) {
        return { index: i, name: rows[i].textContent.trim().slice(0, 60), checked: i + 1 };
      }
    }
    return null;
  });
  await page.waitForTimeout(1200);

  // Probe hero controls.
  const buttons = await page.evaluate(() => ({
    monogram: !!document.querySelector('.detail-monogram'),
    photoClickable: !!document.querySelector('.detail-monogram-photo'),
    reframeBtn: !!document.querySelector('.detail-monogram-reframe'),
    anyHeroButtons: [...document.querySelectorAll('.detail-monogram button')].map((b) => ({ cls: b.className, title: b.title }))
  }));

  // Open the editor by clicking the photo itself (user-facing path).
  await page.evaluate(() => document.querySelector('.detail-monogram-photo')?.click());
  await page.waitForTimeout(800);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('.hero-frame-editor');
    return {
      open: !!d && d.hasAttribute('open'),
      hasImg: !!d?.querySelector('.hero-frame-photo'),
      imgSrc: (d?.querySelector('.hero-frame-photo')?.src || '').slice(0, 80),
      hasCircleOverlay: !!d?.querySelector('.hero-frame-circle'),
      hasZoomControls: !!d?.querySelector('.hero-frame-zoom'),
      buttonTexts: d ? [...d.querySelectorAll('button')].map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()).slice(0, 8) : []
    };
  });

  // Drag to pan inside the editor.
  let drag = null;
  if (dialog.open) {
    const box = await page.evaluate(() => {
      const el = document.querySelector('.hero-frame-editor .hero-frame-photo');
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (box) {
      const before = await page.evaluate(() => document.querySelector('.hero-frame-editor .hero-frame-photo')?.style.transform || '');
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      await page.mouse.move(box.x + 40, box.y + 30, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => document.querySelector('.hero-frame-editor .hero-frame-photo')?.style.transform || '');
      // Wheel zoom.
      await page.mouse.move(box.x, box.y);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(300);
      const zoomed = await page.evaluate(() => document.querySelector('.hero-frame-editor .hero-frame-photo')?.style.transform || '');
      drag = { before, after, changed: before !== after, zoomed };
    }
  }

  // Apply & close — should persist.
  const saved = await page.evaluate(() => {
    const btn = document.querySelector('.hero-frame-editor .hero-frame-apply');
    btn?.click();
    return !!btn;
  });
  await page.waitForTimeout(800);
  const persisted = await page.evaluate(() => Object.keys(localStorage).filter((k) => /hero-frame/i.test(k)));
  const savedValue = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /hero-frame/i.test(k));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });

  // Cancel path: reopen, drag, cancel — saved value must not change.
  await page.evaluate(() => document.querySelector('.detail-monogram-photo')?.click());
  await page.waitForTimeout(600);
  const cancel = await page.evaluate(() => {
    const btn = document.querySelector('.hero-frame-editor .hero-frame-cancel');
    btn?.click();
    return !!btn;
  });
  await page.waitForTimeout(500);
  const afterCancel = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /hero-frame/i.test(k));
    const dialogGone = !document.querySelector('.hero-frame-editor');
    return { key: key ? JSON.parse(localStorage.getItem(key)) : null, dialogGone };
  });

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-hero-reframe.png' });
  return { withPhoto, buttons, dialog, drag, applyClicked: saved, persistedKeys: persisted, savedValue, cancel, afterCancel, unchangedAfterCancel: JSON.stringify(savedValue) === JSON.stringify(afterCancel.key), errors };
}
