// ---------------------------------------------------------------------------
// 19. Tree Maintenance: the Settings > Tree Maintenance dashboard
// ---------------------------------------------------------------------------
// One workspace for every cleanup, repair and verification tool. The page
// replaces the contents of the main panel (see setTreeMaintenanceMode in
// module 10) and groups the tools into Data Quality, Media Maintenance, Tree
// Repair, Optimisation and Statistics.
//
// Every card is one tool: icon, title, description, its latest result and a
// single action button that opens that tool's dialog. Nothing here edits
// GEDCOM data itself; each dialog owns its own edits and saves.

const treeMaintenanceStats = { orphans: null, duplicates: null, relations: null, countries: null, mediaValidation: null };
// Per-card result line for the media tools, which report folder-level counts.
const treeMaintenanceMediaNotes = { organise: '', duplicates: '' };
const treeMaintenanceActionLabels = new Map();
let treeMaintenanceScanRunning = false;

// The checks stay in the order the workspace presents them. Each one pairs a
// label and wording with the dialog that resolves its findings, so a result row
// can open the tool that fixes what it counted.
const treeMaintenanceScans = {
  orphans: { label: 'Orphan records', result: (n) => `${n.toLocaleString()} orphan record${n === 1 ? '' : 's'}`, run: () => findOrphanRecords().length, open: openOrphanRecordsDialog, action: 'Review records' },
  countries: { label: 'Missing birth countries', result: (n) => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'} missing a country`, run: () => peopleWithoutBirthCountry().length, open: openBirthCountryDialog, action: 'Review people' },
  duplicates: { label: 'Duplicate people', result: (n) => `${n.toLocaleString()} possible duplicate pair${n === 1 ? '' : 's'}`, run: () => findDuplicates(treeMaintenanceDuplicateThreshold()).length, open: openDuplicateFinder, action: 'Review matches' },
  relations: { label: 'Duplicate relationships', result: (n) => `${n.toLocaleString()} duplicated link${n === 1 ? '' : 's'}`, run: () => findDuplicateRelationships().length, open: openDuplicateRelationFinder, action: 'Review links' }
};

// The threshold the duplicate-people dialog opens with; a scan uses the same
// value so the card's count matches what the dialog will list.
const treeMaintenanceDuplicateThreshold = () => Number(document.querySelector('#duplicateThreshold')?.value) || 60;

function treeMaintenanceElements() {
  return {
    view: document.querySelector('#treeMaintenanceView'),
    overviewGrid: document.querySelector('#maintenanceOverviewGrid'),
    overviewStatus: document.querySelector('#maintenanceOverviewStatus'),
    dataQuality: document.querySelector('#maintenanceDataQualityCards'),
    media: document.querySelector('#maintenanceMediaCards'),
    repair: document.querySelector('#maintenanceRepairCards'),
    optimise: document.querySelector('#maintenanceOptimiseCards'),
    statistics: document.querySelector('#maintenanceStatistics'),
    fileName: document.querySelector('#treeMaintenanceFileName')
  };
}

// ---------- Counting (reuses the dialogs' own finders) ----------

// Every distinct media path any person or family event points at. The linked
// folder contributes the files themselves: the folder handle's index when the
// folder is open in this tab, else the files picked through the browser's
// media input (which only records images).
function treeMaintenanceMediaEntries() {
  const entries = new Set();
  // The folder index maps both a bare name and a relative path to the same
  // File, so files themselves are counted, not index keys.
  const files = new Set();
  for (const [key, matches] of state.mediaIndex?.byName || []) {
    if (!matches?.length) { entries.add(key); continue; }
    for (const file of matches) files.add(file);
  }
  for (const file of files) entries.add(state.mediaRelativePaths.get(file) || file.name);
  for (const relativePath of state.folderMediaFiles?.keys() || []) entries.add(relativePath);
  return entries;
}

function treeMaintenanceMediaStatistics() {
  const entries = treeMaintenanceMediaEntries();
  let images = 0;
  for (const relativePath of entries) {
    if (/\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(relativePath)) images += 1;
  }
  return { total: entries.size, images };
}

function treeMaintenanceIsMediaLinked() {
  return Boolean(state.mediaDirectoryHandle || state.rememberedMediaDirectoryHandle || state.mediaFolderPicked
    || (state.folderMediaFiles && state.folderMediaFiles.size) || state.mediaIndex);
}

// Distinct recorded place names (birth, death and every other life event plus
// marriage and divorce places), case-folded so spellings differing only in
// case still count once.
function treeMaintenanceLocationCount() {
  const places = new Set();
  const add = (place) => {
    const clean = (place || '').trim().toLocaleLowerCase();
    if (clean) places.add(clean);
  };
  for (const person of state.people.values()) {
    for (const event of person.events) add(event.place);
  }
  for (const family of state.families.values()) {
    add(family.marriage?.place);
    add(family.divorce?.place);
  }
  return places.size;
}

function treeMaintenanceSnapshot() {
  const media = treeMaintenanceMediaStatistics();
  let attachments = 0;
  for (const person of state.people.values()) attachments += person.mediaPaths.length;
  return {
    people: state.people.size,
    families: state.families.size,
    mediaFiles: media.total,
    images: media.images,
    attachments,
    locations: treeMaintenanceLocationCount(),
    sources: state.sources.size
  };
}

// ---------- Rendering ----------

function treeMaintenanceResultText(key) {
  const value = treeMaintenanceStats[key];
  if (value === null || value === undefined) return 'Not scanned yet.';
  return `Last scan: ${treeMaintenanceScans[key].result(value)}`;
}

// The Media Validation card's result line: one number, or the three kinds.
function treeMaintenanceValidationStatus() {
  const value = treeMaintenanceStats.mediaValidation;
  if (value === null || value === undefined) return 'Not scanned yet.';
  if (!value) return 'Last scan: no problems found';
  return `Last scan: ${value.toLocaleString()} problem${value === 1 ? '' : 's'} found`;
}

// One tool card: icon, title, description, latest result and one action.
// `open` receives the card's action button so it can show progress on it.
function treeMaintenanceCard({ icon, title, description, status = '', open, actionLabel = 'Run scan', enabled = true }) {
  const card = document.createElement('article');
  card.className = 'maintenance-card';
  const head = document.createElement('div');
  head.className = 'maintenance-card-head';
  const badge = document.createElement('span');
  badge.className = 'maintenance-card-icon';
  badge.setAttribute('aria-hidden', 'true');
  badge.append(createButtonIcon(icon));
  const heading = document.createElement('h3');
  heading.className = 'maintenance-card-title';
  heading.textContent = title;
  head.append(badge, heading);
  const body = document.createElement('p');
  body.className = 'maintenance-card-description';
  body.textContent = description;
  const statusLine = document.createElement('p');
  statusLine.className = 'maintenance-card-status';
  statusLine.textContent = status;
  statusLine.dataset.maintenanceStatus = icon;
  card.append(head, body, statusLine);
  if (open) {
    const button = document.createElement('button');
    button.className = 'button button-secondary maintenance-card-action';
    button.type = 'button';
    button.disabled = !enabled;
    setButtonContent(button, 'scanFace', actionLabel);
    treeMaintenanceActionLabels.set(button, actionLabel);
    button.addEventListener('click', () => open(button));
    card.append(button);
  } else {
    const note = document.createElement('span');
    note.className = 'maintenance-card-future';
    note.textContent = 'Coming soon';
    card.append(note);
  }
  return card;
}

// Opens a tool's dialog, shows progress on the card's own button while it is
// open, then refreshes the affected counts once the user closes it. The whole
// workspace is re-rendered on close, so a card's button and result line can
// never keep the progress label or a stale count.
function treeMaintenanceOpenTool(button, open, rescans = []) {
  if (button.disabled) return;
  const label = treeMaintenanceActionLabels.get(button) || 'Run scan';
  const before = new Set([...document.querySelectorAll('dialog')].filter((item) => item.open));
  open();
  const dialog = [...document.querySelectorAll('dialog')].find((item) => item.open && !before.has(item));
  if (!dialog) {
    treeMaintenanceRefresh(rescans);
    return;
  }
  setButtonContent(button, 'scanFace', 'Open…');
  button.disabled = true;
  dialog.addEventListener('close', () => {
    if (state.treeMaintenanceMode) {
      treeMaintenanceRefresh(rescans);
    } else {
      button.disabled = false;
      setButtonContent(button, 'scanFace', label);
    }
  }, { once: true });
}

async function treeMaintenanceRefresh(keys = []) {
  if (!state.people.size) return;
  for (const key of keys) {
    const scan = treeMaintenanceScans[key];
    if (!scan) continue;
    try { treeMaintenanceStats[key] = scan.run(); } catch { treeMaintenanceStats[key] = null; }
  }
  if (state.treeMaintenanceMode) renderTreeMaintenance();
}

function renderTreeMaintenanceOverview(snapshot, hasMedia) {
  const ui = treeMaintenanceElements();
  const unknown = 'Not scanned yet. Run a scan to fill this in.';
  const tiles = [
    { label: 'People', value: snapshot.people, hint: 'People recorded in this tree.' },
    { label: 'Families', value: snapshot.families, hint: 'Family records linking parents, spouses and children.' },
    { label: 'Locations', value: snapshot.locations, hint: 'Distinct places named by life events.' },
    { label: 'Media', value: hasMedia ? snapshot.mediaFiles : null, hint: hasMedia ? 'Files found in the linked media folder.' : 'Link a media folder to count its files.' },
    { label: 'Potential duplicates', value: treeMaintenanceStats.duplicates, hint: treeMaintenanceStats.duplicates === null ? unknown : 'Pairs at or above the duplicate score threshold.' },
    { label: 'Orphan records', value: treeMaintenanceStats.orphans, hint: treeMaintenanceStats.orphans === null ? unknown : 'People with no parent, child, spouse or sibling link.' }
  ];
  ui.overviewGrid.replaceChildren();
  for (const tile of tiles) {
    const wrapper = document.createElement('div');
    wrapper.className = 'maintenance-overview-tile';
    wrapper.title = tile.hint;
    const term = document.createElement('dt');
    term.textContent = tile.label;
    const value = document.createElement('dd');
    const known = tile.value !== null && tile.value !== undefined;
    value.textContent = known ? tile.value.toLocaleString() : '—';
    if (!known) value.classList.add('is-unknown');
    wrapper.append(term, value);
    ui.overviewGrid.append(wrapper);
  }
  const scanned = treeMaintenanceStats.orphans !== null;
  ui.overviewStatus.textContent = treeMaintenanceScanRunning
    ? 'Running checks…'
    : scanned ? `Checked · ${treeMaintenanceStats.orphans.toLocaleString()} orphan${treeMaintenanceStats.orphans === 1 ? '' : 's'} · ${treeMaintenanceStats.duplicates.toLocaleString()} possible duplicate pair${treeMaintenanceStats.duplicates === 1 ? '' : 's'}`
      : 'Checks have not run yet. Use Smart Cleanup to scan everything at once.';
  ui.fileName.textContent = state.fileName || 'No tree loaded';
}

function renderTreeMaintenanceStatistics(snapshot, hasMedia) {
  const ui = treeMaintenanceElements();
  const tiles = [
    { label: 'Total people', value: snapshot.people },
    { label: 'Families', value: snapshot.families },
    { label: 'Media records', value: hasMedia ? snapshot.mediaFiles : null },
    { label: 'Locations', value: snapshot.locations },
    { label: 'Sources', value: snapshot.sources },
    { label: 'Orphans', value: treeMaintenanceStats.orphans },
    { label: 'Possible duplicates', value: treeMaintenanceStats.duplicates }
  ];
  ui.statistics.replaceChildren();
  for (const tile of tiles) {
    const wrapper = document.createElement('div');
    wrapper.className = 'maintenance-statistic';
    const term = document.createElement('dt');
    term.textContent = tile.label;
    const value = document.createElement('dd');
    value.textContent = tile.value === null || tile.value === undefined ? '—' : tile.value.toLocaleString();
    wrapper.append(term, value);
    ui.statistics.append(wrapper);
  }
}

function renderTreeMaintenance() {
  const ui = treeMaintenanceElements();
  if (!ui.view) return;
  const hasTree = state.people.size > 0;
  const mediaLinked = treeMaintenanceIsMediaLinked();
  const snapshot = treeMaintenanceSnapshot();

  renderTreeMaintenanceOverview(snapshot, mediaLinked);

  ui.dataQuality.replaceChildren(
    treeMaintenanceCard({
      icon: 'orphan',
      title: 'Orphan Records',
      description: 'Records not connected to the family tree. Lists people with no parent, child, spouse or sibling link so they can be reviewed or removed.',
      status: treeMaintenanceResultText('orphans'),
      open: (button) => treeMaintenanceOpenTool(button, openOrphanRecordsDialog, ['orphans', 'relations']),
      enabled: hasTree
    }),
    treeMaintenanceCard({
      icon: 'map',
      title: 'Missing Birth Country',
      description: 'People lacking a birth country. Correct the birth location so flags, maps and reports can place each person.',
      status: treeMaintenanceResultText('countries'),
      open: (button) => treeMaintenanceOpenTool(button, openBirthCountryDialog, ['countries']),
      actionLabel: 'Review people',
      enabled: hasTree
    }),
    treeMaintenanceCard({
      icon: 'search',
      title: 'Duplicate People',
      description: 'Finds individuals that may refer to the same person and offers to merge or delete the extra record.',
      status: treeMaintenanceResultText('duplicates'),
      open: (button) => treeMaintenanceOpenTool(button, openDuplicateFinder, ['duplicates']),
      actionLabel: 'Review matches',
      enabled: hasTree
    }),
    treeMaintenanceCard({
      icon: 'duplicateRelation',
      title: 'Duplicate Relationships',
      description: 'Locates duplicate parent-child or spouse links, including redundant back references and twin family records.',
      status: treeMaintenanceResultText('relations'),
      open: (button) => treeMaintenanceOpenTool(button, openDuplicateRelationFinder, ['relations']),
      actionLabel: 'Review links',
      enabled: hasTree
    })
  );

  ui.media.replaceChildren(
    treeMaintenanceCard({
      icon: 'organise',
      title: 'Organise Media Files',
      description: 'Move media into the preferred folder structure, one folder per person, copy files shared by several people and archive files nobody uses.',
      status: !mediaLinked ? 'No media folder linked yet. Choose one under Update Defaults or with Select Media Folder.'
        : treeMaintenanceMediaNotes.organise || `${snapshot.images.toLocaleString()} image${snapshot.images === 1 ? '' : 's'} · ${snapshot.attachments.toLocaleString()} person attachment${snapshot.attachments === 1 ? '' : 's'}`,
      open: (button) => treeMaintenanceOpenTool(button, openMediaOrganiseDialog),
      actionLabel: 'Open organiser',
      enabled: mediaLinked
    }),
    treeMaintenanceCard({
      icon: 'media',
      title: 'Find Duplicate Images',
      description: 'Detect duplicate images: two or more copies of one file inside the same folder, whether a person\'s own folder, the media folder root or the archive folder.',
      status: !mediaLinked ? 'No media folder linked yet.' : treeMaintenanceMediaNotes.duplicates || 'Compares the contents of every image and PDF.',
      open: (button) => treeMaintenanceOpenTool(button, openDuplicateMediaDialog),
      actionLabel: 'Open finder',
      enabled: mediaLinked
    }),
    treeMaintenanceCard({
      icon: 'checkFolder',
      title: 'Media Validation',
      description: 'Check every file path recorded in the GEDCOM and report the ones that are missing, invalid or point at nothing in the media folder.',
      status: treeMaintenanceValidationStatus(),
      open: (button) => treeMaintenanceOpenTool(button, openMediaValidationDialog, ['mediaValidation']),
      actionLabel: 'Scan media',
      enabled: hasTree
    })
  );

  ui.repair.replaceChildren(
    treeMaintenanceCard({
      icon: 'sliders',
      title: 'Update Defaults',
      description: 'Apply current default settings to existing records: choose the GEDCOM file and media folder that open automatically.',
      status: state.defaultRecord ? 'Defaults are set.' : 'No defaults saved yet.',
      open: (button) => treeMaintenanceOpenTool(button, openDefaultsDialog),
      actionLabel: 'Open defaults'
    }),
    treeMaintenanceCard({
      icon: 'media',
      title: 'Media Library',
      description: 'Review every attached image and document, reclassify files in bulk and update profile images.',
      status: `${snapshot.attachments.toLocaleString()} attachment${snapshot.attachments === 1 ? '' : 's'} across ${snapshot.people.toLocaleString()} people.`,
      open: () => { setTreeMaintenanceMode(false); setMediaLibraryMode(true); },
      actionLabel: 'Open library',
      enabled: hasTree || mediaLinked
    })
  );

  ui.optimise.replaceChildren(treeMaintenanceSmartCleanupCard(hasTree));
  renderTreeMaintenanceStatistics(snapshot, mediaLinked);
}

// Smart Cleanup: one button instead of four, running every check and showing a
// summary that can be expanded into the individual results. Each result's count
// is a button that opens the tool which resolves that finding.
const treeMaintenanceSmartState = { summary: '', results: [], open: false };

function treeMaintenanceSmartCleanupCard(hasTree) {
  const card = document.createElement('article');
  card.className = 'maintenance-card maintenance-card-wide';
  const head = document.createElement('div');
  head.className = 'maintenance-card-head';
  const badge = document.createElement('span');
  badge.className = 'maintenance-card-icon';
  badge.setAttribute('aria-hidden', 'true');
  badge.append(createButtonIcon('dna'));
  const heading = document.createElement('h3');
  heading.className = 'maintenance-card-title';
  heading.textContent = 'Smart Cleanup';
  head.append(badge, heading);
  const body = document.createElement('p');
  body.className = 'maintenance-card-description';
  body.textContent = 'Runs every check in one pass: orphan records, duplicate people, duplicate relationships and missing birth countries. Choose a count to open the tool that fixes those findings.';
  const actions = document.createElement('div');
  actions.className = 'maintenance-card-actions';
  const run = document.createElement('button');
  run.className = 'button button-secondary maintenance-smart-run';
  run.type = 'button';
  run.disabled = !hasTree || treeMaintenanceScanRunning;
  setButtonContent(run, 'scanFace', 'Run Scan');
  const summary = document.createElement('p');
  summary.className = 'maintenance-smart-summary';
  summary.setAttribute('role', 'status');
  summary.textContent = treeMaintenanceSmartState.summary
    || (!hasTree ? 'Open a GEDCOM first.' : treeMaintenanceStats.orphans !== null ? treeMaintenanceSmartSummary(hasTree) : 'Choose Run Scan to check everything at once.');
  const results = document.createElement('div');
  results.className = 'maintenance-smart-results';
  results.hidden = !treeMaintenanceSmartState.results.length;
  results.append(...treeMaintenanceSmartState.results);

  run.addEventListener('click', async () => {
    if (!hasTree || treeMaintenanceScanRunning) return;
    treeMaintenanceScanRunning = true;
    run.disabled = true;
    setButtonContent(run, 'scanFace', 'Scanning…');
    summary.textContent = 'Checking the tree…';
    treeMaintenanceSmartState.results = [];
    // Paint the running state before the synchronous scans begin.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    for (const [key, scan] of Object.entries(treeMaintenanceScans)) {
      try { treeMaintenanceStats[key] = scan.run(); } catch { treeMaintenanceStats[key] = null; }
    }
    treeMaintenanceScanRunning = false;
    treeMaintenanceSmartState.summary = treeMaintenanceSmartSummary(hasTree);
    treeMaintenanceSmartState.results = treeMaintenanceSmartRows();
    // Re-render the whole workspace with the new counts and results in place.
    renderTreeMaintenance();
  });

  actions.append(run);
  card.append(head, body, actions, summary, results);
  return card;
}

