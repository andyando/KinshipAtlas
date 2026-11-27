// ---------------------------------------------------------------------------
// 20. Media validation (missing files, invalid paths, broken links)
// ---------------------------------------------------------------------------
// Checks every media path recorded in the GEDCOM against the files in the
// linked media folder and sorts the findings into three kinds:
//
//   missing  a path that points at a file the media folder does not contain
//   invalid  a path the app cannot safely link to the folder: empty, a web or
//            network address, or an absolute path outside the media folder
//   broken   a reference that resolves to no file in the folder (a FILE line
//            the app's own media resolver cannot open)
//
// The scan only reads. Nothing here edits the tree, so the same report can be
// produced from the maintenance workspace and from anywhere else that calls
// window.KinshipMediaValidation.scan().

const mediaValidationKinds = {
  missing: { label: 'Missing files', description: 'Recorded in the GEDCOM and a supported attachment type, but not found in the media folder.', icon: 'folder' },
  invalid: { label: 'Invalid paths', description: 'A path the app cannot link to a file in the media folder.', icon: 'info' },
  unsupported: { label: 'Unsupported types', description: 'A file type Kinship Atlas does not handle yet. These are listed for reference and are never counted as missing files.', icon: 'document' },
  broken: { label: 'Unchecked links', description: 'No media folder is linked, so nothing can confirm these files exist.', icon: 'duplicateRelation' }
};

let mediaValidationFindings = [];
let mediaValidationBusy = false;
let mediaValidationSummaryText = '';

function mediaValidationElements() {
  const dialog = document.querySelector('#mediaValidationDialog');
  return {
    dialog,
    summary: dialog.querySelector('#mediaValidationSummary'),
    summaryBox: dialog.querySelector('#mediaValidationSummaryBox'),
    search: dialog.querySelector('#mediaValidationSearch'),
    list: dialog.querySelector('#mediaValidationList'),
    status: dialog.querySelector('#mediaValidationStatus'),
    count: dialog.querySelector('#mediaValidationCount'),
    scan: dialog.querySelector('#mediaValidationScanButton')
  };
}

// True for a path that cannot be a file in the media folder, with the reason.
// A web address is recognised by its scheme. A rooted path ("C:\...",
// "\\server\share", "/home/...") still works when its last part names a file
// the media folder holds, which is what repointGedcomFiles and
// resolveMediaFile do; only a rooted path that names nothing in the folder is
// invalid.
function mediaValidationPathProblem(path, knownNames) {
  const raw = String(path || '').trim().replace(/^"(.*)"$/, '$1').trim();
  if (!raw) return 'The path is empty, so no file can be opened.';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^www\./i.test(raw)) return 'The path is a web address, not a file in the media folder.';
  const windowsRooted = /^[a-z]:[\\/]/i.test(raw);
  const uncRooted = /^\\\\[^\\]+\\/.test(raw);
  const posixRooted = /^\/(?!\/)/.test(raw) && !/^\/media\//i.test(raw);
  if (!windowsRooted && !uncRooted && !posixRooted) return '';
  const segments = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  if (!fileName) return 'The path names a folder, not a file.';
  if (knownNames.has(fileName.toLocaleLowerCase())) return '';
  return 'The path points outside the media folder and no file with that name is in it.';
}

// The last path segment, used as a finding's file name. A recorded path may be
// quoted or use backslashes, so it is split the same way the resolver does.
function mediaValidationFileName(path) {
  const segments = String(path || '').trim().replace(/^"|"$/g, '').replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] || '';
}

// Every file name the media folder holds, lower-cased: the folder handle's
// index when the folder is open in this tab, otherwise the helper's listing.
function mediaValidationKnownNames() {
  const names = new Set();
  for (const [name, files] of state.mediaIndex?.byName || []) {
    if (files?.length) names.add(String(name).toLocaleLowerCase());
  }
  for (const relativePath of state.folderMediaFiles?.keys() || []) {
    const name = relativePath.split('/').at(-1);
    if (name) names.add(name.toLocaleLowerCase());
  }
  return names;
}

