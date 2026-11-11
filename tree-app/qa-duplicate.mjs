// QA: verify the duplicate-finder dialog hides when closed and behaves when open.
export default async function run(page, ui) {
  const results = {};

  // 1. Closed state: the dialog must not be displayed (this is the regression we fixed).
  results.closedDisplayed = await page.evaluate(() => {
    const d = document.querySelector('#duplicateFinderDialog');
    return getComputedStyle(d).display;
  });

  // 2. Open the dialog via the settings menu flow (directly invoke the same code path).
  results.opened = await page.evaluate(() => {
    document.querySelector('#duplicateFinderMenuButton').click();
    const d = document.querySelector('#duplicateFinderDialog');
    return { openAttr: d.hasAttribute('open'), display: getComputedStyle(d).display };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'qa-dup-open.png' });

  // 3. Close it via the Close button and confirm it disappears again.
  results.closed = await page.evaluate(() => {
    document.querySelector('#closeDuplicateFinder').click();
    const d = document.querySelector('#duplicateFinderDialog');
    return { openAttr: d.hasAttribute('open'), display: getComputedStyle(d).display };
  });

  // 4. Confirm no stray page-flow dialog box remains (document height back to normal).
  results.scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  return results;
}
