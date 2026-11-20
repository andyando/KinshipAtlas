const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');
const marks = [
  ["elements.mediaUploadInput.addEventListener('change', (event) => {", "elements.mediaUploadInput.addEventListener('change', (event) => {\n    console.error('QA change fired ' + (event.target.files || []).length);"],
  ["  async function saveUploadedMedia(files) {", "  async function saveUploadedMedia(files) {\n    console.error('QA saveUploadedMedia ' + files.length + ' pending=' + state.pendingUploadPersonId);"],
  ["    if (!person) return;", "    console.error('QA person? ' + !!person + ' mode=' + mode);\n    if (!person) return;"],
  ["        const mediaPath = await storeMediaFile(file, mode, directoryHandle, person.id);", "        console.error('QA store ' + file.name);\n        const mediaPath = await storeMediaFile(file, mode, directoryHandle, person.id);"],
  ["      } catch (error) {\n        console.warn('A media file could not be saved.', error);", "      } catch (error) {\n        console.error('QA FAILED ' + error);\n        console.warn('A media file could not be saved.', error);"],
  ["    if (savedCount) {", "    console.error('QA savedCount ' + savedCount + ' failed ' + failedCount);\n    if (savedCount) {"],
  ["    if (mode === 'helper') {\n      const saved = await uploadToMediaHelper(file, personId);", "    if (mode === 'helper') {\n      console.error('QA helper upload');\n      const saved = await uploadToMediaHelper(file, personId);\n      console.error('QA helper saved ' + JSON.stringify(saved));"],
  ["  async function uploadToMediaHelper(file, personId) {", "  async function uploadToMediaHelper(file, personId) {\n    console.error('QA POST /api/media ' + file.name);"]
];
for (const [needle, insert] of marks) {
  const i = src.indexOf(needle);
  if (i < 0) { console.error('missing: ' + needle); continue; }
  const lineEnd = src.indexOf('\n', i) + 1;
  src = src.slice(0, lineEnd) + insert + '\n' + src.slice(lineEnd);
}
fs.writeFileSync('app.js', src);
console.log('instrumented');
