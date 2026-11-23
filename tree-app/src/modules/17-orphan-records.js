// ---------------------------------------------------------------------------
// 17. Orphan records (people with no family links)
// ---------------------------------------------------------------------------

// An orphan record is a person who is not connected to anyone else: no parent
// (including a guardian or adopting parent), no child, no spouse or partner,
// and no sibling. Such a person never appears on another person's card or in a
// relationship view, so the record is very likely one left behind by an
// import. The screen lists them and removes the ones the user picks; deleting
// a record also removes its own life events and life events that were kept on
// a family record only for that person, exactly as deleting one person does.

let orphanRecords = [];
let orphanBusy = false;
const orphanSelected = new Set();

function orphanElements() {
  const dialog = document.querySelector('#orphanRecordsDialog');
  return {
    dialog,
    list: dialog.querySelector('#orphanRecordsList'),
    summary: dialog.querySelector('#orphanRecordsSummary'),
    status: dialog.querySelector('#orphanRecordsStatus'),
    scan: dialog.querySelector('#orphanRecordsScanButton'),
    selectAll: dialog.querySelector('#orphanRecordsSelectAll'),
    deleteButton: dialog.querySelector('#orphanRecordsDeleteButton'),
    selected: dialog.querySelector('#orphanRecordsSelected')
  };
}

// Parents, children, spouses and siblings, each counted once.
function orphanLinksFor(personId) {
  const parents = new Set();
  const children = new Set();
  const spouses = new Set();
  const siblings = new Set();
  // Families this person points at, plus any family that names them, in case
  // the back references (FAMC/FAMS) are missing.
  const familyIds = new Set([
    ...(state.people.get(personId)?.parentFamilyIds || []),
    ...(state.people.get(personId)?.spouseFamilyIds || [])
  ]);
  for (const family of state.families.values()) {
    if ([family.husbandId, family.wifeId].includes(personId) || family.childIds.includes(personId)) familyIds.add(family.id);
  }
  for (const familyId of familyIds) {
    const family = state.families.get(familyId);
    if (!family) continue;
    const isChild = family.childIds.includes(personId);
    const isSpouse = family.husbandId === personId || family.wifeId === personId;
    if (isChild) {
      if (family.husbandId && family.husbandId !== personId) parents.add(family.husbandId);
      if (family.wifeId && family.wifeId !== personId) parents.add(family.wifeId);
      for (const childId of family.childIds) if (childId && childId !== personId) siblings.add(childId);
    }
    if (isSpouse) {
      if (family.husbandId && family.husbandId !== personId) spouses.add(family.husbandId);
      if (family.wifeId && family.wifeId !== personId) spouses.add(family.wifeId);
      for (const childId of family.childIds) if (childId && childId !== personId) children.add(childId);
    }
  }
  return {
    parents: parents.size,
    children: children.size,
    spouses: spouses.size,
    siblings: siblings.size,
    total: parents.size + children.size + spouses.size + siblings.size
  };
}

// Every person whose record names no other person at all.
function findOrphanRecords() {
  if (!state.people.size) throw new Error('Open a GEDCOM first.');
  const orphans = [];
  for (const person of state.people.values()) {
    const links = orphanLinksFor(person.id);
    if (links.total) continue;
    orphans.push({
      id: person.id,
      name: person.name,
      sex: person.sex,
      birth: person.events.find((event) => event.type === 'BIRT')?.date || '',
      death: person.events.find((event) => event.type === 'DEAT')?.date || '',
      place: person.events.find((event) => event.type === 'BIRT')?.place || '',
      events: person.events.length,
      media: person.mediaPaths.length
    });
  }
  orphans.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  return orphans;
}

function syncOrphanSelection() {
  const ui = orphanElements();
  const count = orphanSelected.size;
  ui.selected.textContent = count ? `${count} record${count === 1 ? '' : 's'} selected` : '';
  ui.deleteButton.disabled = orphanBusy || !count;
  ui.selectAll.disabled = orphanBusy || !orphanRecords.length;
  ui.selectAll.checked = orphanRecords.length > 0 && count === orphanRecords.length;
  ui.selectAll.indeterminate = count > 0 && count < orphanRecords.length;
}

function renderOrphanRecords(records) {
  const ui = orphanElements();
  ui.list.replaceChildren();
  if (!records.length) {
    ui.summary.textContent = 'No orphan records found: every person in this tree is linked to someone.';
    return;
  }
  ui.summary.textContent = `${records.length} ${records.length === 1 ? 'person' : 'people'} in this GEDCOM ${records.length === 1 ? 'has' : 'have'} no parent, child, spouse or sibling link.`;
  const section = document.createElement('section');
  section.className = 'duplicate-media-group';
  for (const record of records) {
    const row = document.createElement('label');
    row.className = 'duplicate-media-row orphan-record-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = orphanSelected.has(record.id);
    box.dataset.orphanId = record.id;
    box.addEventListener('change', () => {
      if (box.checked) orphanSelected.add(record.id);
      else orphanSelected.delete(record.id);
      syncOrphanSelection();
    });
    const name = document.createElement('span');
    name.className = 'duplicate-media-name';
    const button = document.createElement('a');
    button.href = '#';
    button.textContent = record.name;
    button.title = `Open ${record.name} in this tab`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      ui.dialog.close();
      setFocus(record.id, true);
    });
    const detail = document.createElement('span');
    detail.className = 'duplicate-media-detail';
    const life = [record.birth && `born ${record.birth}`, record.death && `died ${record.death}`].filter(Boolean).join(', ');
    detail.textContent = ` · @${record.id}@${life ? ` · ${life}` : ''}${record.place ? ` · ${record.place}` : ''} · ${record.events} event${record.events === 1 ? '' : 's'}${record.media ? ` · ${record.media} media` : ''}`;
    name.append(button, detail);
    row.append(box, name);
    section.append(row);
  }
  ui.list.append(section);
}

