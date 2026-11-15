import { chromium } from 'playwright';
import qa from 'file:///g:/Git/Kinship_Experimental/tree-app/qa-hero-reframe.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await qa(page).catch((e) => ({ fatal: String(e) }));
console.log(JSON.stringify(result, null, 2));
await browser.close();
