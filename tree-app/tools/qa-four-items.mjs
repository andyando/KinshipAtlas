export default async function run(page, ui) {
  const steps = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error).slice(0, 300)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
  await page.waitForTimeout(1500);
  for (const id of ['mediaFolderDialog', 'welcomeDialog']) await page.evaluate((name) => document.querySelector('#' + name)?.close(), id);
  steps.push({ step: 'tree', label: await page.evaluate(() => document.querySelector('#treeLabel')?.textContent || '') });

  // 1-3. Duplicate dialog: folder path, per-file folder, select all.
  await page.evaluate(() => document.querySelector('#settingsButton').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#duplicateMediaMenuButton').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#duplicateMediaScanButton').click());
  await page.waitForSelector('#duplicateMediaDialog[aria-busy="false"]', { timeout: 300000 }).catch(() => { });
  await page.waitForTimeout(1500);
  steps.push({
    step: 'duplicates',
    folderShown: await page.evaluate(() => {
      const node = document.querySelector('#duplicateMediaFolder');
      return node && !node.hidden ? node.textContent : '';
    }),
    summary: await page.evaluate(() => document.querySelector('#duplicateMediaSummary')?.textContent || ''),
    folderLabels: await page.evaluate(() => [...document.querySelectorAll('.duplicate-media-detail')].slice(0, 4).map((node) => node.textContent)),
    rootLabels: await page.evaluate(() => [...document.querySelectorAll('.duplicate-media-detail')].filter((node) => node.textContent.includes('media folder root')).length)
  });
  const selectAll = await page.evaluate(() => {
    const box = document.querySelector('#duplicateMediaSelectAll');
    if (!box || box.disabled) return null;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const ticked = [...document.querySelectorAll('.duplicate-media-row input[type=checkbox]:not([disabled])')].filter((node) => node.checked).length;
    const selected = document.querySelector('#duplicateMediaSelected')?.textContent || '';
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    const afterClear = [...document.querySelectorAll('.duplicate-media-row input[type=checkbox]:not([disabled])')].filter((node) => node.checked).length;
    return { ticked, selected, afterClear };
  });
  steps.push({ step: 'select-all', ...selectAll });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/tree-app/tools/artifacts/qa-duplicates.png' });
  await page.evaluate(() => document.querySelector('#duplicateMediaDialog').close());
  await page.waitForTimeout(300);

  // 4. Orphan records.
  await page.evaluate(() => document.querySelector('#settingsButton').click());
  await page.waitForTimeout(300);
  steps.push({ step: 'orphan-menu', disabled: await page.locator('#orphanRecordsMenuButton').isDisabled() });
  await page.evaluate(() => document.querySelector('#orphanRecordsMenuButton').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#orphanRecordsScanButton').click());
  await page.waitForTimeout(1500);
  steps.push({
    step: 'orphans',
    status: await page.evaluate(() => document.querySelector('#orphanRecordsStatus')?.textContent || ''),
    summary: await page.evaluate(() => document.querySelector('#orphanRecordsSummary')?.textContent || ''),
    rows: await page.evaluate(() => document.querySelectorAll('input[data-orphan-id]').length),
    names: await page.evaluate(() => [...document.querySelectorAll('.orphan-record-row .duplicate-media-name')].slice(0, 5).map((node) => node.textContent)),
    selectAll: await page.evaluate(() => document.querySelector('#orphanRecordsSelectAll')?.disabled)
  });
  await page.waitForSelector('#orphanRecordsDialog[aria-busy="false"]', { timeout: 120000 }).catch(() => { });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/tree-app/tools/artifacts/qa-orphans.png' });
  steps.push({ step: 'errors', errors: errors.slice(0, 6) });
  return steps;
}