function setOrphanBusy(on, text = 'Looking for unlinked people…') {
  const ui = orphanElements();
  ui.scan.disabled = Boolean(on);
  ui.dialog.setAttribute('aria-busy', on ? 'true' : 'false');
  ui.list.classList.toggle('is-busy', Boolean(on));
  ui.status.setAttribute('aria-busy', on ? 'true' : 'false');
  if (!on) {
    ui.status.replaceChildren();
    return;
  }
  const spinner = document.createElement('span');
  spinner.className = 'media-scan-spinner media-organise-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  ui.status.replaceChildren(spinner, document.createTextNode(text));
}

function toggleOrphanSelectAll(select) {
  orphanSelected.clear();
  if (select) for (const record of orphanRecords) orphanSelected.add(record.id);
  for (const box of orphanElements().dialog.querySelectorAll('input[data-orphan-id]')) box.checked = select;
  syncOrphanSelection();
}

async function scanOrphanRecords() {
  const ui = orphanElements();
  if (orphanBusy) return;
  orphanBusy = true;
  orphanSelected.clear();
  ui.list.replaceChildren();
  ui.summary.textContent = '';
  setButtonContent(ui.scan, 'scanFace', 'Scanning…');
  setOrphanBusy(true);
  try {
    // Let the spinning wheel paint before the scan runs, so it is seen even
    // though the scan itself is quick and synchronous.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    orphanRecords = findOrphanRecords();
    renderOrphanRecords(orphanRecords);
  } catch (error) {
    orphanRecords = [];
    ui.summary.textContent = error?.message || 'The tree could not be checked for orphan records.';
  } finally {
    orphanBusy = false;
    setOrphanBusy(false);
    setButtonContent(ui.scan, 'scanFace', 'Scan for orphans');
    syncOrphanSelection();
  }
}

async function deleteSelectedOrphanRecords() {
  const ui = orphanElements();
  if (orphanBusy || !orphanSelected.size) return;
  const chosen = orphanRecords.filter((record) => orphanSelected.has(record.id));
  if (!chosen.length) return;
  const remaining = state.people.size - chosen.length;
  if (remaining < 1) {
    ui.status.textContent = 'At least one person must stay in the tree. Clear some ticks and try again.';
    return;
  }
  const labels = chosen.map((record) => record.name).join(', ');
  if (!window.confirm(`Delete ${chosen.length} orphan record${chosen.length === 1 ? '' : 's'}?\n\n${labels}\n\nTheir life events go with them; sources and media files are kept. The GEDCOM is saved afterwards.`)) return;
  orphanBusy = true;
  ui.deleteButton.disabled = true;
  setOrphanBusy(true, `Deleting ${chosen.length} orphan record${chosen.length === 1 ? '' : 's'}…`);
  try {
    let deleted = 0;
    let failed = 0;
    for (const record of chosen) {
      // A person may become linked (or vanish) as earlier records are removed.
      if (!state.people.has(record.id) || orphanLinksFor(record.id).total) { failed += 1; continue; }
      const plan = planPersonDeletion(record.id);
      if (!plan) { failed += 1; continue; }
      deletePersonRecord(plan);
      deleted += 1;
    }
    orphanRecords = findOrphanRecords();
    orphanSelected.clear();
    renderOrphanRecords(orphanRecords);
    ui.status.textContent = `Deleted ${deleted} record${deleted === 1 ? '' : 's'}${failed ? `; ${failed} could not be removed (they are linked after all)` : ''}.`;
    // The tree changed, so write it back through the normal save path.
    if (state.gedcomDirty) await saveGedcomFile({ interactive: true });
  } catch (error) {
    ui.status.textContent = error?.message || 'The orphan records could not be deleted.';
  } finally {
    orphanBusy = false;
    setOrphanBusy(false);
    syncOrphanSelection();
  }
}

function openOrphanRecordsDialog() {
  const ui = orphanElements();
  orphanRecords = [];
  orphanSelected.clear();
  ui.list.replaceChildren();
  ui.status.replaceChildren();
  ui.summary.textContent = 'People in this GEDCOM with no parent, child, spouse or sibling link.';
  if (!state.people.size) ui.summary.textContent = 'Open a GEDCOM first.';
  setButtonContent(ui.scan, 'scanFace', 'Scan for orphans');
  ui.scan.disabled = false;
  syncOrphanSelection();
  showModalFocused(ui.dialog);
}

const orphanMenuButton = document.querySelector('#orphanRecordsMenuButton');
const orphanDialog = document.querySelector('#orphanRecordsDialog');
if (orphanMenuButton) orphanMenuButton.addEventListener('click', openOrphanRecordsDialog);
if (orphanDialog) {
  orphanDialog.querySelector('#closeOrphanRecords').addEventListener('click', () => orphanDialog.close());
  orphanDialog.querySelector('#orphanRecordsScanButton').addEventListener('click', scanOrphanRecords);
  orphanDialog.querySelector('#orphanRecordsDeleteButton').addEventListener('click', deleteSelectedOrphanRecords);
  orphanDialog.querySelector('#orphanRecordsSelectAll').addEventListener('change', (event) => toggleOrphanSelectAll(event.target.checked));
}
})();
