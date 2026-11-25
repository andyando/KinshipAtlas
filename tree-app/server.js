'use strict';
// Local helper for browsers without folder-write access (e.g. Brave).
// Usage: node server.js "<media folder>" [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

// Explorer opens behind the browser window when launched from a web page; bring
// it to the front with the Windows Script Host shell, matching the launcher's
// SetForegroundWindow behavior. Tries the window's folder-name title first,
// then the generic "File Explorer" title Windows 11 shows.
function focusExplorerWindow(fallbackTitle) {
  if (process.platform !== 'win32') return;
  setTimeout(() => {
    const script =
      '$w = New-Object -ComObject wscript.shell; ' +
      'if (-not $w.AppActivate(' + JSON.stringify(fallbackTitle).replace(/"/g, "'") + ')) { $w.AppActivate(\'File Explorer\') }';
    execFile('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], () => { });
  }, 500);
}
const { listMediaFiles, planFor, applyPlan, findDuplicates, applyDuplicates, deleteFolder, repoint } = require('./helpers/media-organise-fs.js');

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
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.pdf': 'application/pdf',
  '.wasm': 'application/wasm', '.tflite': 'application/octet-stream'
};
const uploadExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.pdf']);

function send(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
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

// A person's own folder inside the media folder, e.g. "Adam Fleming (1841-1898) [I1055]".
function safeFolder(name) {
  return safeName(decodeURIComponent(String(name || '')));
}

// Opens the system file manager at the media folder, or with one file or folder
// inside it selected: POST {"path":"<relative path>"}.
function revealInExplorer(request, response) {
  const chunks = [];
  request.on('data', (chunk) => { if (chunks.length < 64) chunks.push(chunk); });
  request.on('end', () => {
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {};
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    const relative = String(body.path || '').replace(/\\/g, '/');
    const segments = relative.split('/').filter(Boolean);
    if (!segments.every((segment) => segment === safeName(segment))) return send(response, 400, { error: 'Invalid path.' });
    const target = segments.length ? path.resolve(mediaDir, ...segments) : mediaDir;
    const root = path.resolve(mediaDir) + path.sep;
    if (segments.length && !target.startsWith(root)) return send(response, 400, { error: 'Invalid path.' });
    const existing = fs.existsSync(target) ? target : mediaDir;
    const [command, args] = process.platform === 'win32'
      ? ['explorer.exe', [fs.statSync(existing).isDirectory() ? existing : `/select,${existing}`]]
      : process.platform === 'darwin' ? ['open', [fs.statSync(existing).isDirectory() ? existing : '-R', existing]]
        : ['xdg-open', [fs.statSync(existing).isDirectory() ? existing : path.dirname(existing)]];
    execFile(command, args, () => { });
    focusExplorerWindow(path.basename(existing));
    send(response, 200, { ok: true });
  });
}

function serveFile(response, root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) || path.basename(target) === 'server.js') return send(response, 404, { error: 'Not found' });
  fs.readFile(target, (error, data) => {
    if (error) return send(response, 404, { error: 'Not found' });
    send(response, 200, data, types[path.extname(target).toLowerCase()] || 'application/octet-stream');
  });
}

