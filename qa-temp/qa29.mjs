export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.clear();
    localStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const picked = await page.evaluate(() => {
    const input = document.querySelector('#personSearch') || document.querySelector('input[placeholder="Find a person"]');
    if (input) { input.value = 'Isidor'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    return input ? 'searched' : 'no search input';
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const click = await page.evaluate(() => {
    const row = document.querySelector('.person-list-button');
    if (row) { row.click(); return row.textContent.trim().slice(0, 40); }
    const card = document.querySelector('.person-card');
    if (card) { card.click(); return 'card ' + card.dataset.personId; }
    return 'nothing to click';
  });
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true, title: document.querySelector('#title')?.textContent };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-19.jpg', { type: 'image/jpeg' });
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
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia),
      section: document.querySelector('.detail-media-section')?.textContent.slice(0, 200)
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { picked, click, upload, logs };
}
