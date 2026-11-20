export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.clear();
    localStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForFunction(() => /2,6/.test(document.querySelector('#peopleCount')?.textContent || ''), null, { timeout: 120000, polling: 200 });
  await page.waitForTimeout(3000);
  logs.push('AFTER ' + await page.evaluate(() => document.querySelector('#peopleCount')?.textContent));
  logs.push('PRIMARY ' + await page.evaluate(() => (window.KINSHIP_PRIMARY ? `gedcom=${window.KINSHIP_PRIMARY.gedcomName} media=${window.KINSHIP_PRIMARY.media.length}` : 'none')));
  logs.push('PEOPLE ' + await page.evaluate(() => document.querySelector('#peopleCount')?.textContent));
  logs.push('ROSTER ' + await page.evaluate(() => document.querySelector('.person-list')?.textContent.slice(0, 80)));
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  logs.push('TITLE ' + await page.evaluate(() => document.querySelector('#title')?.textContent));
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-21.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 8000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-person-upload/.test(p))
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { upload, logs };
}
