export default async function run(page, ui) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  // Select a person from the directory list.
  const picked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.roster-entry, [data-person-id]')].find((el) => el.tagName === 'BUTTON' && el.dataset.personId);
    if (!row) return 'no roster row';
    row.click();
    return row.dataset.personId;
  });
  await page.waitForTimeout(2500);
  report.steps.push({
    step: 'person', picked,
    title: await page.evaluate(() => document.querySelector('#title')?.textContent),
    addButtons: await page.evaluate(() => [...document.querySelectorAll('button[data-add-media-for]')].map((b) => ({ id: b.dataset.addMediaFor, disabled: b.disabled, text: b.textContent })))
  });

  const upload = await page.evaluate(async () => {
    const addButton = document.querySelector('button[data-add-media-for]');
    if (!addButton || addButton.disabled) return 'no usable add-media button';
    const personId = addButton.dataset.addMediaFor;
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await fetch('/Primary%20Media%20Library/Ancestry_01112026_media/Isidor%20Magnus%20(1860-1915)%20%5BI44%5D/qa-source.jpg').then((r) => r.blob());
    if (!blob.size) return 'no sample image';
    const file = new File([blob], 'qa-person-upload.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 4000));
    return {
      personId,
      toast: [...document.querySelectorAll('.toast, [role="status"]')].map((el) => el.textContent).join(' | '),
      links: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia)
    };
  });
  report.steps.push({ step: 'upload', upload });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return report;
}
