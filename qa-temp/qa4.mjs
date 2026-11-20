export default async function run(page, ui) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  // The launcher pre-lists the library in primary-data.js. Here the app has to pick
  // the folder itself through the helper, so the browser's picker is stubbed out.
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  const upload = await page.evaluate(async () => {
    const addButton = [...document.querySelectorAll('button[data-add-media-for]')][0];
    if (!addButton) return 'no add-media button';
    const personId = addButton.dataset.addMediaFor;
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await fetch('/Primary%20Media%20Library/Ancestry_01112026_media/0071634-06698.jpg').then((r) => r.blob());
    if (!blob.size) return 'no sample image';
    const file = new File([blob], 'qa-person-upload.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 4000));
    const toast = [...document.querySelectorAll('.toast, [role="status"]')].map((el) => el.textContent).join(' | ');
    const personName = document.querySelector('#title')?.textContent;
    return {
      personId, personName, toast,
      links: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia)
    };
  });
  report.steps.push({ step: 'upload', upload });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return report;
}