function treeMaintenanceSmartSummary(hasTree) {
  const rows = Object.entries(treeMaintenanceScans)
    .map(([key, scan]) => ({ key, scan, value: treeMaintenanceStats[key] }))
    .filter((row) => row.value !== null && row.value !== undefined);
  if (!rows.length) return 'Choose Run Scan to check everything at once.';
  if (!hasTree) return 'Open a GEDCOM first.';
  const found = rows.reduce((total, row) => total + row.value, 0);
  return found
    ? `Scan complete: ${found.toLocaleString()} finding${found === 1 ? '' : 's'} to review across ${rows.filter((row) => row.value).length} check${rows.filter((row) => row.value).length === 1 ? '' : 's'}.`
    : 'Scan complete: no problems found.';
}

function treeMaintenanceSmartRows() {
  return Object.entries(treeMaintenanceScans).map(([key, scan]) => {
    const value = treeMaintenanceStats[key];
    const hasFindings = Boolean(value);
    const row = document.createElement('div');
    row.className = `maintenance-smart-result${hasFindings ? ' is-flagged' : ''}`;
    const label = document.createElement('span');
    label.className = 'maintenance-smart-result-label';
    label.textContent = scan.label;
    const count = document.createElement('span');
    count.className = `maintenance-smart-result-count${hasFindings ? ' is-flagged' : ''}`;
    count.textContent = value === null || value === undefined ? 'Not run' : `${value.toLocaleString()} found`;
    const detail = document.createElement('span');
    detail.className = 'maintenance-smart-result-detail';
    detail.textContent = value === null || value === undefined
      ? 'This check could not run on the open tree.'
      : value === 0 ? 'Nothing to fix here.' : `${scan.result(value)} to review.`;
    row.append(label, count, detail);
    // The count opens the tool that fixes what it counted.
    if (hasFindings) {
      const open = document.createElement('button');
      open.className = 'button button-secondary maintenance-smart-result-open';
      open.type = 'button';
      open.dataset.maintenanceOpen = key;
      setButtonContent(open, 'edit', scan.action);
      open.addEventListener('click', () => treeMaintenanceOpenTool(open, scan.open, [key]));
      row.append(open);
    } else {
      const spacer = document.createElement('span');
      row.append(spacer);
    }
    return row;
  });
}

