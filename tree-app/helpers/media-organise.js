// Media folder organisation core.
//
// Every person's images and PDFs belong in that person's own subfolder of the
// media folder, named "Ada Allnutt (1864-unknown) [I455]". This file holds the
// folder-free part of that job so the browser app
// (src/modules/15-media-organise.js), server.js and the Windows launcher
// (launcher/KinshipAtlas.cs) plan and apply the same change:
//
//   state = computeMediaOrganiseState(gedcomRecords, people, files, options)
//   plan  = planMediaOrganise(state)
//   text  = rewriteGedcomFile(gedcomText, oldPath, newPath)
//
// Each row of state.actions tells the caller what to do with one file:
//   move     write it to toPath, then delete fromPath
//   copy     write it to toPath, leave fromPath in place
//   replace  write it over the different file already at toPath, delete fromPath
//   archive  an unlinked file: write it to toPath, delete fromPath
//
// Every node is kept at offset 3 (the module's concatenation offset in app.js),
// so this file reads at the same line numbers as src/modules/15-media-organise.js
// and the launcher's C# copy of the organiser in KinshipAtlas.cs.
//
// The browser and server load this file as a classic script defining
// globalThis.KinshipMediaOrganise; tools/media-organise-cli.mjs runs the plan
// from a terminal and tools/qa-media-organise.mjs exercises it.
//
//
//
//
//
//
(function (global) {
  'use strict';

  // The tags that begin a life event block in a person or family record.
  const EVENT_TAGS = new Set([
    'BIRT', 'BAPM', 'CHR', 'DEAT', 'BURI', 'CREM', 'ADOP', 'BARM', 'BASM', 'BLES', 'CHRA', 'CONF', 'FCOM',
    'RESI', 'IMMI', 'EMIG', 'NATU', 'CENS', 'EDUC', 'GRAD', 'OCCU', 'RETI', 'MARR', 'DIV', 'MILT', 'RELI',
    'ORDN', 'PROB', 'WILL', 'SSN', 'EVEN'
  ]);

  const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'pdf'];
  const ARCHIVE_FOLDER = 'Archive';
  const ARCHIVE_FOLDER_ALIASES = ['archive', 'unknown', 'unlinked', 'unsorted', 'orphaned', 'misc', 'miscellaneous', 'duplicates'];

  // "A\b\c\" -> "A/b/c": one spelling for every path, in GEDCOM or on disk.
  function splitMediaPath(value) {
    return String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  }

  // Lower-cased, so a path is matched whatever its case.
  function normalizeMediaPath(value) {
    return splitMediaPath(value).toLocaleLowerCase();
  }

  function mediaFileName(value) {
    const segments = splitMediaPath(value).split('/');
    return segments[segments.length - 1] || '';
  }

  function mediaFolderOf(value) {
    const segments = splitMediaPath(value).split('/');
    return segments.length > 1 ? segments.slice(0, -1).join('/') : '';
  }

  // "@I455@" and "I455" name the same record.
  function mediaId(value) {
    return String(value || '').replace(/^@|@$/g, '');
  }

  // True when a GEDCOM FILE path ends with the file's place in the media folder.
  // Ancestry writes absolute paths, so only the folder and name can be matched.
  function sameMediaPath(key, relativePath) {
    const relative = normalizeMediaPath(relativePath);
    if (!key || !relative) return false;
    return key === relative || key.endsWith(`/${relative}`) || relative.endsWith(`/${key}`);
  }

  // True for an image or PDF, by its extension whatever the case.
  function isMediaFile(name) {
    const base = String(name || '');
    if (!base || base.startsWith('.')) return false;
    const dot = base.lastIndexOf('.');
    return dot > 0 && MEDIA_EXTENSIONS.includes(base.slice(dot + 1).toLocaleLowerCase());
  }

  function personIdOf(person) {
    return mediaId(person?.id);
  }

  // A person's folder name: "Ada Allnutt (1864-unknown) [I455]". The years are
  // the four-digit years of the birth and death events, or "unknown", and the
  // characters Windows does not allow in a name are replaced with "-", as the
  // app's own folder names and SQLite export do.
  function personFolderName(person) {
    const name = String(person?.name || '').trim().replace(/\s+/g, ' ')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'Unknown';
    const birth = String(person?.birthYear || '').match(/\d{4}/)?.[0] || 'unknown';
    const death = String(person?.deathYear || '').match(/\d{4}/)?.[0] || 'unknown';
    const years = ` (${birth}-${death})`;
    const id = personIdOf(person);
    const suffix = id ? ` [${id}]` : '';
    return `${name.slice(0, Math.max(1, 150 - years.length - suffix.length)).replace(/[. ]+$/, '')}${years}${suffix}`;
  }

  // "2000-01-01", naming the folder files are archived into.
  function archiveStamp(date) {
    const when = date instanceof Date ? date : new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  }

  // The media folder files, by lower-cased relative path. Each entry keeps the
  // path split into its folder and file name.
  function fileMap(files) {
    const map = new Map();
    for (const file of files || []) {
      const relativePath = splitMediaPath(file.relativePath);
      const key = relativePath.toLocaleLowerCase();
      if (!key || map.has(key)) continue;
      const folder = mediaFolderOf(relativePath);
      map.set(key, { ...file, relativePath, folder, name: mediaFileName(relativePath) });
    }
    return map;
  }

  // Reads the GEDCOM records into what the organiser needs: every FILE line with
  // the person or family whose record holds it, the medium (OBJE xref) it sits
  // in, and the file each top-level OBJE record lists.
  function readGedcomMedia(records) {
    const files = [];
    const mediumFiles = new Map();
    for (const record of records || []) {
      if (record.tag !== 'OBJE' || !record.xref) continue;
      for (const line of record.lines.slice(1)) {
        const match = /^\d+\s+FILE\s+(.+)$/.exec(line.replace(/\r$/, ''));
        if (match) mediumFiles.set(mediaId(record.xref), match[1].trim());
      }
    }
    for (const record of records || []) {
      const isPerson = record.tag === 'INDI' || record.tag === 'FAM';
      const owner = isPerson ? mediaId(record.xref) : '';
      const stack = [];
      // A record's own header sets the level-0 tag, so a medium record's own
      // FILE line sits inside its OBJE (the header line names it).
      stack[0] = { tag: record.tag, value: '' };
      for (const line of record.lines || []) {
        const match = /^(\d+)\s+(.*)$/.exec(line.replace(/\r$/, ''));
        if (!match) continue;
        const level = Number(match[1]);
        if (level === 0) continue;
        const field = /^(\S+)\s*(.*)$/.exec(match[2].trim());
        if (!field) continue;
        const tag = field[1];
        const value = field[2].trim();
        while (stack.length > level) stack.pop();
        stack[level] = { tag, value };
        if (tag !== 'FILE' || !value) continue;
        let medium = '';
        for (let index = level - 1; index >= 0; index -= 1) {
          if (stack[index]?.tag === 'OBJE') { medium = index === 0 ? mediaId(record.xref) : mediaId(stack[index].value); break; }
        }
        files.push({ path: value, key: normalizeMediaPath(value), owner, medium });
      }
    }
    return { files, mediumFiles };
  }

  // "photo (2).jpg" - a name not already used (lower-cased) in `taken`.
  function uniqueName(fileName, taken) {
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot > 0 ? fileName.slice(dot) : '';
    for (let suffix = 2; suffix < 10000; suffix += 1) {
      const candidate = `${base} (${suffix})${extension}`;
      if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
    }
    return `${base} (${Date.now()})${extension}`;
  }

  // The files to plan, in a settled order: files already in a folder first, then
  // loose files, each sorted by path so the plan is the same every run.
  function sortFiles(entries) {
    const list = [...entries.values()];
    list.sort((left, right) => Number(Boolean(right.folder)) - Number(Boolean(left.folder)) || left.relativePath.localeCompare(right.relativePath));
    return list;
  }

  // A FILE path as it is found in the media folder: a path relative to the media
  // folder, or, for an absolute path, the part after the media folder's name.
  // A GEDCOM written by an earlier install points at its own copy of the tree
  // ("G:\tree-app\Primary Media Library\..."); that earlier media folder's name
  // is replaced by this tree's, so the same media files are found again.
  function mediaRelativeReference(path, mediaFolderName = '') {
    const value = splitMediaPath(path);
    if (!/^([a-z]:[\\/]|\\\\|\/\/|file:)/i.test(String(path || '').trim())) return value;
    const parts = value.split('/').filter(Boolean);
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      if (!/media$/i.test(parts[index])) continue;
      const rest = parts.slice(index + 1);
      // The folder directly named "... Media Library" is the media folder.
      if (index + 2 < parts.length) return rest.join('/');
      // Otherwise the media folder is the next folder down, usually a dated or
      // renamed tree folder whose name only the current app knows.
      if (mediaFolderName && rest.length) {
        return [mediaFolderName, ...rest.slice(1)].join('/');
      }
      return rest.join('/');
    }
    return value;
  }

  // True when a GEDCOM FILE path names an image or PDF, whatever its case.
  function hasMediaExtension(path) {
    return isMediaFile(mediaFileName(path));
  }

  // A FILE line naming something that is not an image or PDF - a document the
  // GEDCOM attaches, or the GEDCOM file itself - is not ours to move.
  function isGedcomFileReference(path) {
    return Boolean(mediaFileName(path)) && !hasMediaExtension(path);
  }

  // Works out where every file in the media folder belongs and what the GEDCOM
  // should say once the files are there. Nothing is written here.
  //
  //  * A file linked to one person moves into that person's folder.
  //  * A file linked to several people is moved into the first person's folder
  //    and copied into each other person's folder, so no file is shared.
  //  * A file in a folder named for a person moves into that person's folder.
  //  * A file used as a person's card image is never archived.
  //  * Every other file moves into "Archive/<date>" - unlinked files, and
  //    duplicates that no person or event points at.
  function computeMediaOrganiseState(records, people, files, options = {}) {
    // The media folder's own name, for GEDCOM paths written by another copy of
    // the tree; without it the paths are read exactly as written.
    const mediaFolderName = String(options.mediaFolderName || '').trim();
    // A GEDCOM's own "1 FILE" line names the tree file, not a media file, so it
    // is dropped from what the organiser considers (it stays in the GEDCOM).
    const rawRead = readGedcomMedia(records);
    const read = { files: rawRead.files.filter((entry) => entry.owner || entry.medium || !isGedcomFileReference(entry.path)), mediumFiles: rawRead.mediumFiles };
    const entries = fileMap(files);
    const archiveFolder = options.archiveFolder || ARCHIVE_FOLDER;
    const stamp = options.archiveStamp || archiveStamp(options.now);
    const softNamed = options.softNamedFolders || new Map();
    const heroPicks = options.heroPicks || new Map();

    const order = new Map();
    const byId = new Map();
    const foldersOf = new Map();
    for (const person of people || []) {
      const id = personIdOf(person);
      if (!id || order.has(id)) continue;
      order.set(id, order.size);
      byId.set(id, person);
      const folder = normalizeMediaPath(personFolderName(person));
      if (!folder) continue;
      if (!foldersOf.has(folder)) foldersOf.set(folder, []);
      foldersOf.get(folder).push(id);
    }
    const folderFor = (id) => {
      const person = byId.get(mediaId(id));
      return person ? personFolderName(person) : '';
    };
    const archiveKey = normalizeMediaPath(archiveFolder);
    const isArchiveFolder = (folder) => {
      const top = normalizeMediaPath(folder).split('/')[0];
      return top === archiveKey || ARCHIVE_FOLDER_ALIASES.includes(top);
    };

    // The media folder file a GEDCOM path names, however the path is spelled.
    // A path that names no file keeps its key (it is about to be created).
    const keyOf = (path) => {
      const key = normalizeMediaPath(path);
      if (entries.has(key)) return key;
      const relative = normalizeMediaPath(mediaRelativeReference(path, mediaFolderName));
      if (relative !== key && entries.has(relative)) return relative;
      // A file keeps its name through every move, so its name finds it even when
      // the GEDCOM's folder is an old or copied one.
      const named = mediaFileName(relative);
      if (named) for (const candidate of entries.keys()) {
        if (sameMediaPath(relative, candidate) || mediaFileName(candidate) === named) return candidate;
      }
      return key;
    };
    const knownKey = (path) => {
      const key = keyOf(path);
      return entries.has(key) ? key : '';
    };

    // The people using each file. A record that names the file (on a FILE line or
    // an OBJE pointer) uses it, and so does every record holding a medium that
    // lists it. One image can be named by several paths (a copied folder, two
    // OBJE records), so the media folder file each path stands for is found by
    // its relative path or its file name.
    const users = new Map();
    const addUser = (key, id) => {
      if (!key || !order.has(id)) return;
      if (!users.has(key)) users.set(key, new Set());
      users.get(key).add(id);
    };
    // The people pointing at each medium, and what each medium record lists.
    const pointed = new Map();
    const mediumsOf = new Map();
    for (const record of records || []) {
      if (record.tag !== 'INDI' && record.tag !== 'FAM') continue;
      const id = mediaId(record.xref);
      for (const line of record.lines || []) {
        const pointer = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(line.replace(/\r$/, ''));
        if (!pointer) continue;
        if (!pointed.has(pointer[1])) pointed.set(pointer[1], new Set());
        pointed.get(pointer[1]).add(id);
      }
    }
    for (const entry of read.files) {
      const file = knownKey(entry.path);
      if (!file || !entry.medium) continue;
      if (!mediumsOf.has(entry.medium)) mediumsOf.set(entry.medium, []);
      if (!mediumsOf.get(entry.medium).includes(file)) mediumsOf.get(entry.medium).push(file);
    }
    for (const entry of read.files) {
      const file = knownKey(entry.path);
      if (!file) continue;
      addUser(file, entry.owner);
      if (!entry.owner && entry.medium) for (const id of pointed.get(entry.medium) || []) addUser(file, id);
    }
    for (const [medium, files] of mediumsOf) {
      for (const id of pointed.get(medium) || []) for (const key of files) addUser(key, id);
    }
    const owners = new Map();
    for (const [key, set] of users) owners.set(key, [...set].sort((left, right) => order.get(left) - order.get(right)));

    // Card image picks, by normalised file path, for the people whose card uses them.
    const chosen = new Map();
    for (const [personId, pick] of heroPicks) {
      const key = knownKey(typeof pick === 'string' ? pick : pick?.path);
      if (!key || !order.has(personId)) continue;
      if (!chosen.has(key)) chosen.set(key, []);
      if (!chosen.get(key).includes(personId)) chosen.get(key).push(personId);
    }

    // Which person each person-looking folder in the media folder belongs to,
    // read from the GEDCOM links and the folder's own name.
    const folderOwners = new Map();
    // The person a folder's own name points at: "... [I12]", or a unique name.
    const linkOwnerFromFolderName = (folder) => {
      const id = /\[([^\]]+)\]\s*$/.exec(folder)?.[1];
      if (id && byId.has(mediaId(id))) return mediaId(id);
      const base = normalizeMediaPath(folder).replace(/\s*\([^)]*\)/, '').trim();
      const matches = [...byId.values()].filter((person) => normalizeMediaPath(person.name).replace(/\s*\([^)]*\)/, '').trim() === base);
      return matches.length === 1 ? personIdOf(matches[0]) : '';
    };
    const folderOwner = (folder) => {
      const name = normalizeMediaPath(folder);
      if (!name) return { personId: '', rename: false };
      if (folderOwners.has(name)) return folderOwners.get(name);
      const owner = { personId: '', rename: false };
      let files = 0;
      let linked = 0;
      const counts = new Map();
      for (const [key, entry] of entries) {
        if (normalizeMediaPath(entry.folder) !== name) continue;
        files += 1;
        if ((owners.get(key) || []).length) linked += 1;
        for (const id of owners.get(key) || []) counts.set(id, (counts.get(id) || 0) + 1);
      }
      if (files) {
        // Most of a folder's linked files being one person's makes it that person's.
        const best = [...counts].sort((left, right) => right[1] - left[1])[0];
        if (best && best[1] * 2 > linked) owner.personId = best[0];
        // A folder the app named after a person but spelled its own way (say the
        // name changed after the folder was made) is copied, not renamed.
        if (!owner.personId) for (const [personFolder, ids] of foldersOf) {
          if (ids.length === 1 && personFolder === name) owner.personId = ids[0];
        }
        if (!owner.personId) {
          const personId = linkOwnerFromFolderName(folder);
          if (personId) {
            owner.personId = personId;
            owner.rename = true;
          }
        }
      }
      folderOwners.set(name, owner);
      return owner;
    };

    const namesIn = (folder) => {
      const names = new Set();
      for (const entry of entries.values()) {
        if (normalizeMediaPath(entry.folder) === normalizeMediaPath(folder)) names.add(entry.name.toLocaleLowerCase());
      }
      return names;
    };

    const actions = [];
    const used = new Set();
    const warnings = [];
    const pathWarnings = new Set();
    for (const entry of sortFiles(entries)) {
      const key = entry.relativePath.toLocaleLowerCase();
      if (isArchiveFolder(entry.folder)) continue;
      if (used.has(key)) continue;
      const personIds = owners.get(key) || [];
      if (personIds.length) {
        // The first person (by GEDCOM order) keeps the file; every other person
        // gets a copy, so no file is shared between folders.
        for (const id of personIds) {
          const folder = folderFor(id);
          const wanted = `${folder}/${entry.name}`;
          let toPath = wanted;
          let kind = id === personIds[0] ? 'move' : 'copy';
          const occupant = entries.get(normalizeMediaPath(wanted));
          if (occupant && kind === 'move') {
            // A same-named file already in the folder is the same image when the
            // GEDCOM's own record of it is linked to the same people. Otherwise
            // the name is taken, so this file gets a numbered name instead of
            // overwriting a photo.
            const sameImage = (owners.get(normalizeMediaPath(wanted)) || []).join(',') === personIds.join(',');
            if (sameImage) continue;
            toPath = `${folder}/${uniqueName(entry.name, namesIn(folder))}`;
          } else if (occupant || used.has(normalizeMediaPath(wanted))) {
            toPath = `${folder}/${uniqueName(entry.name, namesIn(folder))}`;
          }
          const toKey = normalizeMediaPath(toPath);
          if (used.has(toKey)) continue;
          used.add(key);
          used.add(toKey);
          // A file already in this person's current folder stays exactly there.
          if (toKey === key) continue;
          actions.push({ kind, fromPath: entry.relativePath, toPath, toFolder: folder, owners: [id] });
        }
        continue;
      }
      const current = entry.folder;
      const named = current && !isArchiveFolder(current) ? foldersOf.get(normalizeMediaPath(current)) : null;
      let folder = `${archiveFolder}/${stamp}`;
      let kind = 'archive';
      let ownerId = '';
      // A file in a folder of almost any name that belongs to someone is theirs to sort.
      const owner = current && !isArchiveFolder(current) ? folderOwner(current) : null;
      if (owner?.personId) {
        folder = current;
        kind = 'move';
        ownerId = owner.personId;
      } else if (named && named.length === 1) {
        folder = folderFor(named[0]);
        kind = 'move';
        ownerId = named[0];
      } else {
        // A folder the app named after a person, but spelled differently (say the
        // name changed after the folder was made), is copied to the right folder.
        for (const [personFolder, ids] of foldersOf) {
          if (ids.length !== 1 || softNamed.get(personFolder) !== ids[0]) continue;
          if (personFolder !== normalizeMediaPath(current)) continue;
          // A folder whose files were linked stays under its own name; only a
          // folder that lost its links is copied to the name the app would use.
          const owner = folderOwner(current);
          if (owner.personId) continue;
          folder = folderFor(ids[0]);
          kind = 'copy';
          ownerId = ids[0];
        }
        // A card image must survive, so an unlinked one moves to its person's folder.
        if (kind === 'archive' && chosen.has(key)) {
          const personId = chosen.get(key)[0];
          folder = folderFor(personId);
          kind = 'move';
          ownerId = personId;
          warnings.push({ kind: 'hero', message: `"${entry.relativePath}" is an unlinked card image, so it moves to the person's folder instead of the archive.` });
        }
      }
      let toPath = `${folder}/${entry.name}`;
      if (normalizeMediaPath(toPath) === key) continue;
      // A folder that is being renamed gets the person's proper folder name.
      if (owner?.rename) toPath = `${folderFor(owner.personId)}/${entry.name}`;
      if (entries.has(normalizeMediaPath(toPath)) || used.has(normalizeMediaPath(toPath))) toPath = `${folder}/${uniqueName(entry.name, namesIn(folder))}`;
      const toKey = normalizeMediaPath(toPath);
      if (used.has(toKey)) continue;
      used.add(key);
      used.add(toKey);
      actions.push({ kind, fromPath: entry.relativePath, toPath, toFolder: folder, owners: ownerId ? [ownerId] : [] });
    }

    for (const entry of read.files) {
      if (!entry.path || isGedcomFileReference(entry.path)) continue;
      if (knownKey(entry.path)) continue;
      if (pathWarnings.has(normalizeMediaPath(entry.path))) continue;
      pathWarnings.add(normalizeMediaPath(entry.path));
      warnings.push({ kind: 'missing', path: entry.path, message: `"${entry.path}" is named in the GEDCOM but is not in the media folder.` });
    }

    const unsupported = [...new Set(read.files.filter((entry) => entry.path && !isGedcomFileReference(entry.path) && !knownKey(entry.path)
      && /^([a-z]:[\\/]|\\\\|\/\/|file:)/i.test(entry.path)).map((entry) => entry.path))];
    // File names more than one media file shares. A FILE line naming such a
    // name is only rewritten when it spells the exact path, so a move never
    // repoints a line at another person's copy of the same-named file.
    const nameCounts = new Map();
    for (const entry of entries.values()) nameCounts.set(entry.name.toLocaleLowerCase(), (nameCounts.get(entry.name.toLocaleLowerCase()) || 0) + 1);
    const ambiguousNames = new Set([...nameCounts].filter(([, count]) => count > 1).map(([name]) => name));
    const text = typeof options.gedcomText === 'string'
      ? options.gedcomText
      : (records || []).map((record) => record.lines.join('\n')).join('\n\n');

    return {
      people: people || [],
      files: [...entries.values()],
      owners,
      chosen,
      actions,
      warnings,
      unsupported,
      archiveFolder,
      stamp,
      gedcomText: text,
      folders: [...new Set(actions.map((action) => action.toFolder).filter(Boolean))],
      personFolder: folderFor,
      ambiguousNames
    };
  }

  // Removes every FILE line that names the given file, along with a GEDCOM
  // pointer that only existed for it. Keeps line endings and everything else.
  // Returns the text unchanged when nothing pointed at the file.
  function removeGedcomFileReferences(gedcomText, oldPath) {
    const target = normalizeMediaPath(oldPath);
    if (!target) return gedcomText;
    const fileName = mediaFileName(oldPath).toLocaleLowerCase();
    const lines = String(gedcomText || '').split('\n');
    const kept = [];
    let changed = false;
    for (const rawLine of lines) {
      const match = /^(\d+\s+FILE\s+)(.*)$/.exec(rawLine.replace(/\r$/, ''));
      if (match) {
        const value = match[2].trim();
        const quoted = /^".*"$/.test(value);
        const key = normalizeMediaPath(quoted ? value.slice(1, -1) : value);
        if (key === target || key === fileName) { changed = true; continue; }
      }
      kept.push(rawLine);
    }
    return changed ? kept.join('\n') : gedcomText;
  }

  // The plan the dialog shows and the run follows: the same actions, grouped so
  // the user sees what moves, what is copied and what is archived.
  function planMediaOrganise(state) {
    if (!Array.isArray(state.actions)) throw new TypeError('A media-organise plan needs an actions array.');
    const actions = state.actions;
    const placements = actions.filter((action) => action.kind === 'move' || action.kind === 'replace');
    const copies = actions.filter((action) => action.kind === 'copy');
    const archives = actions.filter((action) => action.kind === 'archive');
    const warnings = [...(state.warnings || [])];
    for (const path of state.unsupported || []) {
      warnings.push({ kind: 'unsupported', path, message: `"${path}" is an absolute path outside the media folder; it is left unchanged.` });
    }
    return {
      archiveFolder: state.archiveFolder || ARCHIVE_FOLDER,
      actions,
      placements,
      copies,
      archives,
      warnings,
      counts: {
        moved: placements.filter((action) => action.kind === 'move').length,
        replaced: placements.filter((action) => action.kind === 'replace').length,
        copied: copies.length,
        archived: archives.length
      }
    };
  }

  // Points one FILE path at its new location. A GEDCOM line may use \ or /, may
  // quote the path, and may name only the file without its folder; all of these
  // are matched case-insensitively. When the file's name is unique in the media
  // folder, a line naming that name names this file, whatever folder it spells
  // (an old install's absolute path, a folder since renamed) - otherwise only
  // the exact path matches, so another person's copy is never repointed. Line
  // endings are kept as they are.
  function rewriteGedcomFile(gedcomText, oldPath, newPath, options = {}) {
    const from = normalizeMediaPath(oldPath);
    if (!from) return gedcomText;
    const fileName = mediaFileName(oldPath).toLocaleLowerCase();
    const byName = !(options.ambiguousNames || new Set()).has(fileName);
    const replacement = splitMediaPath(newPath);
    let changed = false;
    const lines = String(gedcomText || '').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const carriageReturn = lines[index].endsWith('\r') ? '\r' : '';
      const match = /^(\d+\s+FILE\s+)(.*)$/.exec(lines[index].replace(/\r$/, ''));
      if (!match) continue;
      const value = match[2].trim();
      const quoted = /^".*"$/.test(value);
      const key = normalizeMediaPath(quoted ? value.slice(1, -1) : value);
      if (key !== from && !(byName && mediaFileName(key) === fileName)) continue;
      lines[index] = `${match[1]}${quoted ? `"${replacement}"` : replacement}${carriageReturn}`;
      changed = true;
    }
    return changed ? lines.join('\n') : gedcomText;
  }

  // Points every FILE line that names a media file of the media folder at the
  // file's place there, however the line spells the path - an old install's
  // absolute path, a folder since renamed, a bare file name. A line is only
  // rewritten when its file is found unambiguously: the exact relative path,
  // the path after the media folder's name, or a file name only one file has.
  // Files in the archive folder are never targets, so a link is never pointed
  // at an archived copy.
  function repointGedcomFiles(gedcomText, files, options = {}) {
    const mediaFolderName = String(options.mediaFolderName || '');
    const archiveFolder = options.archiveFolder || ARCHIVE_FOLDER;
    const entries = fileMap(files);
    const byName = new Map();
    for (const entry of entries.values()) {
      if (isArchiveFolderName(entry.folder, archiveFolder)) continue;
      const name = entry.name.toLocaleLowerCase();
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry.relativePath.toLocaleLowerCase());
    }
    const inArchive = (key) => isArchiveFolderName(entries.get(key)?.folder, archiveFolder);
    const resolve = (path) => {
      const key = normalizeMediaPath(path);
      if (entries.has(key) && !inArchive(key)) return key;
      const relative = normalizeMediaPath(mediaRelativeReference(path, mediaFolderName));
      if (relative !== key && entries.has(relative) && !inArchive(relative)) return relative;
      const named = mediaFileName(key || relative).toLocaleLowerCase();
      const candidates = (byName.get(named) || []).filter((candidate) => !inArchive(candidate));
      return candidates.length === 1 ? candidates[0] : '';
    };
    let changed = false;
    const lines = String(gedcomText || '').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const carriageReturn = lines[index].endsWith('\r') ? '\r' : '';
      const match = /^(\d+\s+FILE\s+)(.*)$/.exec(lines[index].replace(/\r$/, ''));
      if (!match) continue;
      const value = match[2].trim();
      if (!value || isGedcomFileReference(value)) continue;
      const target = resolve(value);
      if (!target || normalizeMediaPath(value) === target) continue;
      const found = entries.get(target);
      if (!found) continue;
      lines[index] = `${match[1]}${found.relativePath}${carriageReturn}`;
      changed = true;
    }
    return changed ? lines.join('\n') : gedcomText;
  }

  // Writes one file into a folder through the File System Access API: a move
  // removes the source afterwards; a copy leaves it in place. A same-named file
  // already in the destination is reused only when it is the same size.
  async function placeMediaFile(source, toDirectory, fileName) {
    const blob = await source.getFile();
    try {
      const existing = await (await toDirectory.getFileHandle(fileName)).getFile();
      if (existing.size === blob.size) return { reused: true };
    } catch (error) {
      if (error?.name !== 'NotFoundError' && error?.name !== 'TypeMismatchError') throw error;
    }
    const handle = await toDirectory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { reused: false };
  }

  // True when a folder is the archive folder or one of its known aliases.
  function isArchiveFolderName(folder, archiveFolder = ARCHIVE_FOLDER) {
    const top = normalizeMediaPath(folder).split('/')[0];
    return Boolean(top) && (top === normalizeMediaPath(archiveFolder).split('/')[0] || ARCHIVE_FOLDER_ALIASES.includes(top));
  }

  // Subfolders of the media folder that hold no files at all, so they can be
  // deleted. `state.folders` lists every subfolder's relative path and
  // `state.files` every media file; a top-level folder is reported when no file
  // sits anywhere inside it. The archive folder and its aliases are never
  // reported, and a folder with any file in it is never reported.
  function findUnusedFolders(state) {
    const tops = new Set();
    for (const folder of state.folders || []) {
      const top = normalizeMediaPath(folder).split('/')[0];
      if (top) tops.add(top);
    }
    const occupied = new Set();
    for (const file of state.files || []) {
      const top = normalizeMediaPath(mediaFolderOf(file.relativePath)).split('/')[0];
      if (top) occupied.add(top);
    }
    const archiveFolder = state.archiveFolder || ARCHIVE_FOLDER;
    const unused = [];
    for (const top of tops) {
      if (occupied.has(top) || isArchiveFolderName(top, archiveFolder)) continue;
      unused.push({ folder: top, files: [] });
    }
    unused.sort((left, right) => left.folder.localeCompare(right.folder));
    return unused;
  }

  // True for a file that may be deleted or archived: an image or PDF, whatever
  // the case of its extension.
  function isDuplicateCandidate(entry) {
    return Boolean(entry) && !entry.err && hasMediaExtension(entry.relativePath || entry.name);
  }

  // Groups files whose contents are identical. One file is kept: a file used as
  // a card image or attached to a life event if the group has one (and then the
  // whole group is left alone), else the first linked file, else the first in
  // path order. The others are the extra copies the user may remove.
  function groupDuplicates(entries, options = {}) {
    const hero = new Set([...(options.heroKeys || [])].map((key) => normalizeMediaPath(key)).filter(Boolean));
    const event = new Set([...(options.eventKeys || [])].map((key) => normalizeMediaPath(key)).filter(Boolean));
    const groups = new Map();
    for (const entry of entries || []) {
      if (!isDuplicateCandidate(entry)) continue;
      const hash = String(entry.hash || '').toLocaleLowerCase();
      if (!hash) continue;
      if (!groups.has(hash)) groups.set(hash, []);
      groups.get(hash).push(entry);
    }
    const duplicates = [];
    for (const [hash, files] of groups) {
      if (files.length < 2) continue;
      const linked = (entry) => Boolean(entry.linked || entry.personIds?.length || entry.owners?.length);
      // An identical file linked to several people is a valid share: a photo
      // with several people in it belongs under each person's folder. Such a
      // group is left alone, so the copies are not offered for removal.
      const personIdsOf = (entry) => entry.personIds || entry.owners || [];
      if (files.length > 1 && files.every((entry) => linked(entry) && personIdsOf(entry).length > 1)) continue;
      // A protected file is never offered: its group keeps every copy.
      const protectedFile = files.find((entry) => hero.has(entry.key) || event.has(entry.key));
      const keeper = protectedFile || files.find((entry) => linked(entry)) || files[0];
      duplicates.push({
        hash,
        keeper,
        files,
        others: files.filter((entry) => entry !== keeper),
        bytes: Number(keeper.size) || 0,
        // True while any copy is a card image or life-event photo.
        protected: Boolean(protectedFile) || files.some((entry) => linked(entry) && (hero.has(entry.key) || event.has(entry.key))),
        linked: files.some((entry) => linked(entry))
      });
    }
    duplicates.sort((left, right) => String(left.keeper.relativePath).localeCompare(String(right.keeper.relativePath)));
    return duplicates;
  }

  const api = {
    MEDIA_EXTENSIONS,
    ARCHIVE_FOLDER,
    ARCHIVE_FOLDER_ALIASES,
    EVENT_TAGS,
    splitMediaPath,
    normalizeMediaPath,
    mediaFileName,
    mediaFolderOf,
    mediaId,
    sameMediaPath,
    isMediaFile,
    personIdOf,
    personFolderName,
    archiveStamp,
    readGedcomMedia,
    uniqueName,
    sortFiles,
    mediaRelativeReference,
    hasMediaExtension,
    isGedcomFileReference,
    computeMediaOrganiseState,
    planMediaOrganise,
    rewriteGedcomFile,
    repointGedcomFiles,
    removeGedcomFileReferences,
    placeMediaFile,
    isDuplicateCandidate,
    groupDuplicates,
    findUnusedFolders,
    isArchiveFolderName
  };

  global.KinshipMediaOrganise = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
