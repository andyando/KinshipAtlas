export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  report.steps.push({ loaded: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent) });
  const run = await page.evaluate(async () => {
    try {
      const s = window.__kinshipDebug ? 'debug' : 'none';
      return { s };
    } catch (e) { return String(e); }
  });
  report.steps.push(run);
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/full.png' });
  return report;
}
