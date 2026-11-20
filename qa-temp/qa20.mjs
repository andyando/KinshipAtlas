export default async function run(page) {
  const report = { steps: [] };
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ state: await page.evaluate(() => ({ people: document.querySelector('#peopleCount')?.textContent, rows: document.querySelectorAll('.person-list-button').length, hasAdd: document.querySelectorAll('button[data-add-media-for]').length, uploadInput: !!document.querySelector('#mediaUploadInput') })) });
  await page.evaluate(() => document.querySelector('.person-list-button')?.click());
  await page.waitForTimeout(2500);
  report.steps.push({ afterClick: await page.evaluate(() => ({ title: document.querySelector('#title')?.textContent, hasAdd: document.querySelectorAll('button[data-add-media-for]').length, uploadInput: !!document.querySelector('#mediaUploadInput') })) });
  const set = await page.evaluate(async () => {
    const addButton = document.querySelector('button[data-add-media-for]');
    if (!addButton) return 'none';
    addButton.click();
    await new Promise((r) => setTimeout(r, 200));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-11.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { person: addButton.dataset.addMediaFor, size: file.size };
  });
  await page.waitForTimeout(7000);
  report.steps.push({ set, logs });
  return report;
}
