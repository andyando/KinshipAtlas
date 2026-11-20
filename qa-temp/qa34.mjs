export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForTimeout(7000);
  const bundle = await page.evaluate(() => (window.KINSHIP_PRIMARY ? { gedcomName: window.KINSHIP_PRIMARY.gedcomName, media: window.KINSHIP_PRIMARY.media.length } : null));
  const opened = await page.evaluate(() => { window.KINSHIP_PRIMARY && openPrimaryFolderTree && openPrimaryFolderTree(); return 'called'; });
  await page.waitForTimeout(20000);
  return { bundle, opened, people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent) };
}
