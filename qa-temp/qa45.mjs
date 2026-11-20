export default async function run(page, ui) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text().slice(0, 200)}`); });
  await page.waitForTimeout(10000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  // Load the tree through the app's own file input, then search for a person.
  await page.evaluate(async () => {
    const text = await fetch('/geds-Ancestry.ged').then((r) => r.text());
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const input = document.querySelector('#gedcomInput');
    const t = new DataTransfer();
    t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => /2,6/.test(document.querySelector('#peopleCount')?.textContent || ''), null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const search = await page.evaluate(() => {
    const box = document.querySelector('#searchInput') || [...document.querySelectorAll('input[type="search"], input')].find((i) => /search|find/i.test(i.placeholder || ''));
    if (!box) return 'no search box';
    box.value = 'Magnus';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return box.id || box.placeholder;
  });
  await page.waitForTimeout(1500);
  const pick = await page.evaluate(() => {
    const card = document.querySelector('.person-card[data-person-id]');
    if (card) { card.click(); return `card ${card.dataset.personId}`; }
    const row = document.querySelector('.person-list-button');
    if (row) { row.click(); return `row ${row.textContent.trim().slice(0, 30)}`; }
    return 'nothing';
  });
  await page.waitForTimeout(3000);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add || add.disabled) return { noButton: true, title: document.querySelector('#title')?.textContent };
    add.click();
    await new Promise((r) => setTimeout(r, 400));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-e2e-upload.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer();
    t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10000));
    return {
      person: add.dataset.addMediaFor,
      title: document.querySelector('#title')?.textContent,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 340)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      newLinks: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia).filter((p) => /qa-e2e-upload/.test(p))
    };
  });
  await page.evaluate(() => document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/qa45-person.png' });
  return { search, pick, upload, logs: logs.slice(0, 10) };
}
