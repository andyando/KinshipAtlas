import { chromium } from 'playwright';
import qa from './qa-probe-hero.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await qa(page).catch((e) => ({ fatal: String(e) }));
console.log(JSON.stringify(result, null, 2));
await browser.close();
