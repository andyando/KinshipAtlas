export default async function run(page) {
  await page.goto('https://www.wikitree.com/wiki/Special:SearchPerson', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const forms = [...document.querySelectorAll('form')].map((f) => ({
      action: f.action, method: f.method,
      fields: [...f.querySelectorAll('input,select')].map((i) => ({ name: i.name, type: i.type, id: i.id }))
    }));
    return { url: location.href, forms };
  });
}
