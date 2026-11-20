export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const result = await page.evaluate(async () => {
    const out = {};
    document.querySelector('.person-list-button')?.click();
    await new Promise((r) => setTimeout(r, 3000));
    out.title = document.querySelector('#title')?.textContent;
    const addButton = document.querySelector('button[data-add-media-for]');
    if (!addButton) { out.noButton = true; return out; }
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    out.blobSize = blob.size;
    const file = new File([blob], 'qa-person-upload-6.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    // Ask the helper whether it now knows about the file, then read its folder from disk next.
    out.probeChecks = {
      fileSize: file.size,
      helperInfo: await fetch('/api/media-info').then((r) => r.json()),
    };
    await new Promise((r) => setTimeout(r, 5000));
    out.toasts = [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 200));
    out.mediaHeading = document.querySelector('.detail-media-section h3')?.textContent;
    out.grid = document.querySelector('.detail-media-section')?.textContent.slice(0, 300);
    return out;
  });
  report.steps.push({ result });
  return report;
}
