export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ before: await page.evaluate(() => ({ people: document.querySelector('#peopleCount')?.textContent, title: document.querySelector('#title')?.textContent })) });
  const result = await page.evaluate(async () => {
    const out = {};
    const blob = await (await fetch('/app/Primary%20GEDCOM/Ancestry_01112026.ged')).blob().catch(() => null);
    if (!blob) { out.fetch = 'no gedcom'; return out; }
    const file = new File([blob], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const input = document.querySelector('#gedcomInput');
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ after: await page.evaluate(() => ({ people: document.querySelector('#peopleCount')?.textContent, title: document.querySelector('#title')?.textContent })) });
  return report;
}
