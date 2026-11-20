export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent) });
  const result = await page.evaluate(async () => {
    const out = {};
    const addButton = document.querySelector('button[data-add-media-for]');
    out.addButton = addButton ? addButton.dataset.addMediaFor : null;
    if (!addButton) return out;
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    out.inputPresent = !!input;
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-2.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    out.filesSet = input.files.length;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    out.pendingAfterDispatch = 'dispatched';
    await new Promise((r) => setTimeout(r, 5000));
    out.toasts = [...document.querySelectorAll('.toast, [role="status"], #toast')].map((el) => ({ cls: el.className, text: el.textContent.trim().slice(0, 200) }));
    out.mediaHeading = document.querySelector('.detail-media-section h3')?.textContent;
    out.mediaImages = [...document.querySelectorAll('.media-grid img')].map((img) => img.alt).slice(0, 20);
    return out;
  });
  report.steps.push({ result });
  return report;
}