// ---------- Wiring ----------

window.KinshipTreeMaintenance = {
  open: () => {
    setSettingsOpen(false);
    setTreeMaintenanceMode(true);
    if (state.treeMaintenanceMode) renderTreeMaintenance();
  },
  close: () => setTreeMaintenanceMode(false),
  refresh: () => treeMaintenanceRefresh(Object.keys(treeMaintenanceScans)),
  stats: treeMaintenanceStats
};

// Settings > Tree Maintenance is the only place these tools live now: the
// legacy Tree Management submenu was retired once the workspace covered every
// tool it held.
//
// The click is handled once, by delegation from the Settings panel, so a menu
// that is ever rebuilt cannot leave the entry dead, and a second listener can
// never toggle the dashboard twice. window.KinshipTreeMaintenance.open() is the
// same entry point for anything that opens the page another way.
function openTreeMaintenanceFromMenu() {
  setSettingsOpen(false);
  setTreeMaintenanceMode(true);
  if (!state.treeMaintenanceMode) return;
  // Re-render once the menu has closed, so the page is drawn on screen rather
  // than built while its panel is still being shuffled.
  window.requestAnimationFrame(() => {
    if (state.treeMaintenanceMode) renderTreeMaintenance();
  });
}

const treeMaintenanceMenuButton = document.querySelector('#treeMaintenanceMenuButton');
if (treeMaintenanceMenuButton) {
  treeMaintenanceMenuButton.dataset.treeMaintenance = 'entry';
}
const settingsPanelElement = document.querySelector('#settingsPanel');
if (settingsPanelElement) {
  settingsPanelElement.addEventListener('click', (event) => {
    if (!event.target.closest?.('#treeMaintenanceMenuButton')) return;
    // The menu's own close-on-click handler runs on a timeout; opening here
    // first means the order is always "close menu, then show page".
    event.stopPropagation();
    window.setTimeout(openTreeMaintenanceFromMenu, 0);
  });
}
const treeMaintenanceBackButton = document.querySelector('#treeMaintenanceBackButton');
if (treeMaintenanceBackButton) {
  treeMaintenanceBackButton.addEventListener('click', () => setTreeMaintenanceMode(false));
  setButtonContent(treeMaintenanceBackButton, 'tree', 'Back to tree');
}

