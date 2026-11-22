// Reads the GEDCOM records into what the organiser needs: every FILE line with
// the person or family whose record holds it, the medium a top-level OBJE
// record lists, and the records that hold each file.
function readGedcomMedia(records) {
  const files = [];
  const mediumFiles = new Map();
  const holders = new Map();
  for (const record of records || []) {
    if (record.tag !== 'OBJE' || !record.xref) continue;
    for (const line of record.lines.slice(1)) {
      const match = /^\d+\s+FILE\s+(.+)$/.exec(line);
      if (match) mediumFiles.set(record.xref, match[1].trim());
    }
  }
  for (const record of records || []) {
    const owner = record.tag === 'INDI' || record.tag === 'FAM' ? record.xref : '';
    const stack = [];
    for (const line of record.lines || []) {
      const match = /^(\d+)\s+(.*)$/.exec(line);
      if (!match) continue;
      const level = Number(match[1]);
      const field = /^(\S+)\s*(.*)$/.exec(match[2].trim());
      if (!field) continue;
      const tag = field[1];
      const value = field[2].trim();
      while (stack.length > level) stack.pop();
      stack[level] = { tag, value };
      if (tag !== 'FILE' || !value) continue;
      let medium = '';
      for (let index = level - 1; index >= 0; index -= 1) {
        if (stack[index]?.tag === 'OBJE') { medium = stack[index].value; break; }
      }
      const key = normalizeMediaPath(value);
      files.push({ path: value, key, owner, medium: medium.replace(/^@|@$/g, '') });
      if (key) {
        if (!holders.has(key)) holders.set(key, []);
        holders.get(key).push(record.xref);
      }
    }
  }
  for (const [key, list] of holders) holders.set(key, [...new Set(list)]);
  return { files, mediumFiles, holders };
}

