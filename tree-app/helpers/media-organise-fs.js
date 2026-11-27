'use strict';
// Media folder organisation for the local helpers.
//
// The planning is done by helpers/media-organise.js, which the browser app loads
// too, so the same GEDCOM and media folder always give the same plan. This file
// only reads the folder, carries the plan out on disk and points the GEDCOM's
// FILE lines at the new paths. It also finds and removes exact duplicate files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./media-organise.js');

// Every image or PDF under the media folder, as { relativePath, size }, plus
// the top-level subfolders it holds.
function listMediaFiles(mediaDir) {
  const files = [];
  const folders = new Set();
  const walk = (directory, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!prefix) folders.add(entry.name);
        walk(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (!core.isMediaFile(entry.name)) continue;
      let size = 0;
      try { size = fs.statSync(path.join(directory, entry.name)).size; } catch { size = 0; }
      files.push({ relativePath, size });
    }
  };
  walk(mediaDir, '');
  files.folders = [...folders].sort((left, right) => left.localeCompare(right));
  return files;
}

// Inside the media folder only: no absolute paths, no "..", no drive letters.
function safeRelative(value) {
  const relative = String(value || '').replace(/\\/g, '/');
  if (!relative || relative.startsWith('/') || /^[a-z]:/i.test(relative)) return '';
  const segments = relative.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  return segments.join('/');
}

function absolute(mediaDir, relative) {
  const target = path.resolve(mediaDir, relative);
  const root = path.resolve(mediaDir) + path.sep;
  return target.startsWith(root) ? target : '';
}

