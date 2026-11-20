export default async function run(page) {
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror ${e}`));
  const info = async (label) => logs.push(`${label}: ${JSON.stringify(await page.evaluate(() => ({
    people: document.querySelector('#peopleCount')?.textContent,
    title: document.querySelector('#title')?.textContent,
    listing: document.querySelectorAll('.person-list-button').length,
    add: document.querySelectorAll('button[data-add-media-for]').length,
    section: document.querySelector('.detail-media-section h3')?.textContent
  })))}`);
  await page.addInitScript(() => { sessionStorage.clear(); });
  await page.waitForTimeout(10000);
  await info('after load');
  const seed = await page.evaluate(async () => {
    if (!window.KINSHIP_PRIMARY) return 'no primary';
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kinship-atlas-defaults', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put({ gedcomName: window.KINSHIP_PRIMARY.gedcomName }, 'default');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return 'seeded';
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(45000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await info('after reload');
  return { seed, logs };
}
