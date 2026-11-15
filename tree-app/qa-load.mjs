// QA: load the real GEDCOM + media, pick Daniel Magnus (should have a photo), print hero frame state.
export default async function run(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://127.0.0.1:8901/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const ged = await page.evaluate(async () => {
    const r = await fetch('/Primary%20GEDCOM/Ancestry_01112026.ged');
    return r.ok ? await r.text() : null;
  });
  await page.evaluate(async (text) => {
    if (!text) return;
    const file = new File([text], 'Ancestry_01112026.ged', { type: 'text/plain' });
    const t = new DataTransfer(); t.items.add(file);
    const input = document.querySelector('#gedcomInput');
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, ged);
  await page.waitForFunction(() => /2,?6\d\d/.test(document.querySelector('#peopleCount')?.textContent || ''), { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    rows.find((r) => /Daniel Magnus/i.test(r.textContent) && /1843/.test(r.textContent))?.click();
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'g:/Git/Kinship_Experimental/qa-hero-load.png' });
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.details-panel img')].slice(0, 5).map((img) => ({
      src: img.src.slice(-80), w: Math.round(img.getBoundingClientRect().width), cls: img.className
    }));
    return {
      heroPhoto: imgs,
      peopleListRows: document.querySelectorAll('#peopleList button').length,
      detailsText: document.querySelector('.details-panel')?.textContent.slice(0, 200)
    };
  });
}
