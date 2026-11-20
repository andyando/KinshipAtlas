export default async function run(page) {
  const report = { steps: [] };
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const mode = await page.evaluate(async () => {
    const input = document.querySelector('#mediaUploadInput');
    const button = document.querySelector('button[data-add-media-for]');
    return {
      addButtonDisabled: button?.disabled,
      hasAddButton: !!button,
      helper: await fetch('/api/media-info').then((r) => r.json()).catch((e) => String(e)),
      pickerDefined: typeof window.showDirectoryPicker
    };
  });
  report.steps.push({ mode });
  return report;
}
