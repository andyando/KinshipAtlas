const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');
const marks = [
  ['async function saveUploadedMedia(files) {', "console.error('QA saveUploadedMedia entered');"],
  ['    if (!person) return;', "    console.error('QA person', person && person.id, 'mode', mode);"],
  ['        const mediaPath = await storeMediaFile(', "        console.error('QA storing', file.name);"],
  ['    } else if (failedCount) {', "      console.error('QA saved', savedCount);\n    } else if (failedCount) {"]
];
for (const [needle, insert] of marks) {
  const i = src.indexOf(needle);
  if (i < 0) { console.error('missing', needle); continue; }
  const lineEnd = src.indexOf('\n', i) + 1;
  src = src.slice(0, lineEnd) + insert + '\n' + src.slice(lineEnd);
}
fs.writeFileSync('app.js', src);
console.log('instrumented');