// Historic City Names List and Select Map Provider sit directly under Settings;
// both drive exactly the state the legacy items use, so switching provider here
// changes every place link in the app.
const gazetteerTopMenuButton = document.querySelector('#gazetteerTopMenuButton');
if (gazetteerTopMenuButton) {
  gazetteerTopMenuButton.addEventListener('click', () => {
    setSettingsOpen(false);
    window.KinshipHistoricalGazetteer?.openDialog?.();
  });
}
if (typeof setPreferredMapProvider === 'function' && typeof preferredMapProvider === 'function') {
  const providerSelect = document.querySelector('#mapProviderTopSelect');
  const syncProvider = () => { if (providerSelect) providerSelect.value = preferredMapProvider(); };
  syncProvider();
  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      setPreferredMapProvider(providerSelect.value);
      syncProvider();
      refreshMapProviderLabels();
      showToast(`Place links now open in ${providerSelect.selectedOptions[0].textContent}.`);
    });
  }
}

// The media tools report their own folder-level results when they close.
const duplicateMediaToolDialog = document.querySelector('#duplicateMediaDialog');
if (duplicateMediaToolDialog) {
  duplicateMediaToolDialog.addEventListener('close', () => {
    const summary = document.querySelector('#duplicateMediaSummary')?.textContent || '';
    if (summary) treeMaintenanceMediaNotes.duplicates = summary;
    if (state.treeMaintenanceMode) renderTreeMaintenance();
  });
}
const mediaOrganiseToolDialog = document.querySelector('#mediaOrganiseDialog');
if (mediaOrganiseToolDialog) {
  mediaOrganiseToolDialog.addEventListener('close', () => {
    const status = document.querySelector('#mediaOrganiseStatus')?.textContent || '';
    if (status) treeMaintenanceMediaNotes.organise = status;
    if (state.treeMaintenanceMode) renderTreeMaintenance();
  });
}
