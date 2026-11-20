export default async function run(page) {
  const report = { steps: [] };
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForTimeout(12000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(3000);
  const steps = [];
  const result = await page.evaluate(async () => {
    const out = [];
    const addButton = document.querySelector('button[data-add-media-for]');
    if (!addButton) return ['no add button'];
    addButton.click();
    await new Promise((r) => setTimeout(r, 200));
    out.push('clicked add');
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-12.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    out.push('input files before: ' + input.files.length);
    input.files = t.files;
    out.push('input files after: ' + input.files.length);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    out.push('dispatched');
    await new Promise((r) => setTimeout(r, 7000));
    out.push('waited');
    return out;
  });
  report.steps.push({ result, logs });
  return report;
}
