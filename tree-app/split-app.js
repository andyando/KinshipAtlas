// Phase 4 extraction, step 1: split app.js into src/modules/*.js
// Byte-preserving: every line of app.js lands in exactly one module, so
// concatenating modules in order reproduces app.js exactly (CRLF included).
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const EOL = /\r\n/.test(SRC) ? '\r\n' : '\n';
const lines = SRC.split(EOL);

// 1-based line numbers where each numbered section banner comment starts.
const BANNERS = [
  6,    // header comment block listing sections (goes to 00-header)
  27,   // 1. Constants and application state
  101,  // 2. Cached DOM elements
  172,  // 3. GEDCOM primitives
  312,  // 4. Session persistence (IndexedDB)
  394,  // 5. GEDCOM parsing
  599,  // 6. Kinship graph and relationship terms
  847,  // 7. Search Public Records
  1052, // 8. Media handling
  1228, // 9. Selections and per-tree storage keys
  1885, // 10. Rendering
  4999, // 11. Editors and dialogs
  6128, // 12. Directory, duplicate finder
  6987, // 13. GEDCOM import, merging and saving
  9045, // 14. Map, print, defaults, about/help and startup wiring
];

const MODULES = [
  { file: '00-header.js', from: 1, to: 26, name: 'File header and organisation notes' },
  { file: '01-state.js', from: 27, to: 100, name: 'Constants and application state' },
  { file: '02-dom.js', from: 101, to: 171, name: 'Cached DOM elements' },
  { file: '03-gedcom-primitives.js', from: 172, to: 311, name: 'GEDCOM primitives (parsing, serialising, record helpers)' },
  { file: '04-session.js', from: 312, to: 393, name: 'Session persistence (IndexedDB)' },
  { file: '05-gedcom-parse.js', from: 394, to: 598, name: 'GEDCOM parsing' },
  { file: '06-kinship.js', from: 599, to: 846, name: 'Kinship graph and relationship terms' },
  { file: '07-public-records.js', from: 847, to: 1051, name: 'Search Public Records (multi-provider external lookups)' },
  { file: '08-media.js', from: 1052, to: 1227, name: 'Media handling (index, storage, resolution)' },
  { file: '09-selections.js', from: 1228, to: 1884, name: 'Selections and per-tree storage keys' },
  { file: '10-rendering.js', from: 1885, to: 4998, name: 'Rendering (tree, roster, details, media library, reports)' },
  { file: '11-editors.js', from: 4999, to: 6127, name: 'Editors and dialogs (person, life events, relationships, deletion)' },
  { file: '12-directory.js', from: 6128, to: 6986, name: 'Directory, duplicate finder and birth-country suggestions' },
  { file: '13-import.js', from: 6987, to: 9044, name: 'GEDCOM import, merging and saving' },
  { file: '14-map-print.js', from: 9045, to: lines.length, name: 'Map, print, defaults, about/help and startup wiring' },
];

const outDir = path.join(__dirname, 'src', 'modules');
fs.rmSync(path.join(__dirname, 'src'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let cursor = 1;
const manifests = [];
for (const m of MODULES) {
  const chunk = lines.slice(m.from - 1, m.to);
  const body = chunk.join(EOL) + (m.to < lines.length ? EOL : '');
  fs.writeFileSync(path.join(outDir, m.file), body, 'utf8');
  manifests.push({ file: m.file, from: m.from, to: m.to, lines: chunk.length, name: m.name });
  // Sanity: chunks must tile app.js exactly, no gaps/overlaps.
  if (m.from !== cursor) throw new Error(`Gap/overlap before ${m.file}: expected ${cursor}, got ${m.from}`);
  cursor = m.to + 1;
}
if (cursor !== lines.length + 1) throw new Error(`Unused tail: last used line ${cursor - 1}, total ${lines.length}`);

fs.writeFileSync(path.join(__dirname, 'src', 'modules.json'),
  JSON.stringify({ eol: EOL === '\r\n' ? 'crlf' : 'lf', totalLines: lines.length, modules: manifests }, null, 2));

// Immediate verification: reassemble in memory and diff bytes.
const reassembled = MODULES.map((m) => {
  const t = fs.readFileSync(path.join(outDir, m.file), 'utf8');
  return t.replace(/\r\n$/, m.to < lines.length ? EOL : '');
}).join('');
const ok = reassembled === SRC;
console.log(JSON.stringify({
  totalLines: lines.length,
  modules: manifests.map((m) => `${m.file} (${m.lines} lines)`),
  byteIdentical: ok,
}, null, 2));
if (!ok) process.exit(1);
