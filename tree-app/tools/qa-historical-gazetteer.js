// Headless verification of the historical gazetteer: runs the generated data
// bundle + the resolver module from the built app.js in a minimal VM stub, then
// checks every required location resolves with valid coordinates and timing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appDir = path.join(__dirname, '..');
const dataSrc = fs.readFileSync(path.join(appDir, 'data', 'historical-gazetteer.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');

const window = {};
const context = {
  window, performance: { now: () => Date.now() }, console,
  document: { querySelector: () => null, createElement: () => ({ style: {}, append() { }, addEventListener() { }, setAttribute() { } }), addEventListener() { } },
  localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  showToast() { }, navigator: {},
  URL, Blob: class { }, setTimeout, clearTimeout, Date, Map, Set, Promise,
  Object, JSON, Array, String, Number, Boolean, Math, RegExp, Error,
};
context.window = window;
vm.createContext(context);

// 1. Load the gazetteer data bundle.
vm.runInContext(dataSrc, context, { filename: 'historical-gazetteer.js' });

// 2. Execute only the resolver section of app.js (up to the end of module 18)
//    by slicing between the module banners — avoids DOM-heavy later modules.
const start = appSrc.indexOf('// 18. Historical Gazetteer');
const end = appSrc.indexOf('window.KinshipHistoricalGazetteer = {', start);
if (start === -1 || end === -1) { console.error('resolver section not found'); process.exit(1); }
// The export block ends with the loadUserAliases/buildHistoricalIndexes calls
// and the IIFE close that follows them.
const tailStart = appSrc.indexOf('loadUserAliases();\n  buildHistoricalIndexes();', end);
const tailEnd = appSrc.indexOf('})();', tailStart) + '})();'.length;
const resolverSrc = appSrc.slice(start, tailEnd);
// The slice must be syntactically valid on its own: wrap it in an IIFE stub
// providing the functions it references from other modules.
const stub = `
  const readSelection = () => null;
  const storeSelection = () => true;
  const makeButton = () => ({ type: '', addEventListener() {}, setAttribute() {}, append() {} });
  const setButtonContent = () => {};
  const showToast = () => {};
  const cleanEventDisplayText = (t) => String(t || '').trim();
  function openLocationOnMap() {}
  function preferredMapProvider() { return 'google'; }
  function setPreferredMapProvider() {}
`;
let resolver = null;
try {
  // The slice already ends with the IIFE close, so run it unwrapped.
  vm.runInContext(`${stub}\n(() => {\n${resolverSrc}`, context, { filename: 'resolver.js' });
  resolver = window.KinshipHistoricalGazetteer;
} catch (error) {
  console.error('resolver slice threw:', error.message);
}
if (!resolver) { console.error('FAIL: resolver not exposed'); process.exit(1); }

const REQUIRED = [
  ['Koenigsberg', 'Kaliningrad'], ['Königsberg', 'Kaliningrad'], ['Konigsberg', 'Kaliningrad'],
  ['Lyck', 'Elk'], ['Bartenstein', 'Bartoszyce'], ['Rastenburg', 'Ketrzyn'],
  ['Schirwindt', 'Kutuzovo'], ['Insterburg', 'Chernyakhovsk'], ['Danzig', 'Gdansk'],
  ['Rogasen', 'Rogozno'], ['Posen', 'Poznan'], ['Suwalki', 'Suwalki'],
  ['East Prussia', null], ['OstPreussen', null], ['Province of Prussia', null],
  ['Kingdom of Prussia', null], ['Upper Silesia', null], ['Krysanowitz', null],
  // extra coverage
  ['Breslau', 'Wroclaw'], ['Lemberg', 'Lviv'], ['West Prussia', null], ['Galicia', null],
  ['Königsberg, East Prussia', 'Kaliningrad'], ['Co. Clare', null], ['West Riding', null],
  ['Danzig, West Prussia', 'Gdansk'], ['Krakau', 'Krakow'], ['Temesvar', 'Timisoara'],
  ['Lemberg, Galicia', 'Lviv'], ['Nonexistent Town, XYZ', null, false]
];

let pass = 0; let fail = 0; let slowest = 0;
console.log('place'.padEnd(28), 'resolves to'.padEnd(24), 'coords', 'prec'.padEnd(7), 'ms');
for (const [place, expectLabel, shouldResolve = true] of REQUIRED) {
  const started = performance.now();
  const result = resolver.resolve(place);
  const ms = Math.round(performance.now() - started);
  slowest = Math.max(slowest, ms);
  const valid = result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude);
  const labelOk = expectLabel ? (result?.label || '').toLowerCase() === expectLabel.toLowerCase() : true;
  const ok = shouldResolve ? Boolean(valid && labelOk) : !result;
  if (ok) pass += 1; else { fail += 1; }
  console.log(
    place.padEnd(28),
    (result ? result.label : '—').padEnd(24),
    result ? `${result.latitude}, ${result.longitude}` : '—',
    (result?.precision || '—').padEnd(7),
    String(ms).padStart(3) + 'ms',
    ok ? '' : `  <-- FAIL (expected ${expectLabel || 'a result'}, got ${result ? result.label : 'nothing'})`
  );
}
console.log(`\n${pass} passed, ${fail} failed. Slowest lookup: ${slowest}ms (budget 50ms).`);
process.exit(fail ? 1 : 0);
