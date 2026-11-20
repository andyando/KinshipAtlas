export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const load = await page.evaluate(async () => {
    const text = await fetch('/geds-Ancestry.ged').then((r) => r.text());
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const input = document.querySelector('#gedcomInput');
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return text.length;
  });
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const picked = await page.evaluate(() => {
    const card = document.querySelector('.person-card[data-person-id]');
    if (!card) return 'no card';
    card.click();
    return card.dataset.personId;
  });
  await page.waitForTimeout(3000);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true, details: document.querySelector('.app-shell')?.textContent.slice(0, 200) };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-17.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 7000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 300)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia),
      hero: document.querySelector('.detail-monogram-photo')?.alt
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { chars: load, picked, title: await page.evaluate(() => document.querySelector('#title')?.textContent), upload, logs };
}
