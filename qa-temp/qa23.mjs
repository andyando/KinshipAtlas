export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const opened = await page.evaluate(() => {
    const details = document.querySelector('.app-shell')?.textContent.includes('Attached media');
    return { detailsVisible: details, buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /photo|media/i.test(t)).slice(0, 6) };
  });
  const upload = await page.evaluate(async () => {
    // Person details live in the Directory; open it the way the app's Reports view does.
    const add = [...document.querySelectorAll('button[data-add-media-for]')][0];
    if (!add) return { none: true };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-14.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 6000));
    return {
      person: add.dataset.addMediaFor,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 260)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia)
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png', fullPage: false });
  return { opened, upload, logs };
}
