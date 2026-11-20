const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');
const add = (needle, line) => {
  const i = src.indexOf(needle);
  if (i < 0) { console.error('missing ' + needle.slice(0, 50)); return; }
  const end = src.indexOf('\n', i) + 1;
  src = src.slice(0, end) + line + '\n' + src.slice(end);
};
add("elements.mediaUploadInput.addEventListener('change', (event) => {", "    console.error('QA change ' + (event.target.files || []).length);");
add("  async function saveUploadedMedia(files) {", "    console.error('QA save ' + files.length + ' pending=' + state.pendingUploadPersonId + ' mode=' + mediaSaveMode());");
add("    if (!person) return;", "    console.error('QA person ' + !!person);");
add("        const mediaPath = await storeMediaFile(file, mode, directoryHandle, person.id);", "        console.error('QA store ' + file.name + ' in ' + person.id);");
add("      } catch (error) {\n        console.warn('A media file could not be saved.', error);", "      } catch (error) {\n        console.error('QA FAILED ' + error);\n        console.warn('A media file could not be saved.', error);");
add("    if (savedCount) {", "    console.error('QA saved ' + savedCount + ' failed ' + failedCount);");
fs.writeFileSync('app.js', src);
console.log('instrumented');