// A media file for the page. The page asks for the file with a version of its
// own ("?v=..."), so after a move or a delete the browser fetches the file
// again instead of showing a cached image from the old path.
function serveMediaFile(request, response, relative, version) {
  const target = path.resolve(mediaDir, relative);
  if (!target.startsWith(mediaDir + path.sep)) return send(response, 404, { error: 'Not found' });
  // Streamed rather than read whole: scan images run to many megabytes, and
  // buffering every one serialises the page's parallel thumbnail requests.
  const headers = {
    'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes'
  };
  if (version) headers.ETag = `"${version}"`;
  // The page tags every media URL with a ?v= content version, so a cached copy
  // is always current: answering a matching If-None-Match with 304 skips the
  // file read entirely on repeat views.
  if (version && requestIfNoneMatchIs(request, version)) {
    response.writeHead(304, { ETag: headers.ETag, 'Cache-Control': headers['Cache-Control'] });
    return response.end();
  }
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return response.end(JSON.stringify({ error: 'Not found' }));
    }
    headers['Content-Length'] = stats.size;
    const range = version ? null : parseRangeHeader(request.headers?.range, stats.size);
    if (range) {
      const stream = fs.createReadStream(target, { start: range.start, end: range.end });
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}` });
      stream.pipe(response);
      return;
    }
    response.writeHead(200, headers);
    fs.createReadStream(target).pipe(response);
  });
}

function requestIfNoneMatchIs(request, version) {
  const header = request.headers?.['if-none-match'];
  return typeof header === 'string' && header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === `"${version}"`);
}

function parseRangeHeader(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null) {
    // Suffix range: the last N bytes.
    const length = Math.min(end, size);
    start = size - length;
    end = size - 1;
  } else {
    end = end === null || end >= size ? size - 1 : end;
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

function receiveUpload(request, response) {
  const fileName = safeName(request.headers['x-file-name'] ? decodeURIComponent(request.headers['x-file-name']) : '');
  const extension = path.extname(fileName).toLowerCase();
  if (!fileName || !uploadExtensions.has(extension)) return send(response, 400, { error: 'Only image and PDF files are accepted.' });
  // With a person folder the file is saved in that person's own folder, which is
  // created when missing, and the reply names the folder so the link includes it.
  const folderName = safeFolder(request.headers['x-media-folder']);
  const targetDir = folderName ? path.join(mediaDir, folderName) : mediaDir;
  if (folderName) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch { return send(response, 500, { error: 'The person folder could not be created.' }); }
  }
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
        fs.writeFileSync(path.join(targetDir, candidate), Buffer.concat(chunks), { flag: 'wx' });
        return send(response, 200, { name: candidate, folder: folderName });
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

// Opens the system file manager on a file inside the media folder, including files in a person's folder.
function revealFile(request, response) {
  const chunks = [];
  request.on('data', (chunk) => { if (chunks.length < 64) chunks.push(chunk); });
  request.on('end', () => {
    let requestFile = {};
    try {
      requestFile = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {};
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    const name = safeName(requestFile.name);
    const folder = safeFolder(requestFile.folder);
    const target = name ? path.join(mediaDir, folder, name) : '';
    if (!name || !fs.existsSync(target) || !path.resolve(target).startsWith(path.resolve(mediaDir) + path.sep)) return send(response, 404, { error: 'Not found' });
    const [command, args] = process.platform === 'win32' ? ['explorer.exe', [`/select,${target}`]]
      : process.platform === 'darwin' ? ['open', ['-R', target]]
        : ['xdg-open', [path.dirname(target)]];
    execFile(command, args, () => { });
    focusExplorerWindow(path.basename(path.dirname(target)));
    send(response, 200, { ok: true });
  });
}

// Deletes one uploaded image or PDF from the media folder, either at its root or inside one person folder.
// Only plain folder and file names inside the folder are accepted.
function deleteFile(request, response) {
  const chunks = [];
  request.on('data', (chunk) => { if (chunks.length < 64) chunks.push(chunk); });
  request.on('end', () => {
    let name = '';
    let folder = '';
    let expectedSize = null;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      name = safeName(body.name);
      folder = safeFolder(body.folder);
      if (Number.isInteger(body.size)) expectedSize = body.size;
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    if (!name || !uploadExtensions.has(path.extname(name).toLowerCase())) return send(response, 400, { error: 'Invalid file name.' });
    const target = path.join(mediaDir, folder, name);
    if (path.dirname(target) !== (folder ? path.join(mediaDir, folder) : mediaDir)) return send(response, 400, { error: 'Invalid file name.' });
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

// Plans, or plans and applies, the media folder organisation for the browser.
// The browser sends the GEDCOM records it has open and its card image choices;
// the reply lists the plan, and for an apply also the GEDCOM text to save and
// the files that changed.
function receiveMediaOrganise(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 200 * 1024 * 1024) {
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
    if (!body || !Array.isArray(body.records)) return send(response, 400, { error: 'Invalid request.' });
    let planned;
    try {
      planned = planFor(mediaDir, body);
    } catch {
      return send(response, 500, { error: 'The media folder could not be read.' });
    }
    const { state, plan, unusedFolders } = planned;
    // Deleting one unused subfolder the plan reported.
    if (typeof body.deleteFolder === 'string' && body.deleteFolder) {
      try {
        const folderDelete = deleteFolder(mediaDir, body.deleteFolder);
        return send(response, 200, { ok: true, folderDelete, gedcomText: state.gedcomText });
      } catch (error) {
        return send(response, 500, { error: error?.message || 'The folder could not be deleted.' });
      }
    }
    if (body.apply !== true) {
      return send(response, 200, {
        ok: true, plan: { counts: plan.counts, actions: plan.actions, warnings: plan.warnings }, unusedFolders, gedcomText: state.gedcomText
      });
    }
    try {
      const result = applyPlan(mediaDir, state, plan);
      // Every FILE line naming a media file of this folder ends up pointing at
      // its place here, however it spelled the path before.
      const repointed = repoint(mediaDir, result.gedcomText, listMediaFiles(mediaDir), body);
      return send(response, 200, {
        ok: true,
        plan: { counts: plan.counts, actions: plan.actions, warnings: plan.warnings },
        unusedFolders,
        moves: result.moves,
        renames: result.renames,
        summary: result.counts,
        unsupported: state.unsupported,
        gedcomText: repointed
      });
    } catch {
      return send(response, 500, { error: 'The media folder could not be organised. Some files may already have moved.' });
    }
  });
}

// Finds exact duplicate images and PDFs, or removes/archives the ones the user
// picked. The browser sends its GEDCOM records, card image choices and, for a
// removal, which files to keep and which to drop.
function receiveDuplicates(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 200 * 1024 * 1024) {
      send(response, 413, { error: 'Request is too large.' });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', async () => {
    if (response.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(response, 400, { error: 'Invalid request.' });
    }
    if (!body || !Array.isArray(body.records)) return send(response, 400, { error: 'Invalid request.' });
    try {
      if (body.apply === true) {
        const result = await applyDuplicates(mediaDir, body);
        return send(response, 200, { ok: true, ...result });
      }
      return send(response, 200, { ok: true, ...(await findDuplicates(mediaDir, body)) });
    } catch (error) {
      return send(response, 500, { error: error?.message || 'The media folder could not be checked for duplicates.' });
    }
  });
}

const server = http.createServer((request, response) => {
  if (!isLocalRequest(request)) return send(response, 403, { error: 'Forbidden' });
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/api/media-info') return send(response, 200, { available: true, folder: path.basename(mediaDir), mediaPath: mediaDir, mediaFolder: path.basename(mediaDir), deletePaths: true, personFolders: true, organiseMedia: true, findDuplicates: true, reveal: true });
  if (request.method === 'POST' && url.pathname === '/api/exit') {
    send(response, 200, { ok: true });
    setTimeout(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref();
    }, 250).unref();
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/new-tree') return receiveNewTree(request, response);
  if (request.method === 'POST' && url.pathname === '/api/media') return receiveUpload(request, response);
  if (request.method === 'POST' && url.pathname === '/api/selections') return receiveSelections(request, response);
  if (request.method === 'POST' && url.pathname === '/api/reveal-file') return revealFile(request, response);
  if (request.method === 'POST' && url.pathname === '/api/media-delete') return deleteFile(request, response);
  if (request.method === 'POST' && url.pathname === '/api/media-organise') return receiveMediaOrganise(request, response);
  if (request.method === 'POST' && url.pathname === '/api/duplicates') return receiveDuplicates(request, response);
  if (request.method === 'POST' && url.pathname === '/api/reveal') return revealInExplorer(request, response);
  if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
    // Any depth is accepted so files inside a person's folder can be previewed.
    const relative = decodeURIComponent(url.pathname.slice('/media/'.length));
    if (!relative || relative.split('/').some((segment) => !safeName(segment))) return send(response, 404, { error: 'Not found' });
    return serveMediaFile(request, response, relative, url.searchParams.get('v') || '');
  }
  if (request.method === 'GET') return serveFile(response, appDir, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
  send(response, 405, { error: 'Method not allowed' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Kinship Atlas helper running at http://localhost:${port}/`);
  console.log(`Saving uploaded media to: ${mediaDir}`);
});
