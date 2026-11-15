// QA static server with a /api/media-info stub and /media file server backed by
// the real "Primary Media Library" folder. Port = argv[2] || 8890.
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.argv[2]) || 8890;
const ROOT = path.join(__dirname, '..');
const MEDIA_ROOT = 'G:\\Kinship Atlas - Copy\\tree-app\\Primary Media Library\\Ancestry_01112026_media';

// name -> absolute path (e.g. 'My Photo.jpg', 'subfolder/Inner.jpg')
const mediaFiles = new Map();
function indexMedia(dir, rel) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) indexMedia(abs, relPath);
    else mediaFiles.set(relPath.toLowerCase(), abs);
  }
}
indexMedia(MEDIA_ROOT, '');
console.log(`[qa-server] indexed ${mediaFiles.size} media files`);

function send(res, code, body, headers) {
  res.writeHead(code, headers);
  res.end(body);
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const fileStart = () => {
    const ext = path.extname(pathname).toLowerCase();
    send(res, 200, fs.readFileSync(path.join(ROOT, pathname)),
      { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  };
  try {
    if (pathname === '/api/media-info') {
      send(res, 200, JSON.stringify({ available: true, folder: 'Primary Media Library', deletePaths: true, saveGedcom: true, gedcom: 'Ancestry_01112026.ged' }), { 'Content-Type': 'application/json' });
      return;
    }
    if (pathname.startsWith('/media/')) {
      const rel = pathname.slice('/media/'.length).toLowerCase();
      const abs = mediaFiles.get(rel);
      if (!abs) { send(res, 404, 'Not found'); return; }
      const ext = path.extname(abs).toLowerCase();
      send(res, 200, fs.readFileSync(abs),
        { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return;
    }
    if (pathname !== '/' && fs.existsSync(path.join(ROOT, pathname)) && fs.statSync(path.join(ROOT, pathname)).isFile()) fileStart();
    else if (pathname === '/') fileStart();
    else send(res, 404, 'Not found');
  } catch (error) {
    send(res, 500, String(error));
  }
});
server.listen(PORT, () => console.log(`[qa-server] listening on ${PORT}`));
