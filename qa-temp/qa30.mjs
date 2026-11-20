export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.clear();
    localStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForFunction(() => /Magnus/.test(document.querySelector('.person-list-button')?.textContent || ''), { timeout: 120000, polling: 250 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true, title: document.querySelector('#title')?.textContent };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-20.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 8000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      title: document.querySelector('#title')?.textContent,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      hasNew: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-person-upload/.test(p))
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { upload, logs };
}
