export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  // Launcher mode: primary-data.js lists the library, and the helper is reachable for
  // writes. A stub picker keeps the app in "helper" mode instead of the File System API.
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.clear();
    localStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const state = await page.evaluate(() => ({
    addButtons: document.querySelectorAll('button[data-add-media-for]').length,
    title: document.querySelector('#title')?.textContent,
    mediaSection: document.querySelector('.detail-media-section')?.textContent.slice(0, 120)
  }));
  const upload = await page.evaluate(async () => {
    const card = document.querySelector('.person-list-button');
    if (card) { card.click(); }
    await new Promise((r) => setTimeout(r, 2500));
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true, title: document.querySelector('#title')?.textContent };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-18.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 7000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      personName: document.querySelector('#title')?.textContent,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia),
      mediaSection: document.querySelector('.detail-media-section')?.textContent.slice(0, 200)
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { state, upload, logs };
}
