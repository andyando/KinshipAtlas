export default async function run(page) {
  const report = { steps: [] };
  page.on('pageerror', (e) => report.steps.push({ pageerror: String(e) }));
  page.on('console', (m) => report.steps.push({ console: `${m.type()}: ${m.text().slice(0, 300)}` }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#mediaFolderDialog')?.close());
  const result = await page.evaluate(async () => {
    const out = {};
    const row = document.querySelector('.person-list-button');
    out.listButtons = document.querySelectorAll('.person-list-button').length;
    if (!row) return out;
    row.click();
    await new Promise((r) => setTimeout(r, 3000));
    out.title = document.querySelector('#title')?.textContent;
    // Let the helpers defined at the top of app.js be visible from this evaluate.
    window.__qa = (window.__qa || {});
    out.addButton = (() => { const b = document.querySelector('button[data-add-media-for]'); return b ? b.dataset.addMediaFor : null; })();
    addButton.click();
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('#mediaUploadInput');
    const blob = await (await fetch('/14-Magnus.jpg')).blob();
    const file = new File([blob], 'qa-person-upload-4.jpg', { type: 'image/jpeg' });
    const t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // saveUploadedMedia waits for the directory API before it uploads; the stub
    // picker rejects, so give it a real macrotask, not the timer-throttled sleep.
    await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    out.pendingUpload = window.__qaUploadDebug ? window.__qaUploadDebug() : 'no debug';
    await new Promise((r) => setTimeout(r, 6000));
    out.toasts = [...document.querySelectorAll('.toast, [role="status"], #toast')].map((el) => el.textContent.trim().slice(0, 220));
    out.mediaHeading = document.querySelector('.detail-media-section h3')?.textContent;
    out.unlink = [...document.querySelectorAll('[data-unlink-media]')].map((b) => b.dataset.unlinkMedia);
    out.imgAlts = [...document.querySelectorAll('.detail-media-section img')].map((img) => img.alt).slice(0, 50);
    return out;
  });
  report.steps.push({ result });
  await page.screenshot({ path: 'G:/Git/Kinship_Experimental/qa-temp/shots/person-upload.png' });
  return report;
}
