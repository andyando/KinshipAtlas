export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
    sessionStorage.clear();
    localStorage.removeItem('kinship-atlas-session-id');
  });
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.evaluate(() => {
    const details = [...document.querySelectorAll('h3')].find((h) => /Attached media/.test(h.textContent));
    if (details) { details.closest('section').scrollIntoView({ block: 'center' }); return; }
    // Details panels may be collapsed; open the one for the selected person.
    document.querySelectorAll('.details-header, [aria-expanded]').forEach((el) => { if (/attached|media/i.test(el.textContent || '')) el.click(); });
    const panel = document.querySelector('.app-shell > aside') || document.querySelector('#detailsPanel');
    if (panel) panel.scrollTop = panel.scrollHeight;
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-panel.png' });
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => ({ cls: b.className, id: b.id, text: b.textContent.trim().slice(0, 40) })).filter((b) => /add|photo|pdf|attach|media/i.test(`${b.cls} ${b.text} ${b.id}`)).slice(0, 20));
  return { buttons, logs, html: await page.evaluate(() => document.querySelector('.app-shell')?.innerHTML.length) };
}
