export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.waitForFunction(() => /2,\d{3}/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const search = await page.evaluate(() => {
    const box = [...document.querySelectorAll('input')].find((i) => i.placeholder && /search|name/i.test(i.placeholder)) || document.querySelector('#searchInput');
    if (!box) return 'no search box';
    box.value = 'Magnus';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return box.id || box.placeholder;
  });
  await page.waitForTimeout(1500);
  const picked = await page.evaluate(() => {
    const card = document.querySelector('.person-card[data-person-id]');
    if (!card) return 'no person card';
    card.click();
    return card.dataset.personId;
  });
  await page.waitForTimeout(2500);
  const upload = await page.evaluate(async () => {
    const add = document.querySelector('button[data-add-media-for]');
    if (!add) return { none: true };
    add.click();
    await new Promise((r) => setTimeout(r, 300));
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-16.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#mediaUploadInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 6000));
    document.querySelector('.detail-media-section')?.scrollIntoView({ block: 'center' });
    return {
      person: add.dataset.addMediaFor,
      toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent.trim().slice(0, 260)),
      heading: document.querySelector('.detail-media-section h3')?.textContent,
      unlink: [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia),
      hero: document.querySelector('.detail-monogram-photo')?.alt
    };
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return { search, title: await page.evaluate(() => document.querySelector('#title')?.textContent), upload, logs };
}
