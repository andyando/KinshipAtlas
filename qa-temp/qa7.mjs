export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => { if (m.type() !== 'error') report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 400)}` }); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const row = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.roster-entry[data-person-id]')][0] || [...document.querySelectorAll('[data-person-id]')][0];
    if (!button) return 'no row';
    button.click();
    return button.dataset.personId;
  });
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const out = {};
    try {
      const addButton = document.querySelector('button[data-add-media-for]');
      out.step1 = !!addButton;
      // Call the upload path directly with a real file, mirroring the person record button.
      const blob = await (await fetch('/14-Magnus.jpg')).blob();
      out.blobSize = blob.size;
      const file = new File([blob], 'qa-person-upload.jpg', { type: 'image/jpeg' });
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream', 'X-Media-Folder': encodeURIComponent('Alina [I2071]') },
        body: file
      });
      out.status = response.status;
      out.body = await response.text();
    } catch (e) { out.error = String(e && e.stack || e); }
    return out;
  });
  report.steps.push({ row, upload });
  return report;
}
