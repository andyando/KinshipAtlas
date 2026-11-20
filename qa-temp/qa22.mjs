export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForFunction(() => (document.querySelector('#peopleCount')?.textContent || '').includes('2,'), { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  const open = await page.evaluate(() => new Promise((resolve) => {
    const input = document.querySelector('#mediaUploadInput');
    input.addEventListener('change', () => resolve(`change:${input.files.length}`), { once: true });
    document.querySelector('button[data-add-media-for]')?.click();
    setTimeout(() => resolve('no change event from a cancelled picker'), 3000);
  }));
  const upload = await page.evaluate(async () => {
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-13.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5000));
    return {
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 260)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia)
    };
  });
  return { title: await page.evaluate(() => document.querySelector('#title')?.textContent), open, upload, logs };
}
