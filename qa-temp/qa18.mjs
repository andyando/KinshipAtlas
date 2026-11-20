export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const result = await page.evaluate(async () => {
    const out = {};
    document.querySelector('.person-list-button')?.click();
    await new Promise((r) => setTimeout(r, 2000));
    out.title = document.querySelector('#title')?.textContent;
    const addButton = document.querySelector('button[data-add-media-for]');
    out.addButton = addButton ? addButton.dataset.addMediaFor : null;
    if (!addButton) return out;
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-9.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    // The app reads a File from the same realm, so this is the path the button takes.
    const input = document.querySelector('#mediaUploadInput');
    let changeFired = false;
    input.addEventListener('change', () => { changeFired = true; }, { once: true });
    addButton.click();
    await new Promise((r) => setTimeout(r, 200));
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 6000));
    out.changeFired = changeFired;
    out.toasts = [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 260));
    out.mediaHeading = document.querySelector('.detail-media-section h3')?.textContent;
    out.unlink = [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia);
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return out;
  });
  report.steps.push({ result });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return report;
}
