'use strict';
// Count person folders where a person id folder holds 0 files but the folder
// list shows Robert with 0: check whether Robert's folder really is empty.
const fs = require('fs');
const dir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media/Robert Nicholson White (1890-1957) [I68]';
for (const e of fs.readdirSync(dir, { withFileTypes: true })) console.log(e.isDirectory() ? '[dir] ' + e.name : ' ' + e.name + ' ' + e.size);
