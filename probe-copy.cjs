// Compare the icon/mapping blocks between the two copies of app.js.
'use strict';
const fs = require('fs');
const a = fs.readFileSync('g:/Git/Kinship_Experimental/tree-app/app.js', 'utf8');
const b = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/app.js', 'utf8');
console.log('workspace length:', a.length, ' deploy length:', b.length);
for (const [name, src] of [['workspace', a], ['deploy', b]]) {
    const grab = (label) => {
        const i = src.indexOf(label + ": '");
        return i < 0 ? 'ABSENT' : src.slice(i, i + 90).replace(/\s+/g, ' ');
    };
    console.log('\n== ' + name + ' ==');
    console.log('immigration:', grab('immigration'));
    console.log('emigration :', grab('emigration'));
    console.log('birth      :', grab('birth'));
    const mapIdx = src.indexOf('BIRT: \'birth\'');
    console.log('eventIconMap present:', mapIdx !== -1, mapIdx !== -1 ? src.slice(mapIdx - 30, mapIdx + 260).replace(/\s+/g, ' ') : '');
}
