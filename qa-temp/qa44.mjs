export default async function run(page) {
  await page.waitForTimeout(10000);
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
    return `seeded ${window.KINSHIP_PRIMARY.gedcomName} media=${window.KINSHIP_PRIMARY.media.length}`;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.person-list-button').length > 100, null, { timeout: 240000, polling: 1000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  return { seed, listing: await page.evaluate(() => document.querySelectorAll('.person-list-button').length) };
}
