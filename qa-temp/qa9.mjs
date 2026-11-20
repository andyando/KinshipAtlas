export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const result = await page.evaluate(async () => {
    const out = { selected: document.querySelector('#title')?.textContent };
    const row = [...document.querySelectorAll('.roster-entry[data-person-id]')].find((el) => el.dataset.personId);
    if (row) row.click();
    await new Promise((r) => setTimeout(r, 2500));
    out.title = document.querySelector('#title')?.textContent;
    const addButton = document.querySelector('button[data-add-media-for]');
    out.addButton = addButton ? addButton.dataset.addMediaFor : null;
    if (!addButton) {
      out.mediaSection = document.querySelector('.detail-media-section')?.textContent;
      out.detailsHtml = (document.querySelector('.details-content')?.textContent || '').slice(0, 300);
      return out;
    }
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-3.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5000));
    out.toasts = [...document.querySelectorAll('.toast, [role="status"], #toast')].map((el) => el.textContent.trim().slice(0, 200));
    out.mediaHeading = document.querySelector('.detail-media-section h3')?.textContent;
    out.mediaImageAlts = [...document.querySelectorAll('.detail-media-section img')].map((img) => img.alt).slice(0, 40);
    return out;
  });
  report.steps.push({ result });
  return report;
}
