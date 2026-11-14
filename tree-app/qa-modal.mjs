// QA: Search Public Records dialog UI, a11y, live API calls.
export default async function run(page) {
  await page.setViewportSize({ width: 1500, height: 980 });
  await page.goto('http://127.0.0.1:8807/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  await page.waitForTimeout(1200);

  // Pick a deceased person (search buttons only render for them).
  const picked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#peopleList button')];
    const target = rows.find((r) => /Erna Johanna Magnus/i.test(r.textContent)) || rows[0];
    if (target) { target.click(); return target.textContent.trim().slice(0, 44); }
    return null;
  });
  await page.waitForTimeout(1800);

  const button = await page.evaluate(() => {
    const btn = document.querySelector('button[data-public-records-search]');
    return { present: !!btn, title: btn?.title, aria: btn?.getAttribute('aria-label'), text: btn?.textContent };
  });

  await page.evaluate(() => {
    window.__trace = [];
    const dlg = document.querySelector('#researchDialog');
    for (const ev of ['showModal', 'open', 'close']) {
      const orig = dlg[ev] ? dlg[ev].bind(dlg) : null;
      if (typeof orig === 'function') dlg[ev] = (...args) => { window.__trace.push(ev); return orig(...args); };
    }
    document.querySelector('button[data-public-records-search]')?.click();
    window.__trace.push('clicked');
  });
  await page.waitForTimeout(1200);

  const dialogOpen = await page.evaluate(() => {
    const dialog = document.querySelector('#researchDialog');
    return {
      open: dialog?.open,
      title: document.querySelector('#researchDialogTitle')?.textContent,
      subtitle: document.querySelector('#researchDialogSubtitle')?.textContent,
      personName: document.querySelector('#publicRecordsPersonName')?.textContent,
      personDates: document.querySelector('#publicRecordsPersonDates')?.textContent,
      cards: document.querySelectorAll('.public-record-card').length,
      statuses: [...document.querySelectorAll('.public-record-status')].map((s) => s.textContent.trim()),
      searchAllLabel: document.querySelector('#searchAllPublicRecords')?.textContent,
      focusOnSearchAll: document.activeElement === document.querySelector('#searchAllPublicRecords')
    };
  });

  // Search All Sources: live network calls to every provider.
  await page.evaluate(() => document.querySelector('#searchAllPublicRecords').click());
  await page.waitForTimeout(1500);
  const searching = await page.evaluate(() => [...document.querySelectorAll('.public-record-status')].map((s) => s.className.includes('is-searching')));

  // Wait up to 20s for providers to settle.
  let settled = null;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(1000);
    settled = await page.evaluate(() => [...document.querySelectorAll('.public-record-card')].map((card) => ({
      id: card.dataset.providerId,
      status: card.querySelector('.public-record-status').className.match(/is-\w+/)?.[0],
      text: card.querySelector('.public-record-status').textContent.trim().slice(0, 44),
      results: card.querySelectorAll('.public-record-item').length,
      links: [...card.querySelectorAll('.public-record-item-link')].slice(0, 2).map((a) => ({
        href: a.href.slice(0, 60), target: a.target, rel: a.rel, text: a.textContent
      }))
    })));
    if (settled.every((c) => !c.status.includes('searching'))) break;
  }

  // ESC close + restore.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const closed = await page.evaluate(() => ({
    open: document.querySelector('#researchDialog')?.open,
    focus: document.activeElement?.tagName
  }));

  return { picked, button, dialogOpen, searching, settled, closed };
}
