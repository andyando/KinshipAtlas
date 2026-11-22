export default async function run(page, ui) {
  const steps = [];
  await page.waitForTimeout(2000);
  await page.locator('#gedcomInput').setInputFiles('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged');
  await page.waitForTimeout(3000);
  steps.push({ step: 'loaded', tree: await page.evaluate(() => document.querySelector('#treeLabel')?.textContent || '') });
  steps.push({
    step: 'probe', result: await page.evaluate(() => {
      const out = {};
      try { const e = document.querySelector('#mediaOrganiseMenuButton'); out.menu = Boolean(e); out.handler = Boolean(e && e.onclick); } catch (error) { out.menuError = String(error); }
      try { out.dialog = Boolean(document.querySelector('#mediaOrganiseDialog')); } catch (error) { out.dialogError = String(error); }
      try { out.script = Boolean(window.KinshipMediaOrganise); } catch (error) { out.scriptError = String(error); }
      try { out.open = document.querySelector('#mediaOrganiseDialog').open; } catch (error) { out.openError = String(error); }
      try { out.summary = document.querySelector('#mediaOrganiseSummary').textContent; } catch (error) { out.summaryError = String(error); }
      return out;
    })
  });
  steps.push({
    step: 'direct', result: await page.evaluate(() => {
      const ui = {
        dialog: document.querySelector('#mediaOrganiseDialog'),
        check: document.querySelector('#mediaOrganiseCheck'),
        apply: document.querySelector('#mediaOrganiseApply'),
        summary: document.querySelector('#mediaOrganiseSummary'),
        archive: document.querySelector('#mediaOrganiseArchive'),
        list: document.querySelector('#mediaOrganiseList'),
        status: document.querySelector('#mediaOrganiseStatus')
      };
      ui.dialog.showModal();
      return { open: ui.dialog.open, archive: ui.archive?.value };
    })
  });
  await page.waitForTimeout(300);
  steps.push({ step: 'after-show', open: await page.evaluate(() => document.querySelector('#mediaOrganiseDialog').open) });
  await page.evaluate(() => document.querySelector('#mediaOrganiseCheck')?.click());
  await page.waitForTimeout(5000);
  steps.push({
    step: 'checked',
    summary: await page.evaluate(() => document.querySelector('#mediaOrganiseSummary')?.textContent),
    status: await page.evaluate(() => document.querySelector('#mediaOrganiseStatus')?.textContent),
    groups: await page.evaluate(() => [...document.querySelectorAll('#mediaOrganiseList h4')].map((h) => h.textContent)),
    applyDisabled: await page.locator('#mediaOrganiseApply').isDisabled()
  });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/tree-app/tools/artifacts/media-organise-check.png' });
  return steps;
}
