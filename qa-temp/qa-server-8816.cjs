// Static server for QA on port 8816 — serves the DEPLOYED tree-app build,
// with URL path mapping: /tree-app/... -> G:\Kinship Atlas - Copy\tree-app\...
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = 'G:\\Kinship Atlas - Copy\\tree-app';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ged': 'text/plain', '.pdf': 'application/pdf', '.json': 'application/json', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/tree-app/')) p = p.slice('/tree-app'.length);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf: ' + p); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}).listen(8816, () => console.log('listening 8816 (deployed tree-app)'));
