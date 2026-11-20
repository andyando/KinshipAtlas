const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');
src = src.replace("elements.mediaUploadInput.addEventListener('change', (event) => {", "elements.mediaUploadInput.addEventListener('change', (event) => {\n    console.error('QA change fired', event.target.files && event.target.files.length);");
src = src.replace("    const person = state.people.get(portraitPersonId || state.pendingUploadPersonId);", "    console.error('QA pending', portraitPersonId, state.pendingUploadPersonId);\n    const person = state.people.get(portraitPersonId || state.pendingUploadPersonId);");
fs.writeFileSync('app.js', src);
console.log('ok');
