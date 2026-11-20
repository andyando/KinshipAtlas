export default async function run(page) {
  await page.waitForTimeout(15000);
  return {
    title: await page.title(),
    url: page.url(),
    files: await page.evaluate(() => [...document.querySelectorAll('input[type="file"]')].map((i) => i.id)),
    scripts: await page.evaluate(() => [...document.querySelectorAll('script')].map((s) => s.src.replace(location.origin, '')).slice(0, 12)),
    bodyStart: await page.evaluate(() => (document.body.innerText || '').slice(0, 120)),
    people: await page.evaluate(() => document.querySelector('#peopleCount')?.textContent),
  };
}
