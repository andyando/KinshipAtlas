// Verifies the map-button place mapping: the exact function body from module 10
// is exercised against the real gazetteer, checking the URL text it would open.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const appDir = path.join(__dirname, '..');
const dataSrc = fs.readFileSync(path.join(appDir, 'data', 'historical-gazetteer.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');

const win = { KinshipHistoricalGazetteer: null };
const context = { window: win, performance: { now: () => Date.now() }, console, localStorage: { getItem: () => null, setItem() { } } };
context.window = win;
win.open = (target) => { opened.push(target); return {}; };
vm.createContext(context);
vm.runInContext(dataSrc, context, { filename: 'historical-gazetteer.js' });

const start = appSrc.indexOf('// 18. Historical Gazetteer');
const end = appSrc.indexOf('window.KinshipHistoricalGazetteer = {', start);
const tailStart = appSrc.indexOf('loadUserAliases();\n  buildHistoricalIndexes();', end);
const tailEnd = appSrc.indexOf('})();', tailStart) + '})();'.length;
// The export block (window.KinshipHistoricalGazetteer = {...}) sits after the
// resolver functions and references module-10 helpers, so stop the slice there.
const exportStart = appSrc.indexOf('window.KinshipHistoricalGazetteer = {', start);
vm.runInContext(appSrc.slice(start, exportStart) + '\nwindow.KinshipHistoricalGazetteer = { resolve: resolveHistoricalPlace };\n', context, { filename: 'resolver.js' });
if (!win.KinshipHistoricalGazetteer) { console.error('resolver not exposed'); process.exit(1); }

// Extract makePlaceMapButton + openLocationOnMap from module 10 and run them
// with stubs that capture the opened place.
const module10 = appSrc.indexOf('// --- Map links for place fields ---');
const module10End = appSrc.indexOf('function renderEvents(person)', module10);
const slice = appSrc.slice(module10, module10End);
const opened = [];
const stub = `
  const readSelection = () => null;
  const storeSelection = () => true;
  const makeButton = () => ({ setAttribute() {}, addEventListener(type, fn) { this._click = fn; }, click() { this._click({ stopPropagation() {} }); } });
  const setButtonContent = () => {};
  const showToast = (m) => { opened.push({ toast: m }); };
  const cleanEventDisplayText = (t) => String(t || '').trim();
  function openLocationOnMap(place) { opened.push(place); }
  function preferredMapProvider() { return 'google'; }
  function setPreferredMapProvider() {}
`;
vm.runInContext(`${stub}\n(() => {\n${slice}\nwindow.__makePlaceMapButton = makePlaceMapButton;\n})();`, context, { filename: 'mapbutton.js' });

const cases = [
  ['Königsberg', 'Kaliningrad, Russia'],
  ['Koenigsberg', 'Kaliningrad, Russia'],
  ['Konigsberg', 'Kaliningrad, Russia'],
  ['Danzig', 'Gdansk, Poland'],
  ['Breslau', 'Wroclaw, Poland'],
  ['Lemberg, Galicia', 'Lviv, Ukraine'],
  ['Königsberg, East Prussia', 'Kaliningrad, Russia'],
  ['Brighton, Sussex, England', 'Brighton, Sussex, England'],
  ['East Prussia', 'East Prussia'],
  ['Co. Clare', 'Co. Clare'],
  ['Krysanowitz', 'Krizanovice, Czechia'],
  ['Suwalki', 'Suwalki'],
];
let pass = 0; let fail = 0;
for (const [place, expected] of cases) {
  const button = win.__makePlaceMapButton(place);
  opened.length = 0;
  button.click();
  // The stub captures the URL window.open received; decode the query text.
  const url = String(opened[0] || '');
  const match = /[?&]query=([^&]+)/.exec(url) || /[?&]query=([^&]+)/.exec(url);
  const actual = match ? decodeURIComponent(match[1]) : url;
  const ok = actual === expected;
  if (ok) pass += 1; else fail += 1;
  console.log(`${place.padEnd(26)} -> ${(actual || '(none)').padEnd(24)} ${ok ? '' : `EXPECTED: ${expected}`}`);
}
console.log(`\n${pass}/${cases.length} pass`);
process.exit(fail ? 1 : 0);