// Every media path the tree references: person attachments, life event media
// on people and families, and paths held by "0 @X@ OBJE" records that a
// pointer refers to. Each finding names the person (or family) it affects and
// the life event it sits in, so it can be opened.
function mediaValidationReferences() {
  const references = [];
  // The same path is often reached twice: once as a person's attachment and
  // once as the FILE line inside their life event. The event is the more useful
  // label, so it replaces the plain attachment rather than doubling the row.
  const byKey = new Map();
  const push = (path, owner, recordId, event) => {
    if (!path) return;
    const key = `${recordId}\u0000${normalizeMediaPath(path)}`;
    const existing = byKey.get(key);
    if (existing && !(event && !existing.event)) return;
    byKey.set(key, { path, recordId, owner, event: event || '' });
  };
  for (const person of state.people.values()) {
    for (const path of mediaPathsForPerson(person.id)) push(path, person.name, person.id, '');
  }
  // FILE lines inside a life event, which mediaPathsForPerson may not carry
  // (a census scan, a wedding photo) and which name their event.
  for (const record of state.gedcomRecords) {
    if (record.tag !== 'INDI' && record.tag !== 'FAM') continue;
    const person = record.tag === 'INDI' ? state.people.get(record.xref) : null;
    const family = record.tag === 'FAM' ? state.families.get(record.xref) : null;
    const owner = person ? person.name : family ? `Family ${[family.husbandId, family.wifeId].filter(Boolean).map((id) => state.people.get(id)?.name || `@${id}@`).join(' & ') || `@${record.xref}@`}` : `@${record.xref}@`;
    const recordId = record.tag === 'INDI' ? record.xref : family?.husbandId || family?.wifeId || '';
    let event = '';
    for (const line of record.lines || []) {
      const field = parseGedcomField(line);
      if (!field) continue;
      if (field.level === 1) event = eventTags.has(field.tag) ? field.tag : '';
      if (field.tag !== 'FILE' || !field.value.trim()) continue;
      push(field.value.trim(), owner, recordId, event);
    }
  }
  // A top-level OBJE record holds the FILE paths its pointers stand for.
  const objectFiles = mediaRecordFiles(state.gedcomRecords);
  if (objectFiles.size) {
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'INDI') continue;
      const person = state.people.get(record.xref);
      if (!person) continue;
      for (const line of record.lines || []) {
        const field = parseGedcomField(line);
        if (field?.tag !== 'OBJE') continue;
        const pointer = splitXref(field.value);
        if (!pointer) continue;
        for (const path of objectFiles.get(pointer) || []) push(path, person.name, person.id, '');
      }
    }
  }
  return [...byKey.values()];
}

// The scan itself: read-only, and usable without the dialog. A recorded path is
// judged once, in this order:
//   invalid  the path itself cannot be a file in the media folder
//   missing  the path is usable but the linked folder holds no such file
//   broken   no media folder is linked, so nothing can confirm the file exists;
//            the path is reported as a link that cannot be checked
function scanMediaValidation() {
  if (!state.people.size) throw new Error('Open a GEDCOM first.');
  const linked = treeMaintenanceIsMediaLinked();
  const knownNames = mediaValidationKnownNames();
  const byPath = new Map();
  for (const reference of mediaValidationReferences()) {
    const key = normalizeMediaPath(reference.path);
    const mapKey = key || `\u0000empty:${reference.recordId}:${reference.event}`;
    if (!byPath.has(mapKey)) byPath.set(mapKey, { reference, references: [] });
    byPath.get(mapKey).references.push(reference);
  }
  const findings = [];
  for (const entry of byPath.values()) {
    const path = entry.reference.path;
    const problem = mediaValidationPathProblem(path, knownNames);
    let kind = '';
    let detail = '';
    if (problem) { kind = 'invalid'; detail = problem; }
    else if (resolveMediaFile(path)) { continue; }
    // An unsupported type is never a missing file: the app simply does not
    // handle it, so it is reported separately and only for reference.
    else if (!isSupportedAttachment(path)) { kind = 'unsupported'; detail = 'This file type is not supported yet, so it is not counted as missing.'; }
    else if (linked) { kind = 'missing'; detail = 'The media folder has no file at this path.'; }
    else { kind = 'broken'; detail = 'No media folder is linked, so this reference cannot be checked.'; }
    // One row per reference, so every person affected is named.
    for (const reference of entry.references) {
      findings.push({
        kind,
        detail,
        reference,
        path: reference.path,
        fileName: mediaValidationFileName(reference.path) || reference.path,
        typeLabel: attachmentKindLabel(reference.path),
        owner: reference.owner,
        event: reference.event
      });
    }
  }
  findings.sort((left, right) => (left.fileName + left.path).localeCompare(right.fileName + right.path));
  const counts = { missing: 0, invalid: 0, unsupported: 0, broken: 0 };
  for (const finding of findings) counts[finding.kind] += 1;
  return {
    linked,
    findings,
    counts: {
      ...counts,
      records: new Set(findings.map((finding) => finding.reference.recordId)).size,
      distinctPaths: byPath.size,
      total: findings.length
    }
  };
}