// YYYY-MM-DD stamp for the dated folder files are archived into.
function archiveStamp(date) {
  const when = date instanceof Date ? date : new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

function isArchiveFolder(folder) {
  const name = normalizeMediaPath(folder).split('/')[0];
  return ARCHIVE_FOLDER_ALIASES.includes(name);
}

// A name that is not already used in the destination folder, as "name (2).ext".
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

// Works out where every file in the media folder belongs and what the GEDCOM
// should say once the files are there. Nothing is written here: the actions
// and the rewritten tree are returned for the caller to apply.
//
//  * A file linked to one person moves into that person's folder.
//  * A file linked to several people is moved to the first person's folder and
//    copied into every other person's folder, so no file is shared.
//  * A file that sits in a folder named after a person, but is not linked,
//    moves into that person's folder.
//  * A file used as a person's card image is never archived.
//  * Everything else - unlinked, or outside a person's folder - moves into the
//    archive folder under a dated subfolder.
function computeMediaOrganiseState(records, people, files, options = {}) {
  const read = readGedcomMedia(records);
  const entries = fileMap(files);
  const byId = personLookup(people);
  const softNamed = options.softNamedFolders || new Map();
  const heroPicks = options.heroPicks || new Map();
  const archiveFolder = options.archiveFolder || ARCHIVE_FOLDER;
  const stamp = options.archiveStamp || archiveStamp(options.now);

  const personOrder = new Map();
  const personByFolder = new Map();
  for (const person of people || []) {
    const id = String(person.id).replace(/^@|@$/g, '');
    if (!personOrder.has(id)) personOrder.set(id, personOrder.size);
    const folder = normalizeMediaPath(person.ownFolder || personFolderName(person));
    if (!folder) continue;
    if (!personByFolder.has(folder)) personByFolder.set(folder, []);
    personByFolder.get(folder).push(id);
  }

  // Who each file is linked to. A file can be named in several records; a file
  // held by an OBJE record counts for the people who hold that medium.
  const linked = new Map();
  const holderPeople = new Map();
  for (const [key, list] of read.holders) {
    const ids = new Set();
    for (const xref of list) {
      const id = String(xref).replace(/^@|@$/g, '');
      if (personOrder.has(id)) ids.add(id);
    }
    holderPeople.set(key, ids);
  }
  const mediumsByFile = new Map();
  for (const entry of read.files) {
    if (!entry.key || !entries.has(entry.key)) continue;
    if (!linked.has(entry.key)) linked.set(entry.key, new Set());
    const ids = linked.get(entry.key);
    const owner = String(entry.owner).replace(/^@|@$/g, '');
    if (personOrder.has(owner)) ids.add(owner);
    else for (const id of holderPeople.get(entry.key) || []) ids.add(id);
    if (entry.medium && read.mediumFiles.has(entry.medium)) {
      if (!mediumsByFile.has(entry.key)) mediumsByFile.set(entry.key, new Set());
      mediumsByFile.get(entry.key).add(entry.medium);
    }
  }
  // Several OBJE records that list the same file are one medium, so a file
  // pointed at by any of them is linked wherever any of them is used.
  const usagesByMedium = new Map();
  for (const entry of read.files) {
    if (!entry.medium || !personOrder.has(String(entry.owner).replace(/^@|@$/g, ''))) continue;
    if (!usagesByMedium.has(entry.medium)) usagesByMedium.set(entry.medium, new Set());
    usagesByMedium.get(entry.medium).add(String(entry.owner).replace(/^@|@$/g, ''));
  }
  for (const [key, mediums] of mediumsByFile) {
    for (const medium of mediums) for (const id of usagesByMedium.get(medium) || []) linked.get(key).add(id);
  }
  const owners = new Map();
  for (const [key, ids] of linked) owners.set(key, [...ids].sort((left, right) => personOrder.get(left) - personOrder.get(right)));

  // Card image choices, by normalised file path, for the people whose card uses them.
  const chosen = new Map();
  for (const [personId, pick] of heroPicks) {
    const path = typeof pick === 'string' ? pick : pick?.path;
    const key = normalizeMediaPath(path);
    if (!key || !entries.has(key)) continue;
    if (!chosen.has(key)) chosen.set(key, []);
    if (!chosen.get(key).includes(personId)) chosen.get(key).push(personId);
  }

  const folderOfPerson = (id) => {
    const person = byId.get(String(id).replace(/^@|@$/g, ''));
    return person ? personFolderName(person) : '';
  };
  const inOwnFolder = (key) => {
    const folder = normalizeMediaPath(mediaFolderOf(entries.get(key)?.relativePath || key));
    const personIds = owners.get(key) || [];
    return Boolean(folder) && personIds.length === 1 && personByFolder.get(folder)?.[0] === personIds[0];
  };

  // Where each file would go, before clashes are resolved.
  const wanted = new Map();
  for (const [key, entry] of entries) {
    const personIds = owners.get(key) || [];
    if (personIds.length) {
      wanted.set(key, personIds.map((id) => ({
        key,
        fromPath: entry.relativePath,
        toFolder: folderOfPerson(id),
        fileName: mediaFileName(entry.relativePath),
        owners: [id],
        role: id === personIds[0] ? 'move' : 'copy'
      })));
      // A folder named for a different person is not the right home for this link.
      const currentFolder = normalizeMediaPath(mediaFolderOf(entry.relativePath));
      const owner = personIds[0];
      if (currentFolder && currentFolder !== normalizeMediaPath(folderOfPerson(owner)) && !isArchiveFolder(currentFolder)) {
        wanted.get(key)[0].fromElsewhere = true;
      }
      continue;
    }
    const currentFolder = normalizeMediaPath(mediaFolderOf(entry.relativePath));
    const named = currentFolder && !isArchiveFolder(currentFolder) ? personByFolder.get(currentFolder) : null;
    if (named && named.length === 1 && personOrder.has(named[0])) {
      wanted.set(key, [{
        key,
        fromPath: entry.relativePath,
        toFolder: folderOfPerson(named[0]),
        fileName: mediaFileName(entry.relativePath),
        owners: [named[0]],
        role: 'move',
        namedFolder: true
      }]);
      continue;
    }
    wanted.set(key, [{
      key,
      fromPath: entry.relativePath,
      toFolder: `${archiveFolder}/${stamp}`,
      fileName: mediaFileName(entry.relativePath),
      owners: [],
      role: 'archive'
    }]);
  }

  // A file inside a folder that is nearly the person's name (the app's own
  // spelling of it) is copied to the right folder name instead of being moved
  // into the archive.
  for (const [key, entry] of entries) {
    if (owners.get(key)?.length) continue;
    const target = wanted.get(key)[0];
    if (target.role !== 'archive') continue;
    const folder = normalizeMediaPath(mediaFolderOf(entry.relativePath));
    if (!folder) continue;
    for (const [personFolder, ids] of personByFolder) {
      if (ids.length !== 1 || personFolder !== folder) continue;
      const person = byId.get(ids[0]);
      const desired = normalizeMediaPath(personFolderName(person));
      if (softNamed.get(personFolder) !== ids[0] || desired === personFolder) continue;
      Object.assign(target, { toFolder: personFolderName(person), owners: ids, role: 'move', fromElsewhere: true });
      wanted.set(desired ? key : key, [target]);
      break;
    }
  }

  // A person's card image has to survive: an unlinked one moves to that
  // person's folder, and a file copied for others is never archived.
  for (const [key, personIds] of chosen) {
    const target = wanted.get(key)[0];
    if (!target) continue;
    if (target.role === 'archive') {
      target.toFolder = folderOfPerson(personIds[0]);
      target.owners = [personIds[0]];
      target.role = 'move';
      target.hero = true;
    }
  }

  // Resolve destinations: keep the first claimant, reuse a same-named file the
  // GEDCOM already points at, and number anything else that would clash.
  const taken = new Map();
  for (const key of entries.keys()) {
    const path = `${entries.get(key).folder.replace(/\\/g, '/')}/${entries.get(key).name}`;
    taken.set(normalizeMediaPath(path), key);
  }
  const destinationFor = (target) => {
    const wantedPath = `${target.toFolder}/${target.fileName}`;
    const wantedKey = normalizeMediaPath(wantedPath);
    const occupant = taken.get(wantedKey);
    if (!occupant || occupant === target.key) {
      taken.set(wantedKey, target.key);
      return wantedPath;
    }
    const name = uniqueName(target.fileName, new Set([...taken.keys()].filter((path) => path.startsWith(`${normalizeMediaPath(target.toFolder)}/`)).map((path) => path.slice(normalizeMediaPath(target.toFolder).length + 1))));
    const path = `${target.toFolder}/${name}`;
    taken.set(normalizeMediaPath(path), target.key);
    return path;
  };
  const actions = [];
  const warnings = [];
  for (const [key, entry] of entries) {
    for (const target of wanted.get(key) || []) {
      const toPath = destinationFor(target);
      if (normalizeMediaPath(toPath) === key) continue;
      const existing = taken.get(normalizeMediaPath(toPath));
      const kind = target.role === 'archive' ? 'archive' : target.role === 'copy' ? 'copy' : 'move';
      const action = {
        kind,
        fromPath: entry.relativePath,
        toPath,
        toFolder: target.toFolder,
        key,
        owners: target.owners,
        rewritePaths: target.role === 'copy' ? [] : [key, ...aliasesOf(key, mediumsByFile, read)]
      };
      if (target.hero) action.hero = true;
      if (target.fromElsewhere) action.fromElsewhere = true;
      if (existing && existing !== key && kind !== 'copy') {
        warnings.push({ kind: 'replace', message: `"${toPath}" already exists and will be replaced by "${entry.relativePath}".` });
      }
      actions.push(action);
    }
  }

  // The archive only takes files nothing else keeps.
  const kept = new Set();
  for (const action of actions) {
    if (action.kind === 'archive') { kept.add(`${action.key}|${action.toPath}`); continue; }
    if (action.owners?.some((id) => chosen.has(key0(action)) && chosen.get(key0(action)).includes(id))) continue;
  }
  const heroKeys = new Set([...chosen.keys()]);
  const archivedKeys = new Set(actions.filter((action) => action.kind === 'archive').map((action) => action.key));
  for (const key of heroKeys) {
    if (!archivedKeys.has(key)) continue;
    const action = actions.find((entry) => entry.kind === 'archive' && entry.key === key);
    const personId = chosen.get(key).find((id) => personOrder.has(id));
    if (!personId) continue;
    action.kind = 'move';
    action.toFolder = folderOfPerson(personId);
    action.toPath = `${action.toFolder}/${mediaFileName(action.fromPath)}`;
    action.owners = [personId];
    action.rewritePaths = [key];
    action.hero = true;
    warnings.push({ kind: 'hero', message: `"${action.fromPath}" is an unlinked card image, so it is kept in the person's folder instead of the archive.` });
  }

  for (const entry of read.files) {
    if (!entry.key || entries.has(entry.key)) continue;
    warnings.push({ kind: 'missing', message: `"${entry.path}" is referenced in the GEDCOM but is not in the media folder.` });
  }

  const text = typeof options.gedcomText === 'string'
    ? options.gedcomText
    : (records || []).map((record) => record.lines.join('\n')).join('\n\n');

  const placements = actions.filter((action) => action.kind === 'move');
  const copies = actions.filter((action) => action.kind === 'copy');
  const archives = actions.filter((action) => action.kind === 'archive');
  return {
    people: people || [],
    files: [...entries.values()],
    owners,
    chosen,
    actions,
    placements,
    copies,
    archives,
    warnings,
    unsupported: [...new Set(read.files.filter((entry) => !entries.has(entry.key)).map((entry) => entry.path))],
    archiveFolder,
    stamp,
    gedcomText: text,
    personFolder: folderOfPerson
  };
}

function key0(action) {
  return action.key;
}

// Other FILE paths that name the same medium as `key` (several OBJE records
// pointing at one file), so every one of them is rewritten with it.
function aliasesOf(key, mediumsByFile, read) {
  const mediums = mediumsByFile.get(key);
  if (!mediums?.size) return [];
  const others = [];
  for (const [otherKey, otherMediums] of mediumsByFile) {
    if (otherKey === key) continue;
    for (const medium of otherMediums) if (mediums.has(medium)) { others.push(otherKey); break; }
  }
  return others;
}