function uniqueFilePath(directory, fileName) {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = path.join(directory, `${base} (${suffix})${extension}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(directory, `${base} (${Date.now()})${extension}`);
}

// Writes one file where the plan says. The source is removed for a move or an
// archive, and left in place for a copy. Nothing is overwritten unless the plan
// says "replace".
function placeFile(mediaDir, action) {
  const from = absolute(mediaDir, safeRelative(action.fromPath));
  const toRelative = safeRelative(action.toPath);
  if (!from || !toRelative) throw new Error('A file path could not be used.');
  if (!fs.existsSync(from)) throw new Error('The file is no longer in the media folder.');
  let to = absolute(mediaDir, toRelative);
  if (!to) throw new Error('A file path could not be used.');
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (path.resolve(from) === path.resolve(to)) return toRelative;
  if (fs.existsSync(to) && action.kind !== 'replace') to = uniqueFilePath(path.dirname(to), path.basename(to));
  if (action.kind === 'replace') fs.copyFileSync(from, to);
  else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  if (action.kind !== 'copy') fs.unlinkSync(from);
  return path.relative(mediaDir, to).replace(/\\/g, '/');
}

// Works out the plan for this media folder: nothing is changed.
function planFor(mediaDir, request) {
  const files = listMediaFiles(mediaDir);
  const heroPicks = new Map(Object.entries(request.heroPicks && typeof request.heroPicks === 'object' ? request.heroPicks : {}));
  const clean = (people) => (Array.isArray(people) ? people : []).map((person) => ({
    id: person?.id, name: person?.name, birthYear: person?.birthYear, deathYear: person?.deathYear, ownFolder: person?.ownFolder
  }));
  const state = core.computeMediaOrganiseState(
    Array.isArray(request.records) ? request.records : [],
    clean(request.people),
    files,
    { gedcomText: typeof request.gedcomText === 'string' ? request.gedcomText : '', archiveFolder: request.archiveFolder || core.ARCHIVE_FOLDER, heroPicks }
  );
  const unusedFolders = core.findUnusedFolders({ archiveFolder: request.archiveFolder || core.ARCHIVE_FOLDER, folders: files.folders, files });
  return { state, plan: core.planMediaOrganise(state), unusedFolders };
}

// Carries out a plan and returns the GEDCOM with every moved file pointed at its
// new place plus the hero image choices to update.
function applyPlan(mediaDir, state, plan) {
  let gedcomText = state.gedcomText;
  const moves = [];
  const renames = [];
  for (const action of plan.actions) {
    let toPath;
    try {
      toPath = placeFile(mediaDir, action);
    } catch (error) {
      moves.push({ kind: action.kind, fromPath: action.fromPath, toPath: action.toPath, ok: false, error: error.message });
      continue;
    }
    moves.push({ kind: action.kind, fromPath: action.fromPath, toPath, ok: true });
    if (action.kind === 'copy') continue;
    // Every FILE line that named the file points at its new place.
    gedcomText = core.rewriteGedcomFile(gedcomText, action.fromPath, toPath);
    renames.push({ from: action.fromPath, to: toPath });
  }
  const counts = { moved: 0, copied: 0, replaced: 0, archived: 0, failed: 0 };
  for (const move of moves) {
    if (!move.ok) { counts.failed += 1; continue; }
    if (move.kind === 'copy') counts.copied += 1;
    else if (move.kind === 'archive') counts.archived += 1;
    else if (move.kind === 'replace') counts.replaced += 1;
    else counts.moved += 1;
  }
  return { gedcomText, moves, renames, counts };
}

// The SHA-256 of one file, read in chunks so a large PDF does not fill memory.
async function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// The files already known by their size from the plan are hashed directly.
// Only files whose size matches another file are compared at all: an exact
// copy always has the same size.
async function hashGroups(mediaDir, files) {
  const bySize = new Map();
  for (const file of files) {
    if (!bySize.has(file.size)) bySize.set(file.size, []);
    bySize.get(file.size).push(file);
  }
  const hashed = [];
  for (const [, group] of bySize) {
    if (group.length < 2) continue;
    for (const file of group) {
      const full = absolute(mediaDir, safeRelative(file.relativePath));
      try { hashed.push({ ...file, hash: await hashFile(full) }); } catch { hashed.push({ ...file, hash: '', error: 'The file could not be read.' }); }
    }
  }
  return hashed;
}

// Finds exact duplicate images and PDFs in the media folder. The GEDCOM works
// out which files are card images or belong to life events, and a file in such
// a group is never offered. Returns the groups the dialog lists; nothing changes.
async function findDuplicates(mediaDir, request) {
  const files = listMediaFiles(mediaDir);
  const people = Array.isArray(request.people) ? request.people.map((person) => ({
    id: person?.id, name: person?.name, birthYear: person?.birthYear, deathYear: person?.deathYear, ownFolder: person?.ownFolder
  })) : [];
  const records = Array.isArray(request.records) ? request.records : [];
  const state = core.computeMediaOrganiseState(records, people, files, {
    gedcomText: typeof request.gedcomText === 'string' ? request.gedcomText : '',
    archiveFolder: request.archiveFolder || core.ARCHIVE_FOLDER,
    mediaFolderName: typeof request.mediaFolderName === 'string' ? request.mediaFolderName : path.basename(mediaDir),
    heroPicks: new Map(Object.entries(request.heroPicks && typeof request.heroPicks === 'object' ? request.heroPicks : {}))
  });
  const heroKeys = [...state.chosen.keys()];
  const eventKeys = eventMediaPaths(records);
  const hashed = await hashGroups(mediaDir, files);
  const withLinks = hashed.map((file) => ({ ...file, key: core.normalizeMediaPath(file.relativePath), personIds: (state.owners.get(core.normalizeMediaPath(file.relativePath)) || []) }));
  const groups = core.groupDuplicates(withLinks, { heroKeys, eventKeys, archiveFolder: state.archiveFolder });
  const linkPaths = new Map();
  for (const record of records) {
    for (const line of record.lines || []) {
      const match = /^\d+\s+FILE\s+(.+)$/.exec(line.replace(/\r$/, ''));
      if (match && record.xref) {
        const key = core.normalizeMediaPath(match[1].trim());
        if (!linkPaths.has(key)) linkPaths.set(key, []);
        if (!linkPaths.get(key).includes(record.xref)) linkPaths.get(key).push(record.xref);
      }
    }
  }
  const found = groups.map((group) => ({
    hash: group.hash,
    bytes: group.bytes,
    protected: group.protected,
    files: group.files.map((file) => ({
      relativePath: file.relativePath, name: file.name || core.mediaFileName(file.relativePath),
      folder: core.mediaFolderOf(file.relativePath),
      size: file.size, hash: file.hash, keeper: file.relativePath === group.keeper.relativePath,
      owners: [...new Set([...(linkPaths.get(file.key) || []), ...(file.personIds || [])])]
    }))
  }));
  const examined = hashed.length;
  // The folder that was checked, so the dialog can name it.
  return { groups: found, examined, files: files.length, mediaPath: path.resolve(mediaDir), mediaFolder: path.basename(mediaDir) };
}

// The media paths attached to a life event: a FILE line inside a BIRT, DEAT,
// CENS, MARR, DIV or other event block. Card images are excluded before this.
function eventMediaPaths(records) {
  const keys = new Set();
  for (const record of records || []) {
    if (record.tag !== 'INDI' && record.tag !== 'FAM') continue;
    let inEvent = false;
    for (const line of record.lines || []) {
      const match = /^(\d+)\s+(\S+)\s*(.*)$/.exec(line.replace(/\r$/, ''));
      if (!match) continue;
      const lineLevel = Number(match[1]);
      const tag = match[2].toUpperCase();
      if (lineLevel === 1) inEvent = core.EVENT_TAGS.has(tag);
      if (inEvent && tag === 'FILE' && lineLevel >= 2) {
        const eventPath = match[3].trim();
        if (eventPath) keys.add(core.normalizeMediaPath(eventPath));
      }
    }
  }
  return keys;
}

// Removes the chosen duplicate files: delete removes them, archive copies them
// into the archive folder first. Either way their GEDCOM links are dropped, so
// no record points at a file that is gone. Files named in the same group are
// all checked against the kept file before anything changes.
async function applyDuplicates(mediaDir, request) {
  const action = request.mode === 'archive' ? 'archive' : 'delete';
  const keep = String(request.keep || '');
  const remove = Array.isArray(request.files) ? request.files.map(String) : [];
  let gedcomText = typeof request.gedcomText === 'string' ? request.gedcomText : '';
  if (!remove.length) return { gedcomText, removed: [], failed: [] };
  // Every file to remove must be an exact copy of the file being kept.
  const keepPath = absolute(mediaDir, safeRelative(keep));
  if (!keepPath || !fs.existsSync(keepPath)) throw new Error('The file to keep is no longer in the media folder.');
  const keepHash = await hashFile(keepPath);
  const archiveRoot = `${String(request.archiveFolder || core.ARCHIVE_FOLDER).trim() || core.ARCHIVE_FOLDER}/${core.archiveStamp(new Date())}`;
  const removed = [];
  const failed = [];
  for (const file of remove) {
    const relative = safeRelative(file);
    const full = relative ? absolute(mediaDir, relative) : '';
    if (!full || !fs.existsSync(full)) { failed.push({ file, error: 'The file is no longer in the media folder.' }); continue; }
    try {
      if (await hashFile(full) !== keepHash) { failed.push({ file, error: 'The file is not an exact copy of the one kept, so it was left alone.' }); continue; }
      if (action === 'archive') {
        const toRelative = `${archiveRoot}/${core.mediaFileName(relative)}`;
        const to = absolute(mediaDir, toRelative);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const nameTaken = new Set();
        for (const name of fs.readdirSync(path.dirname(to))) nameTaken.add(name.toLocaleLowerCase());
        const target = nameTaken.has(core.mediaFileName(relative).toLocaleLowerCase())
          ? path.join(path.dirname(to), core.uniqueName(core.mediaFileName(relative), nameTaken)) : to;
        fs.copyFileSync(full, target);
        if (!fs.existsSync(target)) throw new Error('The copy could not be written.');
      }
      fs.unlinkSync(full);
      gedcomText = core.removeGedcomFileReferences(gedcomText, relative);
      removed.push({ file: relative, action });
    } catch (error) {
      failed.push({ file, error: error.message || 'The file could not be removed.' });
    }
  }
  return { gedcomText, removed, failed };
}

// Deletes one empty subfolder. The page only asks this for a folder the check
// found nothing in; the delete refuses a folder that still holds files.
function deleteFolder(mediaDir, folder) {
  const relative = safeRelative(folder);
  if (!relative) throw new Error('The folder could not be used.');
  const full = absolute(mediaDir, relative);
  if (!full || !fs.existsSync(full)) throw new Error('The folder is no longer in the media folder.');
  const remaining = fs.readdirSync(full);
  if (remaining.length) throw new Error('The folder is no longer empty, so it was left alone.');
  fs.rmdirSync(full);
  return { removed: 1, failed: 0 };
}

// Points every FILE line that names a media file of the folder at the file's
// place there, however the line spells the path. Used after a plan has run, so
// links written by an earlier install end up pointing at this media folder too.
function repoint(mediaDir, gedcomText, files, request = {}) {
  return core.repointGedcomFiles(gedcomText, files, {
    mediaFolderName: typeof request.mediaFolderName === 'string' ? request.mediaFolderName : path.basename(mediaDir),
    archiveFolder: request.archiveFolder || core.ARCHIVE_FOLDER
  });
}

module.exports = { listMediaFiles, safeRelative, placeFile, planFor, applyPlan, findDuplicates, applyDuplicates, eventMediaPaths, hashFile, deleteFolder, repoint };
