// QA: which rule actually wins for .media-file-item / .media-file-link?
export default async function run(page) {
  await page.goto('http://127.0.0.1:8806/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());

  return page.evaluate(() => {
    document.querySelectorAll('.qa-probe').forEach((n) => n.remove());
    const host = document.querySelector('.details-panel') || document.body;
    const section = document.createElement('section');
    section.className = 'detail-section qa-probe';
    section.style.cssText = 'display:block; padding:12px;';
    const grid = document.createElement('div');
    grid.className = 'media-grid';
    const item = document.createElement('div');
    item.className = 'media-file-item';
    const link = document.createElement('a');
    link.className = 'media-file-link';
    link.href = '#';
    link.textContent = 'England_Wales_Civil_Registration_Birth_Index_1837-1915_Thos_Rowland_Anderson.pdf';
    const unlink = document.createElement('button');
    unlink.type = 'button';
    unlink.className = 'media-remove-button';
    unlink.textContent = '🗑';
    item.append(link, unlink);
    const classify = document.createElement('label');
    classify.className = 'media-classify';
    classify.textContent = 'Classify';
    const select = document.createElement('select');
    select.innerHTML = '<option>Unclassified</option>';
    classify.append(select);
    item.append(classify);
    grid.append(item);
    section.append(grid);
    host.append(section);

    // Enumerate every matching rule from the loaded stylesheet in order.
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      for (const rule of list) {
        if (rule.type !== CSSRule.STYLE_RULE) continue;
        const sel = rule.selectorText || '';
        if (/\.media-(file-item|file-link|grid|classify|remove-button)\b/.test(sel)) {
          rules.push({ sel, display: rule.style.display, width: rule.style.width, flex: rule.style.flex, gridArea: rule.style.gridArea, wordBreak: rule.style.wordBreak });
        }
      }
    }

    const itemStyle = getComputedStyle(item);
    const linkStyle = getComputedStyle(link);
    const r = link.getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    return {
      stylesheetCount: document.styleSheets.length,
      matchingRules: rules,
      computed: {
        itemDisplay: itemStyle.display,
        itemGridAreas: itemStyle.gridTemplateAreas,
        itemWidth: Math.round(ir.width),
        linkWidth: Math.round(r.width),
        linkHeight: Math.round(r.height),
        linkWordBreak: linkStyle.wordBreak,
        linkGridArea: linkStyle.gridArea,
        linkDisplay: linkStyle.display
      }
    };
  });
}
