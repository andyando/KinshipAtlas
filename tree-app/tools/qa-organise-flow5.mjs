
export default async function run(page, ui) {
  const steps = [];
  await page.waitForTimeout(300);
  steps.push({
    step: 'before',
    links: await page.evaluate(() => [...document.querySelectorAll('label[for="gedcomInput"]')].map((l) => l.textContent.trim().slice(0, 60)))
});
await page.evaluate(() => {
  const label = document.querySelector('label[for="gedcomInput"]');
  window.__clicked = false;
  label.addEventListener('click', () => { window.__clicked = true; }, true);
  label.querySelector('input')?.addEventListener('click', (event) => { event.preventDefault(); window.__clicked = 'input'; });
});
await page.getByRole('button', { name: /Create new GEDCOM/i }).first().click();
await page.waitForTimeout(400);
await page.locator('#newGedcomGivenName').fill('QA');
await page.locator('.dialog-button-primary', { hasText: /^Create$/ }).first().click();
await page.waitForTimeout(2500);
steps.push({ step: 'after', clicked: await page.evaluate(() => window.__clicked) });
steps.push({ step: 'gramps', exists: await page.locator('#gedcomInput').count() });
return steps;
}