function renderMediaValidation() {
  const ui = mediaValidationElements();
  const filter = normalizeDirectoryName(ui.search.value.trim());
  const counts = { missing: 0, invalid: 0, unsupported: 0, broken: 0 };
  for (const finding of mediaValidationFindings) counts[finding.kind] += 1;
  const findings = filter
    ? mediaValidationFindings.filter((finding) => normalizeDirectoryName(`${finding.path} ${finding.owner}`).includes(filter))
    : mediaValidationFindings;
  ui.summaryBox.hidden = false;
  ui.summaryBox.replaceChildren();
  for (const [kind, meta] of Object.entries(mediaValidationKinds)) {
    const tile = document.createElement('div');
    tile.className = `media-validation-tile${counts[kind] ? ' is-flagged' : ''}`;
    const label = document.createElement('span');
    label.className = 'media-validation-tile-label';
    label.textContent = meta.label;
    const value = document.createElement('strong');
    value.className = 'media-validation-tile-value';
    value.textContent = counts[kind].toLocaleString();
    tile.append(label, value);
    tile.title = meta.description;
    ui.summaryBox.append(tile);
  }
  ui.count.textContent = mediaValidationFindings.length
    ? `${findings.length.toLocaleString()} of ${mediaValidationFindings.length.toLocaleString()} shown`
    : '';
  ui.list.replaceChildren();
  if (!mediaValidationFindings.length) {
    const empty = document.createElement('div');
    empty.className = 'duplicate-finder-empty';
    empty.textContent = 'No problems found: every recorded media path points at a file in the media folder.';
    ui.list.append(empty);
    return;
  }
  if (!findings.length) {
    const empty = document.createElement('div');
    empty.className = 'duplicate-finder-empty';
    empty.textContent = 'No finding matches this filter.';
    ui.list.append(empty);
    return;
  }
  for (const kind of Object.keys(mediaValidationKinds)) {
    const group = findings.filter((finding) => finding.kind === kind);
    if (!group.length) continue;
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    heading.className = 'media-validation-heading';
    heading.textContent = `${mediaValidationKinds[kind].label} · ${group.length}`;
    section.append(heading);
    for (const finding of group) section.append(mediaValidationRow(finding));
    ui.list.append(section);
  }
}

function mediaValidationRow(finding) {
  const row = document.createElement('div');
  row.className = 'media-validation-row';
  const file = document.createElement('span');
  file.className = 'media-validation-file';
  file.textContent = finding.fileName;
  file.title = finding.path;
  const where = document.createElement('span');
  where.className = 'media-validation-where';
  const event = finding.event ? eventNames[finding.event] || finding.event : '';
  where.textContent = `${finding.owner}${event ? ` · ${event}` : ''}`;
  const path = document.createElement('code');
  path.className = 'media-validation-path';
  path.textContent = finding.path || '(empty path)';
  const detail = document.createElement('span');
  detail.className = 'media-validation-detail';
  detail.textContent = `${finding.typeLabel} · ${finding.detail}`;
  const open = document.createElement('button');
  open.className = 'dialog-button dialog-button-quiet media-validation-open';
  open.type = 'button';
  open.textContent = 'Open person';
  open.disabled = !state.people.has(finding.reference.recordId);
  open.addEventListener('click', () => {
    const id = finding.reference.recordId;
    mediaValidationElements().dialog.close();
    setTreeMaintenanceMode(false);
    setFocus(id, true);
  });
  row.append(file, where, path, detail, open);
  return row;
}

function setMediaValidationBusy(on, text = 'Checking media paths…') {
  const ui = mediaValidationElements();
  ui.scan.disabled = Boolean(on);
  ui.dialog.setAttribute('aria-busy', on ? 'true' : 'false');
  ui.list.classList.toggle('is-busy', Boolean(on));
  if (!on) {
    ui.status.replaceChildren();
    return;
  }
  const spinner = document.createElement('span');
  spinner.className = 'media-scan-spinner media-organise-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  ui.status.replaceChildren(spinner, document.createTextNode(text));
}

