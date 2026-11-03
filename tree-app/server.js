'use strict';
// Local helper for browsers without folder-write access (e.g. Brave).
// Usage: node server.js "<media folder>" [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

let mediaDir = path.resolve(process.argv[2] || process.env.MEDIA_DIR || '');
const port = Number(process.argv[3] || process.env.PORT || 8765);
const appDir = __dirname;
const maxUploadBytes = 100 * 1024 * 1024;

if (!process.argv[2] && !process.env.MEDIA_DIR) {
  console.error('Usage: node server.js "<media folder>" [port]');
  process.exit(1);
}
fs.mkdirSync(mediaDir, { recursive: true });

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.pdf': 'application/pdf'
};
const uploadExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.pdf']);

function send(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function isLocalRequest(request) {
  const hostOk = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host || '');
  const origin = request.headers.origin;
  return hostOk && (!origin || origin === `http://${request.headers.host}`);
}

function safeName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim();
  return base && !base.startsWith('.') ? base : '';
}

function serveFile(response, root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) || path.basename(target) === 'server.js') return send(response, 404, { error: 'Not found' });
  fs.readFile(target, (error, data) => {
    if (error) return send(response, 404, { error: 'Not found' });
    send(response, 200, data, types[path.extname(target).toLowerCase()] || 'application/octet-stream');
  });
}

function receiveUpload(request, response) {
  const fileName = safeName(request.headers['x-file-name'] ? decodeURIComponent(request.headers['x-file-name']) : '');
  const extension = path.extname(fileName).toLowerCase();
  if (!fileName || !uploadExtensions.has(extension)) return send(response, 400, { error: 'Only image and PDF files are accepted.' });
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxUploadBytes) {
      send(response, 413, { error: 'File is too large.' });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    const baseName = fileName.slice(0, -extension.length);
    for (let suffix = 0; suffix < 10000; suffix += 1) {
      const candidate = suffix ? `${baseName} (${suffix + 1})${extension}` : fileName;
      try {
        fs.writeFileSync(path.join(mediaDir, candidate), Buffer.concat(chunks), { flag: 'wx' });
        return send(response, 200, { name: candidate });
      } catch (error) {
        if (error.code !== 'EEXIST') return send(response, 500, { error: 'The file could not be written.' });
      }
    }
    send(response, 500, { error: 'Could not find an unused filename.' });
  });
}

// Creates <name>.ged and an empty <name>_Media folder beside the current media folder, then switches to it.
function receiveNewTree(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) {
      send(response, 413, { error: 'Request is too large.' });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    const base = safeName(String(body.name || '').replace(/\.(?:ged|gedcom)$/i, ''));
    if (!base || typeof body.text !== 'string') return send(response, 400, { error: 'Invalid request.' });
    const parent = path.dirname(mediaDir);
    const gedPath = path.join(parent, `${base}.ged`);
    const newMediaDir = path.join(parent, `${base}_Media`);
    try {
      fs.writeFileSync(gedPath, body.text, { flag: 'wx' });
      fs.mkdirSync(newMediaDir, { recursive: true });
    } catch (error) {
      return send(response, error.code === 'EEXIST' ? 409 : 500, { error: 'The files could not be created.' });
    }
    mediaDir = newMediaDir;
    send(response, 200, { folder: path.basename(mediaDir) });
  });
}

// Persists card image / primary person choices beside the app so they survive browser and folder changes.
function receiveSelections(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) {
      send(response, 413, { error: 'Request is too large.' });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    if (!body || typeof body !== 'object' || !body.selections || typeof body.selections !== 'object') {
      return send(response, 400, { error: 'Invalid request.' });
    }
    const target = path.join(appDir, 'kinship-selections.json');
    try {
      fs.writeFileSync(`${target}.saving`, JSON.stringify(body, null, 2));
      fs.renameSync(`${target}.saving`, target);
    } catch {
      return send(response, 500, { error: 'The selections could not be written.' });
    }
    send(response, 200, { ok: true });
  });
}

// Opens the system file manager on a file inside the media folder.
function revealFile(request, response) {
  const chunks = [];
  request.on('data', (chunk) => { if (chunks.length < 64) chunks.push(chunk); });
  request.on('end', () => {
    let name = '';
    try {
      name = safeName(JSON.parse(Buffer.concat(chunks).toString('utf8')).name);
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    const target = path.join(mediaDir, name);
    if (!name || !fs.existsSync(target)) return send(response, 404, { error: 'Not found' });
    const [command, args] = process.platform === 'win32' ? ['explorer.exe', [`/select,${target}`]]
      : process.platform === 'darwin' ? ['open', ['-R', target]]
        : ['xdg-open', [mediaDir]];
    execFile(command, args, () => { });
    send(response, 200, { ok: true });
  });
}

// Deletes one uploaded image or PDF from the media folder. Only plain file names inside the folder are accepted.
function deleteFile(request, response) {
  const chunks = [];
  request.on('data', (chunk) => { if (chunks.length < 64) chunks.push(chunk); });
  request.on('end', () => {
    let name = '';
    let expectedSize = null;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      name = safeName(body.name);
      if (Number.isInteger(body.size)) expectedSize = body.size;
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    if (!name || !uploadExtensions.has(path.extname(name).toLowerCase())) return send(response, 400, { error: 'Invalid file name.' });
    const target = path.join(mediaDir, name);
    if (path.dirname(target) !== mediaDir) return send(response, 400, { error: 'Invalid file name.' });
    let stats;
    try {
      stats = fs.statSync(target);
    } catch {
      return send(response, 404, { error: 'Not found' });
    }
    if (!stats.isFile() || (expectedSize !== null && stats.size !== expectedSize)) return send(response, 409, { error: 'File does not match.' });
    fs.unlink(target, (error) => {
      if (!error) return send(response, 200, { ok: true });
      send(response, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'Not found' : 'The file could not be deleted.' });
    });
  });
}

http.createServer((request, response) => {
  if (!isLocalRequest(request)) return send(response, 403, { error: 'Forbidden' });
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/api/media-info') return send(response, 200, { available: true, folder: path.basename(mediaDir) });
  if (request.method === 'POST' && url.pathname === '/api/new-tree') return receiveNewTree(request, response);
  if (request.method === 'POST' && url.pathname === '/api/media') return receiveUpload(request, response);
  if (request.method === 'POST' && url.pathname === '/api/selections') return receiveSelections(request, response);
  if (request.method === 'POST' && url.pathname === '/api/reveal') return revealFile(request, response);
  if (request.method === 'POST' && url.pathname === '/api/media-delete') return deleteFile(request, response);
  if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
    const name = safeName(decodeURIComponent(url.pathname.slice('/media/'.length)));
    return name ? serveFile(response, mediaDir, name) : send(response, 404, { error: 'Not found' });
  }
  if (request.method === 'GET') return serveFile(response, appDir, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
  send(response, 405, { error: 'Method not allowed' });
}).listen(port, '127.0.0.1', () => {
  console.log(`Kinship Atlas helper running at http://localhost:${port}/`);
  console.log(`Saving uploaded media to: ${mediaDir}`);
});
