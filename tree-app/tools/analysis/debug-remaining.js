'use strict';
const fs = require('fs');
const ged = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const stale = ged.split('\n').filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('remaining stale:', stale.length);
for (const l of stale.slice(0, 20)) console.log(' ', l.trim().slice(0, 115));
