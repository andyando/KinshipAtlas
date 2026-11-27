'use strict';
const fs = require('node:fs');
const path = require('node:path');
const appPath = path.resolve(__dirname, '..', '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');
const defs = ['personName', 'parentsOf', 'partnersOf', 'childrenOf', 'kinshipGraph', 'ancestorDepths', 'bloodRelation', 'genderedTerm', 'ordinalNumber', 'bloodTerm', 'affinalTerm', 'describeKinship', 'kinshipPath', 'siblingFamiliesOf', 'siblingsOf', 'generationLevels', 'yearFrom', 'lifespan', 'isRecordedDeceased'];
for (const d of defs) {
  const n = (src.match(new RegExp('\\b' + d + '\\(', 'g')) || []).length;
  console.log(d, n);
}
