export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  await page.waitForTimeout(9000);
  const result = await page.evaluate(async () => {
    const out = {};
    out.buttons = [...document.querySelectorAll('button')].map((b) => `${b.id || b.className}:${(b.textContent || '').trim().slice(0, 30)}`).filter((t) => /Add photo|media/i.test(t)).slice(0, 10);
    const open = document.querySelector('#fileInput');
    out.fileInputs = [...document.querySelectorAll('input[type=file]')].map((i) => i.id);
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'Ancestry_01112026.ged');
    return out;
  });
  // Load the GEDCOM through the real file input, then open a person.
  const clicked = await page.evaluate(() => {
    const label = document.querySelector('label[for="gedcomInput"]');
    if (label) { label.click(); return 'clicked label'; }
    return 'no label';
  });
  report.steps.push({ result, clicked });
  return report;
}
