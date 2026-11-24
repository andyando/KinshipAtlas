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

  // Every media path any person or family record names, on a FILE line or
  // through an OBJE pointer. The subfolder check reads this when a folder is not
  // open in the tab, so a folder keeping one linked file is never reported.
  function mediaOrganiseLinkedPaths() {
    const paths = [];
    for (const entry of (globalThis.KinshipMediaOrganise?.readGedcomMedia(state.gedcomRecords) || { files: [] }).files) {
      if (entry.path) paths.push(entry.path);
    }
    return paths;
  }

  function mediaOrganiseRequest() {
    const request = {
      people: mediaOrganisePersonDetails(),
      gedcomText: state.gedcomText || serializeGedcomRecords(state.gedcomRecords),
      archiveFolder: mediaOrganiseElements().archive.value.trim() || 'Archive',
      // GEDCOM paths from another copy of the tree are read against this folder.
      mediaFolderName: mediaFolderNameForTree(),
      heroPicks: Object.fromEntries(savedHeroPicks()),
      linkedPaths: mediaOrganiseLinkedPaths()
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

  // Adopting: new image or PDF files a user dropped by hand into an existing
  // person folder, but that no GEDCOM record names yet, become that person's
  // media. The file keeps its place; only the link is added (and saved).
  function mediaOrganiseFolderOwnerOf(folderName) {
    const wanted = String(folderName || '').trim().toLocaleLowerCase();
    if (!wanted) return '';
    // A folder named "... [I123]" names its person however the rest is spelled.
    const idInName = /\[([^\]]+)\]\s*$/.exec(wanted)?.[1]?.replace(/^@+|@+$/g, '').toLocaleLowerCase();
    if (idInName) {
      const byId = [...state.people.keys()].find((key) => key.toLocaleLowerCase() === idInName);
      if (byId) return byId;
    }
    for (const person of state.people.values()) {
      if (mediaPersonFolderName(person.id).toLocaleLowerCase() === wanted) return person.id;
    }
    return '';
  }

  // Files a person record already names, by normalised path or bare name.
  function mediaOrganiseLinkedKeys() {
    const keys = new Set();
    const add = (path) => {
      if (!path) return;
      keys.add(normalizeMediaPath(path));
      keys.add(normalizeMediaPath(splitName(path)));
    };
    for (const person of state.people.values()) for (const path of person.mediaPaths || []) add(path);
    for (const family of state.families.values()) for (const event of [family.marriage, family.divorce]) for (const path of event?.mediaPaths || []) add(path);
    return keys;
  }

  // Walks the folder open in the tab — or, in helper mode, the media files the
  // launcher already indexed — and adopts every unlinked media file that sits
  // inside a person folder. Returns how many were linked.
  async function adoptMediaInPersonFolders() {
    if (!state.people.size) return 0;
    const core = mediaOrganiseHelpers();
    const linked = mediaOrganiseLinkedKeys();
    let adopted = 0;
    let changed = false;
    const adopt = (relativePath) => {
      if (linked.has(normalizeMediaPath(relativePath)) || linked.has(normalizeMediaPath(splitName(relativePath)))) return;
      const segments = relativePath.split('/');
      if (segments.length < 2) return;
      const personId = mediaOrganiseFolderOwnerOf(segments[0]);
      if (!personId) return;
      const person = state.people.get(personId);
      if (!person) return;
      if (!person.mediaPaths.includes(relativePath)) person.mediaPaths.push(relativePath);
      const paths = state.additionalMedia.get(personId) || [];
      if (!paths.includes(relativePath)) paths.push(relativePath);
      state.additionalMedia.set(personId, paths);
      linked.add(normalizeMediaPath(relativePath));
      linked.add(normalizeMediaPath(splitName(relativePath)));
      adopted += 1;
      changed = true;
    };
    if (state.mediaDirectoryHandle) {
      const walk = async (directory, prefix) => {
        for await (const [name, entry] of directory.entries()) {
          const relativePath = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === 'directory') { await walk(entry, relativePath); continue; }
          if (!core.isMediaFile(name)) continue;
          adopt(relativePath);
        }
      };
      try {
        await walk(state.mediaDirectoryHandle, '');
      } catch (error) {
        console.warn('Person folders could not be checked for new media.', error);
        return adopted;
      }
    } else if (state.mediaHelper && Array.isArray(window.KINSHIP_PRIMARY?.media)) {
      // Helper mode: the launcher's primary-data.js lists every media file in
      // the library with its person-folder path.
      for (const item of window.KINSHIP_PRIMARY.media) {
        if (item?.path) adopt(item.path);
      }
    } else {
      return 0;
    }
    if (changed) {
      savePrimaryMedia();
      saveAdditionalMedia();
      // The media library and details panel pick up the new links.
      if (state.selectedId) setFocus(state.selectedId, true); else render();
    }
    return adopted;
  }

  // Every media file under the folder open in this tab, as { relativePath }.
  async function collectMediaOrganiseFiles() {
    const core = mediaOrganiseHelpers();
    const files = [];
    const walk = async (directory, prefix) => {
      for await (const [name, entry] of directory.entries()) {
        const relativePath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'directory') { await walk(entry, relativePath); continue; }
        if (!core.isMediaFile(name)) continue;
        // Sizes let the planner recognise a copy an earlier organise run left in
        // the destination folder (same name and size = already copied).
        let size = 0;
        try { size = (await entry.getFile()).size; } catch { size = 0; }
        files.push({ relativePath, size });
      }
    };
    await walk(state.mediaDirectoryHandle, '');
    return files;
  }

  async function scanMediaOrganiseWithFolder() {
    const core = mediaOrganiseHelpers();
    const directoryHandle = state.mediaDirectoryHandle;
    const files = [];
    const folders = [];
    const walk = async (directory, prefix) => {
      for await (const [name, entry] of directory.entries()) {
        const relativePath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'directory') { if (!prefix) folders.push(name); await walk(entry, relativePath); continue; }
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
      softNamedFolders: mediaOrganiseSoftNamedFolders(),
      linkedPaths: request.linkedPaths
    });
    const unusedFolders = core.findUnusedFolders({ ...organised, archiveFolder: request.archiveFolder, folders });
    return { organised, plan: core.planMediaOrganise(organised), unusedFolders };
  }

  async function scanMediaOrganiseWithHelper() {
    const response = await fetch('/api/media-organise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mediaOrganiseRequest())
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The local helper could not read the media folder.');
    // Older helpers do not look for unused subfolders.
    if (!Array.isArray(body.unusedFolders)) body.unusedFolders = [];
    return body;
  }

  // Moves every file in the plan with the footer picker, one folder at a time.
  // The GEDCOM text is rewritten as it goes; what was written is reported back.
  async function applyMediaOrganiseWithFolder(plan, ambiguousNames) {
    const core = mediaOrganiseHelpers();
    const directoryHandle = state.mediaDirectoryHandle;
    const summary = { moved: 0, copied: 0, replaced: 0, archived: 0, failed: 0, missing: 0 };
    const renames = [];
    let gedcomText = state.gedcomText || serializeGedcomRecords(state.gedcomRecords);
    // File names more than one media file shares: a FILE line naming such a
    // name is only rewritten when it spells the exact path.
    const ambiguous = ambiguousNames || new Set();
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
        gedcomText = core.rewriteGedcomFile(gedcomText, action.fromPath, action.toPath, { ambiguousNames: ambiguous });
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
    // The buttons carry icons wherever the dialog last left them.
    setButtonContent(ui.apply, 'organise', 'Organise media files');
    setButtonContent(ui.check, 'checkFolder', 'Check media folder');
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
    if (!source) return { actions: [], placements: [], copies: [], archives: [], warnings: [], unusedFolders: [], counts: {} };
    const actions = source.actions || [];
    const placements = source.placements || actions.filter((action) => action.kind === 'move' || action.kind === 'replace');
    const copies = source.copies || actions.filter((action) => action.kind === 'copy');
    const archives = source.archives || actions.filter((action) => action.kind === 'archive');
    return { ...source, actions, placements, copies, archives, warnings: source.warnings || [], unusedFolders: source.unusedFolders || [] };
  }

  // A green tick before a heading, for a group of tasks that is already done.
  function mediaOrganiseTick(title) {
    const heading = document.createElement('h4');
    heading.className = 'media-organise-done';
    const tick = document.createElement('span');
    tick.className = 'media-organise-tick';
    tick.textContent = '✔';
    tick.setAttribute('aria-hidden', 'true');
    heading.append(tick, document.createTextNode(` ${title}`));
    return heading;
  }

  // The list of empty subfolders the check found, with a delete button each and
  // a delete-all button for the whole list.
  function renderMediaOrganiseUnusedFolders(unusedFolders) {
    const ui = mediaOrganiseElements();
    if (!unusedFolders.length) return;
    const heading = document.createElement('h4');
    heading.textContent = `Empty subfolders (${unusedFolders.length})`;
    const deleteAll = document.createElement('button');
    deleteAll.type = 'button';
    deleteAll.className = 'dialog-button dialog-button-danger media-organise-folder-delete';
    deleteAll.textContent = `Delete all ${unusedFolders.length}`;
    deleteAll.addEventListener('click', async () => {
      const names = unusedFolders.map((item) => item.folder);
      if (!window.confirm(`Delete all ${unusedFolders.length} empty subfolders?

${names.slice(0, 20).join('\n')}${names.length > 20 ? `\n… and ${names.length - 20} more` : ''}

This cannot be undone.`)) return;
      deleteAll.disabled = true;
      // Delete every listed folder with no per-folder confirmation: the single
      // confirmation above covers them all.
      let deleted = 0;
      let failed = 0;
      const list = ui.list;
      for (const item of unusedFolders) {
        try {
          if (mediaOrganiseUsesFolder()) {
            await deleteMediaOrganiseFolderWithHandles(item);
          } else {
            const response = await fetch('/api/media-organise', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...mediaOrganiseRequest(), deleteFolder: item.folder })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'The folder could not be deleted.');
          }
          deleted += 1;
          ui.status.textContent = `Deleting… ${deleted}/${unusedFolders.length}`;
        } catch { failed += 1; }
      }
      if (mediaOrganisePlanState) mediaOrganisePlanState.unusedFolders = [];
      list.replaceChildren();
      ui.summary.textContent = failed
        ? `${deleted} of ${unusedFolders.length} empty subfolders deleted; ${failed} could not be removed.`
        : `All ${deleted} empty subfolders deleted.`;
    });
    deleteAll.classList.add('media-organise-folder-delete-all');
    heading.append(' ', deleteAll);
    ui.list.append(heading);
    for (const item of unusedFolders.slice(0, 80)) {
      const row = document.createElement('p');
      row.className = 'media-organise-line is-unused-folder';
      const name = document.createElement('span');
      name.textContent = item.folder;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialog-button dialog-button-danger media-organise-folder-delete';
      button.textContent = 'Delete folder';
      button.addEventListener('click', () => deleteMediaOrganiseFolder(item, button));
      row.append(name, button);
      ui.list.append(row);
    }
    if (unusedFolders.length > 80) ui.list.append(mediaOrganiseLine(`… and ${unusedFolders.length - 80} more (delete them with the button above once the first ones are gone).`, 'is-more'));
  }

  // Deletes one empty subfolder, then reports back.
  async function deleteMediaOrganiseFolder(item, button) {
    const ui = mediaOrganiseElements();
    if (!window.confirm(`Delete the empty subfolder "${item.folder}"?\n\nThis cannot be undone.`)) return;
    button.disabled = true;
    try {
      let summary;
      if (mediaOrganiseUsesFolder()) {
        summary = await deleteMediaOrganiseFolderWithHandles(item);
      } else {
        const response = await fetch('/api/media-organise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...mediaOrganiseRequest(), deleteFolder: item.folder })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'The local helper could not delete the folder.');
        summary = body.folderDelete || {};
      }
      button.closest('.media-organise-line')?.remove();
      if (mediaOrganisePlanState) {
        mediaOrganisePlanState.unusedFolders = mediaOrganisePlanState.unusedFolders.filter((entry) => entry.folder !== item.folder);
      }
      ui.status.textContent = `"${item.folder}" deleted.`;
    } catch (error) {
      button.disabled = false;
      ui.status.textContent = error?.message || 'The folder could not be deleted.';
    }
  }

  // Deletes an empty subfolder through the folder handle open in this tab.
  async function deleteMediaOrganiseFolderWithHandles(item) {
    const directoryHandle = state.mediaDirectoryHandle;
    const segments = String(item.folder || '').split('/').filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) throw new Error('The folder could not be used.');
    let parent = directoryHandle;
    for (const segment of segments.slice(0, -1)) parent = await parent.getDirectoryHandle(segment);
    try { await parent.removeEntry(segments.at(-1)); } catch { return { removed: 0, failed: 1 }; }
    return { removed: 1, failed: 0 };
  }

  function renderMediaOrganisePlan(planState, adoptedCount = 0) {
    const ui = mediaOrganiseElements();
    const plan = mediaOrganisePlanOf(planState);
    const unusedFolders = plan.unusedFolders || [];
    const parts = [];
    const moved = plan.placements.filter((action) => action.kind === 'move').length;
    const replaced = plan.placements.filter((action) => action.kind === 'replace').length;
    if (moved) parts.push(`${mediaOrganiseCount(moved, 'file')} to move into person folders`);
    if (replaced) parts.push(`${mediaOrganiseCount(replaced, 'same-named file')} to replace`);
    if (plan.copies.length) parts.push(`${mediaOrganiseCount(plan.copies.length, 'shared file')} to copy`);
    if (plan.archives.length) parts.push(`${mediaOrganiseCount(plan.archives.length, 'unlinked file')} to archive`);
    if (unusedFolders.length) parts.push(`${mediaOrganiseCount(unusedFolders.length, 'empty subfolder')} to delete`);
    const folders = new Set(plan.actions.map((action) => action.toFolder).filter(Boolean));
    if (folders.size) parts.push(`${mediaOrganiseCount(folders.size, 'folder')} in use`);
    // No new organise actions: the check found only completed work and unused
    // subfolders, so the page says so at the top.
    if (!parts.length) {
      ui.summary.textContent = unusedFolders.length
        ? `No new organise actions to be performed. ${mediaOrganiseCount(unusedFolders.length, 'empty subfolder')} can be deleted below.`
        : 'No new organise actions to be performed. Every linked file is already stored in its person\'s folder.';
    } else {
      ui.summary.textContent = `${parts.join(' · ')}.`;
    }
    if (adoptedCount) ui.summary.textContent = `${mediaOrganiseCount(adoptedCount, 'new file')} in person folders adopted as that person's media. ${ui.summary.textContent}`;
    ui.list.replaceChildren();
    // Unactioned tasks come first; completed groups follow with a green tick.
    const pending = [];
    const done = [];
    if (plan.copies.length) pending.push(['Shared files (a copy is made for each person)', plan.copies, false]);
    if (moved || replaced) pending.push(['Linked files moved into person folders', plan.placements, false]);
    if (plan.archives.length) pending.push(['Unlinked files moved to the archive folder', plan.archives, false]);
    // A group the plan does not act on is one that is already done: the files
    // are already where they belong, so the heading gets a green tick.
    if (!moved && !replaced && plan.placements.length) done.push('Linked files moved into person folders');
    if (!plan.archives.length && (plan.actions.length || unusedFolders.length)) done.push('Unlinked files moved to the archive folder');
    for (const title of done) {
      ui.list.append(mediaOrganiseTick(title));
    }
    if (!plan.actions.length) {
      const message = mediaOrganiseLine('No new organise actions to be performed', 'is-done-message');
      ui.list.insertBefore(message, ui.list.firstChild);
    }
    for (const [title, actions] of pending) {
      const heading = document.createElement('h4');
      heading.textContent = `${title} (${actions.length})`;
      ui.list.append(heading);
      const shown = actions.slice(0, 80);
      for (const action of shown) {
        ui.list.append(mediaOrganiseLine(`${action.fromPath} → ${action.toPath}`, action.kind === 'replace' ? 'is-replace' : ''));
      }
      if (actions.length > shown.length) ui.list.append(mediaOrganiseLine(`… and ${actions.length - shown.length} more.`, 'is-more'));
    }
    renderMediaOrganiseUnusedFolders(unusedFolders);
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
      // New files dropped by hand into a person folder become that person's
      // media before the plan is drawn, so the check sees them as linked.
      const adopted = await adoptMediaInPersonFolders();
      if (mediaOrganiseUsesFolder()) {
        const scanned = await scanMediaOrganiseWithFolder();
        mediaOrganisePlanState = { ...scanned.plan, unusedFolders: scanned.unusedFolders || [] };
        renderMediaOrganisePlan(mediaOrganisePlanState, adopted);
      } else {
        const body = await scanMediaOrganiseWithHelper();
        mediaOrganisePlanState = mediaOrganisePlanOf(body.plan);
        renderMediaOrganisePlan(mediaOrganisePlanState);
      }
      if (adopted) ui.summary.textContent = `${mediaOrganiseCount(adopted, 'new file')} in person folders adopted as that person's media. ${ui.summary.textContent}`;
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

  // File names more than one media file shares, for the rewrite guards. Read
  // from the folder open in the tab when it is, else from the media index.
  async function mediaOrganiseAmbiguousNames() {
    const core = mediaOrganiseHelpers();
    const files = mediaOrganiseUsesFolder() ? await collectMediaOrganiseFiles() : [];
    if (!files.length && state.mediaIndex) {
      for (const filesOfName of state.mediaIndex.byName.values()) {
        for (const file of filesOfName) files.push({ relativePath: state.mediaRelativePaths.get(file) || file.name });
      }
    }
    return core.computeMediaOrganiseState(state.gedcomRecords, mediaOrganisePersonDetails(), files, {}).ambiguousNames || new Set();
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
      const ambiguousNames = await mediaOrganiseAmbiguousNames();
      const result = folderMode ? await applyMediaOrganiseWithFolder(mediaOrganisePlanState, ambiguousNames) : await applyMediaOrganiseWithHelper();
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
      // Every FILE line naming a media file of this folder ends up pointing at
      // its place here, however it spelled the path before (an old install's
      // absolute path, a folder since renamed).
      if (folderMode) {
        const core = mediaOrganiseHelpers();
        const repointed = core.repointGedcomFiles(
          state.gedcomText || serializeGedcomRecords(state.gedcomRecords),
          await collectMediaOrganiseFiles(),
          { mediaFolderName: mediaFolderNameForTree(), archiveFolder: mediaOrganiseElements().archive.value.trim() || 'Archive' }
        );
        if (repointed !== (state.gedcomText || serializeGedcomRecords(state.gedcomRecords))) {
          state.gedcomText = repointed;
          state.gedcomRecords = splitGedcomRecords(repointed);
          reparseGedcomRecords();
          markGedcomDirty();
        }
      }
      savePrimaryMedia();
      saveAdditionalMedia();
      // New files dropped by hand into a person folder while organising become
      // that person's media, so nothing waits for the next check.
      const adopted = await adoptMediaInPersonFolders();
      if (adopted) ui.status.textContent = `${mediaOrganiseCount(adopted, 'new file')} in person folders adopted as that person's media. `;
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

