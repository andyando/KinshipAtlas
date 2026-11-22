  // ---------------------------------------------------------------------------
  // 15. Media folder organisation (person folders, archive, GEDCOM rewrite)
  // ---------------------------------------------------------------------------

  // Every person's images and PDFs belong in that person's own subfolder of the
  // media folder, named "Ada Allnutt (1864-unknown) [I455]". This section checks a
  // media folder against the open GEDCOM and carries out what is needed:
  //   * linked files move into their person's folder (creating it when missing),
  //   * a file linked to several people is copied into each person's folder,
  //   * a card image keeps its link and follows its file,
  //   * files no person or event uses go to "Archive/<date>",
  //   * every FILE line in the GEDCOM is pointed at the file's new place.
  // The rules themselves live in helpers/media-organise.js, which server.js and
  // the Windows launcher use too, so the plan is the same wherever it runs.

  function mediaOrganiseHelpers() {
    if (!globalThis.KinshipMediaOrganise) {
      throw new Error('The media folder helper did not load. Reload the page and try again.');
    }
    return globalThis.KinshipMediaOrganise;
  }

  // Names and years for the plan, in the shape the shared core reads.
  function mediaOrganisePersonDetails() {
    return [...state.people.values()].map((person) => ({
      id: person.id,
      name: person.name || person.id,
      birthYear: person.events.find((event) => event.type === 'BIRT')?.date?.match(/\d{4}/)?.[0] || '',
      deathYear: person.events.find((event) => event.type === 'DEAT')?.date?.match(/\d{4}/)?.[0] || ''
    }));
  }

  // Person folders the app itself creates, so a rename or a change of name does
  // not make the organisation treat the app's own files as unlinked.
  function mediaOrganiseSoftNamedFolders() {
    const folders = new Map();
    for (const personId of state.people.keys()) folders.set(mediaPersonFolderName(personId).toLocaleLowerCase(), personId);
    return folders;
  }

  // Hero image choices saved for this tree, by person id. Hero frames are stored
  // per person and file, so a person whose hero is only recorded as a frame is
  // found too.
  function savedHeroPicks() {
    const picks = new Map();
    const key = state.primaryMediaKey;
    if (key) {
      for (const [personId, path] of Object.entries(readSelection(key) || {})) {
        if (typeof path === 'string' && path) picks.set(personId, path);
      }
    }
    const framePrefix = 'kinship-atlas:hero-frame:';
    const frameKeys = helperSelections ? Object.keys(helperSelections) : (() => {
      const keys = [];
      try { for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index)); } catch { }
      return keys;
    })();
    for (const storageKey of frameKeys) {
      if (!storageKey?.startsWith(framePrefix)) continue;
      const personId = storageKey.slice(framePrefix.length).split('|')[0];
      if (!state.people.has(personId) || picks.has(personId)) continue;
      const fileName = readSelection(storageKey)?.file?.name;
      if (typeof fileName === 'string' && fileName) picks.set(personId, fileName);
    }
    for (const [personId, path] of state.primaryMedia) if (!picks.has(personId)) picks.set(personId, path);
    return picks;
  }

  // True when this tab has the media folder itself open for writing, so the
  // files can be read and written here without the local helper.
  function mediaOrganiseUsesFolder() {
    return Boolean(state.mediaDirectoryHandle);
  }

  function mediaOrganiseRequest() {
    const request = {
      people: mediaOrganisePersonDetails(),
      gedcomText: state.gedcomText || serializeGedcomRecords(state.gedcomRecords),
      archiveFolder: mediaOrganiseElements().archive.value.trim() || 'Archive',
      // GEDCOM paths from another copy of the tree are read against this folder.
      mediaFolderName: mediaFolderNameForTree(),
      heroPicks: Object.fromEntries(savedHeroPicks())
    };
    // Kinship Atlas.exe reads the tree from its own GEDCOM, so its requests stay
    // small; other helpers are sent the records as well.
    if (!state.mediaHelper?.readsPrimaryGedcom) request.records = state.gedcomRecords;
    return request;
  }

  // The media folder's name for this tree: the folder open in the tab, or the
  // one the local helper serves.
  function mediaFolderNameForTree() {
    return state.mediaDirectoryHandle?.name || state.mediaHelper?.mediaFolder || state.mediaHelper?.folder || '';
  }

  async function scanMediaOrganiseWithFolder() {
    const core = mediaOrganiseHelpers();
    const directoryHandle = state.mediaDirectoryHandle;
    const files = [];
    const walk = async (directory, prefix) => {
      for await (const [name, entry] of directory.entries()) {
        const relativePath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'directory') { await walk(entry, relativePath); continue; }
        if (!core.isMediaFile(name)) continue;
        let size = 0;
        try { size = (await entry.getFile()).size; } catch { size = 0; }
        files.push({ relativePath, size });
      }
    };
    await walk(directoryHandle, '');
    const request = mediaOrganiseRequest();
    const organised = core.computeMediaOrganiseState(request.records, request.people, files, {
      gedcomText: request.gedcomText,
      archiveFolder: request.archiveFolder,
      mediaFolderName: request.mediaFolderName,
      heroPicks: new Map(Object.entries(request.heroPicks)),
      softNamedFolders: mediaOrganiseSoftNamedFolders()
    });
    return { organised, plan: core.planMediaOrganise(organised) };
  }

  async function scanMediaOrganiseWithHelper() {
    const response = await fetch('/api/media-organise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mediaOrganiseRequest())
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The local helper could not read the media folder.');
    return body;
  }

  // Moves every file in the plan with the footer picker, one folder at a time.
  // The GEDCOM text is rewritten as it goes; what was written is reported back.
  async function applyMediaOrganiseWithFolder(plan) {
    const core = mediaOrganiseHelpers();
    const directoryHandle = state.mediaDirectoryHandle;
    const summary = { moved: 0, copied: 0, replaced: 0, archived: 0, failed: 0, missing: 0 };
    const renames = [];
    let gedcomText = state.gedcomText || serializeGedcomRecords(state.gedcomRecords);
    for (const action of plan.actions) {
      const segments = action.toPath.split('/');
      try {
        let fromDirectory = directoryHandle;
        for (const segment of action.fromPath.split('/').slice(0, -1)) fromDirectory = await fromDirectory.getDirectoryHandle(segment);
        const fromSegments = action.fromPath.split('/');
        const fromName = fromSegments.pop();
        let fromParent = directoryHandle;
        for (const segment of fromSegments) fromParent = await fromParent.getDirectoryHandle(segment);
        let toDirectory = directoryHandle;
        for (const segment of segments.slice(0, -1)) toDirectory = await toDirectory.getDirectoryHandle(segment, { create: true });
        const source = await fromParent.getFileHandle(fromName);
        await core.placeMediaFile(source, toDirectory, segments.at(-1));
        // A move or archive takes the file away; a copy leaves it in place.
        if (action.kind !== 'copy') await fromParent.removeEntry(fromName);
        gedcomText = core.rewriteGedcomFile(gedcomText, action.fromPath, action.toPath);
        renames.push({ from: action.fromPath, to: action.toPath });
        summary[action.kind] += 1;
      } catch (error) {
        if (error?.name === 'NotFoundError') summary.missing += 1;
        else summary.failed += 1;
      }
    }
    return { gedcomText, renames, summary };
  }

  function splitName(relativePath) {
    return String(relativePath || '').split('/').at(-1) || '';
  }

  async function applyMediaOrganiseWithHelper() {
    const response = await fetch('/api/media-organise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mediaOrganiseRequest(), apply: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The local helper could not organise the media folder.');
    return body;
  }

  // The dialog: "Check media folder" lists the plan, "Organise media files"
  // carries it out.
  let mediaOrganisePlanState = null;
  let mediaOrganiseBusy = false;

  // The dialog element, asked for once the module runs.
  const mediaOrganiseDialogElement = () => document.querySelector('#mediaOrganiseDialog');

  function mediaOrganiseElements() {
    const dialog = mediaOrganiseDialogElement();
    return {
      dialog,
      check: dialog.querySelector('#mediaOrganiseCheck'),
      apply: dialog.querySelector('#mediaOrganiseApply'),
      summary: dialog.querySelector('#mediaOrganiseSummary'),
      archive: dialog.querySelector('#mediaOrganiseArchive'),
      list: dialog.querySelector('#mediaOrganiseList'),
      status: dialog.querySelector('#mediaOrganiseStatus')
    };
  }

  function mediaOrganiseLine(text, className = '') {
    const line = document.createElement('p');
    line.className = `media-organise-line ${className}`.trim();
    line.textContent = text;
    return line;
  }

  function mediaOrganiseCount(count, singular) {
    return `${count} ${singular}${count === 1 ? '' : 's'}`;
  }

  function openMediaOrganiseDialog() {
    const ui = mediaOrganiseElements();
    if (!ui.dialog || !ui.summary) return;
    mediaOrganisePlanState = null;
    ui.list.replaceChildren();
    ui.archive.value = 'Archive';
    ui.apply.disabled = true;
    ui.status.textContent = '';
    if (!state.gedcomRecords.length) ui.summary.textContent = 'Open a GEDCOM first.';
    else if (!mediaOrganiseUsesFolder() && !state.mediaHelper?.organiseMedia) {
      ui.summary.textContent = 'Choose or link a media folder in this menu first. The local helper can also do this when it is running.';
    } else {
      const where = mediaOrganiseUsesFolder() ? 'the media folder' : `"${state.mediaHelper.folder}"`;
      ui.summary.textContent = `Check ${where} to see which files are outside their person's folder, then organise them.`;
    }
    showModalFocused(ui.dialog);
  }

  // A plan as the dialog shows it, whichever caller produced it.
  function mediaOrganisePlanOf(source) {
    if (!source) return { actions: [], placements: [], copies: [], archives: [], warnings: [], counts: {} };
    const actions = source.actions || [];
    const placements = source.placements || actions.filter((action) => action.kind === 'move' || action.kind === 'replace');
    const copies = source.copies || actions.filter((action) => action.kind === 'copy');
    const archives = source.archives || actions.filter((action) => action.kind === 'archive');
    return { ...source, actions, placements, copies, archives, warnings: source.warnings || [] };
  }

  function renderMediaOrganisePlan(planState) {
    const ui = mediaOrganiseElements();
    const plan = mediaOrganisePlanOf(planState);
    const parts = [];
    const moved = plan.placements.filter((action) => action.kind === 'move').length;
    const replaced = plan.placements.filter((action) => action.kind === 'replace').length;
    if (moved) parts.push(`${mediaOrganiseCount(moved, 'file')} to move into person folders`);
    if (replaced) parts.push(`${mediaOrganiseCount(replaced, 'same-named file')} to replace`);
    if (plan.copies.length) parts.push(`${mediaOrganiseCount(plan.copies.length, 'shared file')} to copy`);
    if (plan.archives.length) parts.push(`${mediaOrganiseCount(plan.archives.length, 'unlinked file')} to archive`);
    const folders = new Set(plan.actions.map((action) => action.toFolder).filter(Boolean));
    if (folders.size) parts.push(`${mediaOrganiseCount(folders.size, 'folder')} in use`);
    ui.summary.textContent = parts.length
      ? `${parts.join(' · ')}.`
      : 'Every linked file is already stored in its person\'s folder.';
    ui.list.replaceChildren();
    const groups = [
      ['Shared files (a copy is made for each person)', plan.copies],
      ['Linked files moved into person folders', plan.placements],
      ['Unlinked files moved to the archive folder', plan.archives]
    ];
    for (const [title, actions] of groups) {
      if (!actions.length) continue;
      const heading = document.createElement('h4');
      heading.textContent = `${title} (${actions.length})`;
      ui.list.append(heading);
      const shown = actions.slice(0, 80);
      for (const action of shown) {
        ui.list.append(mediaOrganiseLine(`${action.fromPath} → ${action.toPath}`, action.kind === 'replace' ? 'is-replace' : ''));
      }
      if (actions.length > shown.length) ui.list.append(mediaOrganiseLine(`… and ${actions.length - shown.length} more.`, 'is-more'));
    }
    for (const warning of plan.warnings) {
      ui.list.append(mediaOrganiseLine(warning.message, warning.kind === 'missing' || warning.kind === 'unsupported' ? 'is-warning' : ''));
    }
    ui.apply.disabled = !plan.actions.length;
  }

  // Shows what the dialog is doing in its status line. While it works a spin-
  // ning wheel sits before the text, and the dialog is marked busy so the
  // controls stay disabled for screen readers too. A plain string replaces it.
  function setMediaOrganiseStatus(busyText) {
    const ui = mediaOrganiseElements();
    if (!busyText) {
      ui.status.replaceChildren();
      ui.status.setAttribute('aria-busy', 'false');
      ui.dialog.setAttribute('aria-busy', 'false');
      ui.list.classList.remove('is-busy');
      return;
    }
    const spinner = document.createElement('span');
    spinner.className = 'media-scan-spinner media-organise-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    ui.status.replaceChildren(spinner, document.createTextNode(busyText));
    ui.status.setAttribute('aria-busy', 'true');
    ui.dialog.setAttribute('aria-busy', 'true');
    ui.list.classList.add('is-busy');
  }

  async function checkMediaOrganise() {
    const ui = mediaOrganiseElements();
    if (mediaOrganiseBusy) return;
    mediaOrganiseBusy = true;
    ui.check.disabled = true;
    ui.apply.disabled = true;
    setMediaOrganiseStatus('Reading the media folder…');
    try {
      if (mediaOrganiseUsesFolder()) {
        const scanned = await scanMediaOrganiseWithFolder();
        mediaOrganisePlanState = scanned.plan;
        renderMediaOrganisePlan(scanned.plan);
      } else {
        const body = await scanMediaOrganiseWithHelper();
        mediaOrganisePlanState = mediaOrganisePlanOf(body.plan);
        renderMediaOrganisePlan(mediaOrganisePlanState);
      }
      setMediaOrganiseStatus('');
    } catch (error) {
      ui.summary.textContent = error?.message || 'The media folder could not be read.';
      ui.list.replaceChildren();
      setMediaOrganiseStatus('');
    } finally {
      mediaOrganiseBusy = false;
      ui.check.disabled = false;
    }
  }

  async function applyMediaOrganise() {
    const ui = mediaOrganiseElements();
    if (!mediaOrganisePlanState || mediaOrganiseBusy) return;
    const folderMode = mediaOrganiseUsesFolder();
    mediaOrganiseBusy = true;
    ui.apply.disabled = true;
    ui.check.disabled = true;
    setMediaOrganiseStatus('Organising media files…');
    try {
      const result = folderMode ? await applyMediaOrganiseWithFolder(mediaOrganisePlanState) : await applyMediaOrganiseWithHelper();
      // The GEDCOM now points at the files' new places.
      const nextText = result.gedcomText || '';
      if (nextText && nextText !== (state.gedcomText || serializeGedcomRecords(state.gedcomRecords))) {
        state.gedcomText = nextText;
        state.gedcomRecords = splitGedcomRecords(nextText);
        reparseGedcomRecords();
        markGedcomDirty();
      }
      // Card images follow the files they were picked from.
      applyMediaOrganiseHeroRenames(result.renames || []);
      savePrimaryMedia();
      saveAdditionalMedia();
      // Re-read the media folder so previews, links and the Media Library show the new paths.
      if (folderMode) await indexMediaDirectory(state.mediaDirectoryHandle);
      // Card images and cached previews belong to the files' old places.
      releaseMediaUrls();
      state.mediaLibraryCache = null;
      state.mediaLibraryCacheKey = '';
      await persistActiveSession();
      if (state.selectedId) setFocus(state.selectedId, true); else render();
      setMediaOrganiseStatus('');
      ui.status.textContent = mediaOrganiseResultLine(result.summary || {}, result.unsupported || []);
      ui.list.replaceChildren();
      ui.summary.textContent = 'The plan above has been carried out. Check again to see what is left.';
      ui.apply.disabled = true;
      mediaOrganisePlanState = null;
      // The tree now differs from the file; saving it writes the new paths.
      if (state.gedcomDirty) await saveGedcomFile({ interactive: true });
    } catch (error) {
      setMediaOrganiseStatus('');
      ui.status.textContent = error?.message || 'The media folder could not be organised.';
      ui.apply.disabled = false;
    } finally {
      mediaOrganiseBusy = false;
      ui.check.disabled = false;
    }
  }

  function mediaOrganiseResultLine(summary, unsupported = []) {
    const parts = [];
    if (summary.moved) parts.push(`${summary.moved} moved`);
    if (summary.copied) parts.push(`${summary.copied} copied`);
    if (summary.replaced) parts.push(`${summary.replaced} replaced`);
    if (summary.archived) parts.push(`${summary.archived} archived`);
    if (summary.missing) parts.push(`${summary.missing} missing`);
    if (summary.failed) parts.push(`${summary.failed} failed`);
    const done = parts.length ? `Done: ${parts.join(', ')}.` : 'Nothing needed moving.';
    const left = unsupported.length ? ` ${mediaOrganiseCount(unsupported.length, 'FILE line')} outside the media folder were left unchanged.` : '';
    return state.gedcomDirty ? `${done}${left} Save to GEDCOM keeps the new file paths.` : `${done}${left}`;
  }

  // Moves each hero image choice with its file: a full-path choice stays a full
  // path, a file-name choice keeps the file name.
  function applyMediaOrganiseHeroRenames(renames) {
    const changes = new Map();
    for (const { from, to } of renames) changes.set(normalizeMediaPath(from), to);
    let fullPath = false;
    for (const stored of state.primaryMedia.values()) if (stored.includes('/')) { fullPath = true; break; }
    // Saved choices are usually file names, but accept a full path too.
    if (!fullPath) {
      try { for (const stored of Object.values(readSelection(state.primaryMediaKey) || {})) if (typeof stored === 'string' && stored.includes('/')) { fullPath = true; break; } } catch { }
    }
    let changed = false;
    for (const [personId, stored] of [...state.primaryMedia]) {
      const to = changes.get(normalizeMediaPath(stored));
      if (!to || to === stored) continue;
      state.primaryMedia.set(personId, fullPath ? to : splitName(to));
      changed = true;
    }
    return changed;
  }

  const mediaOrganiseButton = document.querySelector('#mediaOrganiseMenuButton');
  const mediaOrganiseDialog = mediaOrganiseDialogElement();
  if (mediaOrganiseButton) mediaOrganiseButton.addEventListener('click', openMediaOrganiseDialog);
  if (mediaOrganiseDialog) {
    mediaOrganiseDialog.querySelector('#closeMediaOrganise').addEventListener('click', () => mediaOrganiseDialog.close());
    mediaOrganiseDialog.querySelector('#mediaOrganiseCheck').addEventListener('click', checkMediaOrganise);
    mediaOrganiseDialog.querySelector('#mediaOrganiseApply').addEventListener('click', applyMediaOrganise);
  }