async function runMediaValidation() {
  const ui = mediaValidationElements();
  if (mediaValidationBusy) return;
  mediaValidationBusy = true;
  setButtonContent(ui.scan, 'scanFace', 'Scanning…');
  setMediaValidationBusy(true);
  try {
    // Let the spinner paint before the synchronous scan runs.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = scanMediaValidation();
    mediaValidationFindings = result.findings;
    const total = result.counts.total;
    ui.summary.textContent = !result.linked
    const parts = [
      result.counts.missing ? `${result.counts.missing.toLocaleString()} missing file${result.counts.missing === 1 ? '' : 's'}` : '',
      result.counts.invalid ? `${result.counts.invalid.toLocaleString()} invalid path${result.counts.invalid === 1 ? '' : 's'}` : '',
      result.counts.broken ? `${result.counts.broken.toLocaleString()} unchecked link${result.counts.broken === 1 ? '' : 's'}` : '',
      result.counts.unsupported ? `${result.counts.unsupported.toLocaleString()} unsupported type${result.counts.unsupported === 1 ? '' : 's'} (not counted as missing)` : ''
    ].filter(Boolean);
    ui.summary.textContent = !result.linked
      ? 'No media folder is linked, so the recorded paths are only checked for validity. Link a media folder to find missing files.'
      : parts.length
        ? `${total.toLocaleString()} finding${total === 1 ? '' : 's'}: ${parts.join(', ')}.`
        : 'No problems found: every recorded path is a supported type and every file is in the media folder.';
    ui.status.textContent = result.linked
      ? `Checked against ${treeMaintenanceMediaEntries().size.toLocaleString()} file${treeMaintenanceMediaEntries().size === 1 ? '' : 's'} in the media folder.`
      : '';
    mediaValidationSummaryText = ui.status.textContent;
    renderMediaValidation();
    // Only real problems feed the workspace card: an unsupported type is not
    // something the user can fix here.
    treeMaintenanceStats.mediaValidation = result.counts.missing + result.counts.invalid + result.counts.broken;
  } catch (error) {
    mediaValidationFindings = [];
    ui.summary.textContent = error?.message || 'The media paths could not be checked.';
    ui.list.replaceChildren();
    ui.summaryBox.hidden = true;
    treeMaintenanceStats.mediaValidation = null;
  } finally {
    mediaValidationBusy = false;
    setMediaValidationBusy(false);
    // The busy state clears the status line, so the checked-file count is put
    // back afterwards.
    if (mediaValidationSummaryText) ui.status.textContent = mediaValidationSummaryText;
    setButtonContent(ui.scan, 'scanFace', 'Scan media');
    if (state.treeMaintenanceMode) renderTreeMaintenance();
  }
}

function openMediaValidationDialog() {
  const ui = mediaValidationElements();
  if (!ui.dialog) return;
  mediaValidationFindings = [];
  mediaValidationSummaryText = '';
  ui.search.value = '';
  ui.list.replaceChildren();
  ui.summaryBox.hidden = true;
  ui.summaryBox.replaceChildren();
  ui.count.textContent = '';
  ui.status.replaceChildren();
  ui.summary.textContent = 'Checks every media path recorded in the GEDCOM against the files in the linked media folder.';
  if (!state.people.size) ui.summary.textContent = 'Open a GEDCOM first.';
  setButtonContent(ui.scan, 'scanFace', 'Scan media');
  ui.scan.disabled = false;
  showModalFocused(ui.dialog);
}

window.KinshipMediaValidation = {
  scan: scanMediaValidation,
  open: openMediaValidationDialog,
  findings: () => mediaValidationFindings
};

const mediaValidationDialog = document.querySelector('#mediaValidationDialog');
if (mediaValidationDialog) {
  mediaValidationDialog.querySelector('#closeMediaValidation').addEventListener('click', () => mediaValidationDialog.close());
  mediaValidationDialog.querySelector('#mediaValidationScanButton').addEventListener('click', runMediaValidation);
  mediaValidationDialog.querySelector('#mediaValidationSearch').addEventListener('input', renderMediaValidation);
}
