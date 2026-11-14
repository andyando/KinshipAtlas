export default async function run(page) {
  await page.goto('https://www.wikitree.com/wiki/Special:Search?search=William+Garlick&orderBy=rank&keywords=1865', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);
  return page.evaluate(() => {
    const input = document.querySelector('input[name="search"], input.oo-ui-inputWidget-input, #searchInput');
    const links = [...document.querySelectorAll('a[href^="/wiki/"]')].filter((a) => /-\d+$/.test(a.getAttribute('href'))).map((a) => a.getAttribute('href')).slice(0, 8);
    const t = document.body.innerText;
    return {
      url: location.href,
      inputValue: input ? input.value : null,
      profileLinks: links,
      snippet: t.replace(/\s+/g, ' ').slice(0, 400)
    };
  });
}
