export default async function run(page, ui) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  // The launcher normally pre-lists the library in primary-data.js; here the app
  // picks the folder itself through the helper, behind a stub directory picker.
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const loaded = await page.evaluate(async () => {
    const input = document.querySelector('#gedcomInput');
    const text = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged').then((r) => (r.ok ? r.text() : '')).catch(() => '');
    if (!text) return 'no gedcom';
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ step: 'gedcom', loaded, people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent) });

  // Upload a file from the person record for whoever is selected.
  const upload = await page.evaluate(async () => {
    const addButton = [...document.querySelectorAll('button[data-add-media-for]')][0];
    if (!addButton) return 'no add-media button';
    const personId = addButton.dataset.addMediaFor;
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await fetch('/Primary%20Media%20Library/Ancestry_01112026_media/0071615-01053.jpg').then((r) => r.blob());
    const file = new File([blob], 'qa-person-upload.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 3000));
    const toast = document.querySelector('#toast')?.textContent || [...document.querySelectorAll('[class*=toast]')].map((el) => el.textContent).join(' | ');
    return { personId, toast, links: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia) };
  });
  report.steps.push({ step: 'upload', upload });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png', fullPage: false });
  return report;
}
