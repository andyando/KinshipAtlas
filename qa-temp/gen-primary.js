const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'primary');
const libraryDir = path.join(root, 'Primary Media Library');
const mediaDir = path.join(libraryDir, fs.readdirSync(libraryDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()[0]);
const gedcomDir = path.join(root, 'Primary GEDCOM');
const gedcomName = fs.readdirSync(gedcomDir).filter((f) => /\.ged$/i.test(f)).sort()[0];
const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.pdf'];
const byName = new Map();
for (const folder of fs.readdirSync(mediaDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(mediaDir, folder.name), { withFileTypes: true })) {
    if (file.isFile()) byName.set(file.name, path.join(mediaDir, folder.name, file.name));
  }
}
for (const file of fs.readdirSync(mediaDir, { withFileTypes: true })) {
  if (file.isFile() && !byName.has(file.name)) byName.set(file.name, path.join(mediaDir, file.name));
}
const items = [];
for (const [name, full] of byName) {
  const ext = path.extname(full).toLowerCase();
  if (!exts.includes(ext)) continue;
  const relative = path.relative(mediaDir, full).replace(/\\/g, '/');
  const fromLibrary = path.relative(libraryDir, full).replace(/\\/g, '/');
  const type = ext === '.pdf' ? 'application/pdf' : `image/${ext.slice(1).replace('jpg', 'jpeg')}`;
  items.push({ name, path: relative, url: 'Primary%20Media%20Library/' + fromLibrary.split('/').map(encodeURIComponent).join('/'), type });
}
const text = fs.readFileSync(path.join(gedcomDir, gedcomName), 'utf8');
fs.writeFileSync(path.join(__dirname, 'app', 'primary-data.js'), `window.KINSHIP_PRIMARY = ${JSON.stringify({ gedcomName, gedcomText: text, media: items }, null, 2)};\n`);
console.log('media dir', mediaDir, 'items', items.length, 'gedcom', gedcomName);
