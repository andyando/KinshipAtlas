const http = require('http'), fs = require('fs'), path = require('path');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ged': 'text/plain', '.json': 'application/json' };
process.chdir('G:/Kinship Atlas - Copy/tree-app');
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(process.cwd(), p);
  fs.readFile(f, (e, d) => {
    if (e) { res.statusCode = 404; res.end('nf'); return; }
    res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream');
    res.end(d);
  });
}).listen(8811, () => console.log('up on 8811'));
