'use strict';
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');
const defs = ['personName', 'parentsOf', 'partnersOf', 'childrenOf', 'kinshipGraph', 'ancestorDepths', 'bloodRelation', 'genderedTerm', 'ordinalNumber', 'bloodTerm', 'affinalTerm', 'describeKinship', 'kinshipPath', 'siblingFamiliesOf', 'siblingsOf', 'generationLevels', 'yearFrom', 'lifespan', 'isRecordedDeceased'];
for (const d of defs) {
  const n = (src.match(new RegExp('\\b' + d + '\\(', 'g')) || []).length;
  console.log(d, n);
}
