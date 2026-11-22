  // ---------------------------------------------------------------------------
  // 16. Duplicate media files (exact copies, removal and archiving)
  // ---------------------------------------------------------------------------

  // Two files are duplicates only when their contents are identical: the same
  // bytes, whatever the files are called. A file used as a card image or attached
  // to a life event is never offered, and neither are the other copies in its
  // group. The groups come from helpers/media-organise.js, which the local helper
  // uses too, so the list matches whatever does the reading.

  const duplicateScanExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'pdf'];

  function duplicateCore() {
    if (!globalThis.KinshipMediaOrganise) {
      throw new Error('The media folder helper did not load. Reload the page and try again.');
    }
    return globalThis.KinshipMediaOrganise;
  }

  // A shareable file address for the media folder: a directory of its own, or the
  // local helper's /media/ route. Everything the helpers compare is sent there.
  function duplicateRequest() {
    const request = {
      people: mediaOrganisePersonDetails(),
      gedcomText: state.gedcomText || serializeGedcomRecords(state.gedcomRecords),
      heroPicks: Object.fromEntries(savedHeroPicks())
    };
    // Kinship Atlas.exe reads the tree from its own GEDCOM, so its requests stay
    // small; other helpers are sent the records as well.
    if (!state.mediaHelper?.readsPrimaryGedcom) request.records = state.gedcomRecords;
    return request;
  }

  // Chatty text for a file size.
  function duplicateSize(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  }

  // The card image choices and the media on life events, for this tree. A group
  // holding one of these is left alone, so a photo in use is never removed.
  function duplicateLinkKeys(records) {
    const core = duplicateCore();
    const heroKeys = new Set();
    for (const stored of savedHeroPicks().values()) {
      const path = typeof stored === 'string' ? stored : stored?.path;
      if (path) heroKeys.add(normalizeMediaPath(path));
    }
    const eventKeys = new Set();
    for (const record of records) {
      if (record.tag !== 'INDI' && record.tag !== 'FAM') continue;
      let inEvent = false;
      for (const line of record.lines || []) {
        const match = /^(\d+)\s+(\S+)\s*(.*)$/.exec(line.replace(/\r$/, ''));
        if (!match) continue;
        const level = Number(match[1]);
        const tag = match[2].toUpperCase();
        if (level === 1) inEvent = core.EVENT_TAGS.has(tag);
        if (inEvent && tag === 'FILE' && level >= 2 && match[3].trim()) eventKeys.add(normalizeMediaPath(match[3].trim()));
      }
    }
    return { heroKeys, eventKeys };
  }

  // A web address for a file, for thumbnails and for opening a PDF: the object
  // URL the media library already holds, or a copy fetched from the helper.
  async function duplicatePreviewUrl(entry) {
    if (!entry) return '';
    if (entry.file?.kinshipUrl) return entry.file.kinshipUrl;
    if (entry.file) return mediaUrl(entry.file);
    if (entry.url) return entry.url;
    const relative = entry.relativePath || '';
    if (!relative) return '';
    try {
      const response = await fetch(`/media/${relative.split('/').map(encodeURIComponent).join('/')}`);
      if (!response.ok) return '';
      return URL.createObjectURL(await response.blob());
    } catch {
      return '';
    }
  }

  // A small thumbnail for an image, and a "PDF" tile for a document.
  function duplicateThumbnail(entry) {
    if (/\.pdf$/i.test(entry.name || '')) {
      const tile = document.createElement('span');
      tile.className = 'duplicate-media-thumb is-pdf';
      tile.textContent = 'PDF';
      return tile;
    }
    const image = document.createElement('img');
    image.className = 'duplicate-media-thumb';
    image.alt = '';
    image.loading = 'lazy';
    duplicatePreviewUrl(entry).then((url) => { if (url) image.src = url; });
    return image;
  }

  // Groups of identical files, grouped here when the folder is open in this tab,
  // or by the local helper when it is the one holding the folder.
  async function findDuplicateMedia() {
    if (!state.people.size) throw new Error('Open a GEDCOM first.');
    if (!state.mediaDirectoryHandle && !state.mediaHelper?.findDuplicates) {
      throw new Error('Choose or link a media folder in this menu first. The local helper can also do this when it is running.');
    }
    const core = duplicateCore();
    const { heroKeys, eventKeys } = duplicateLinkKeys(state.gedcomRecords);
    if (state.mediaDirectoryHandle) {
      // The folder is open here: read and hash its files in this tab.
      const files = [];
      const entries = new Map();
      const walk = async (directory, prefix) => {
        for await (const [name, handle] of directory.entries()) {
          const relativePath = prefix ? `${prefix}/${name}` : name;
          if (handle.kind === 'directory') { await walk(handle, relativePath); continue; }
          if (!core.isMediaFile(name)) continue;
          const file = await handle.getFile();
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
          const key = normalizeMediaPath(relativePath);
          files.push({ relativePath, name, size: file.size, hash, key });
          entries.set(key, file);
        }
      };
      await walk(state.mediaDirectoryHandle, '');
      return core.groupDuplicates(files, { heroKeys: [...heroKeys], eventKeys: [...eventKeys] }).map((group) => ({
        hash: group.hash,
        bytes: group.bytes,
        protected: group.protected,
        files: group.files.map((file) => ({
          relativePath: file.relativePath,
          name: file.name,
          size: file.size,
          keeper: file.relativePath === group.keeper.relativePath,
          file: entries.get(file.key)
        }))
      }));
    }
    const response = await fetch('/api/duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateRequest())
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The local helper could not check the media folder for duplicates.');
    return (body.groups || []).map((group) => ({
      hash: group.hash,
      bytes: group.bytes,
      protected: group.protected,
      files: (group.files || []).map((file) => ({
        relativePath: file.relativePath,
        name: file.name,
        size: file.size,
        keeper: file.keeper,
        owners: (file.owners || []).map((id) => state.people.get(id)?.name).filter(Boolean)
      }))
    }));
  }

  // The tick box key for one copy.
  function duplicateKey(group, file) {
    return `${group.hash}|${file.relativePath}`;
  }

  // Removes the ticked copies: deleted outright, or copied into the archive
  // folder first, with their GEDCOM links dropped. The kept copy is untouched.
  async function removeDuplicateMedia(groups, selected, mode) {
    const core = duplicateCore();
    const work = groups.map((group) => ({ group, files: group.files.filter((file) => selected.has(duplicateKey(group, file))) }))
      .filter((item) => item.files.length);
    if (!work.length) return { removed: [], failed: [] };
    if (work.some((item) => item.files.some((file) => file.keeper))) {
      throw new Error('The copy that is kept cannot be removed. Clear its tick and try again.');
    }
    const archiveFolder = duplicateElements().archive.value.trim() || 'Archive';
    let gedcomText = state.gedcomText || serializeGedcomRecords(state.gedcomRecords);
    const removed = [];
    const failed = [];
    if (state.mediaDirectoryHandle) {
      // The folder is open here: copy and delete the files in this tab.
      const directoryHandle = state.mediaDirectoryHandle;
      const stamp = new Date().toISOString().slice(0, 10);
      for (const { files } of work) {
        for (const file of files) {
          try {
            const segments = file.relativePath.split('/');
            let parent = directoryHandle;
            for (const segment of segments.slice(0, -1)) parent = await parent.getDirectoryHandle(segment);
            const handle = await parent.getFileHandle(segments.at(-1));
            if (mode === 'archive') {
              let archive = directoryHandle;
              for (const segment of `${archiveFolder}/${stamp}`.split('/')) archive = await archive.getDirectoryHandle(segment, { create: true });
              const taken = new Set();
              for (const name of await Array.fromAsync(archive.keys())) taken.add(name.toLocaleLowerCase());
              const name = taken.has(segments.at(-1).toLocaleLowerCase()) ? core.uniqueName(segments.at(-1), taken) : segments.at(-1);
              await core.placeMediaFile(handle, archive, name);
            }
            await parent.removeEntry(segments.at(-1));
            gedcomText = core.removeGedcomFileReferences(gedcomText, file.relativePath);
            removed.push({ file: file.relativePath, action: mode });
          } catch (error) {
            failed.push({ file: file.relativePath, error: error?.message || 'The file could not be removed.' });
          }
        }
      }
      return { gedcomText, removed, failed };
    }
    for (const { group, files } of work) {
      const response = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...duplicateRequest(),
          apply: true,
          mode,
          archiveFolder,
          keep: group.files.find((file) => file.keeper)?.relativePath || '',
          files: files.map((file) => file.relativePath),
          gedcomText
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        for (const file of files) failed.push({ file: file.relativePath, error: body.error || 'The local helper could not remove the file.' });
        continue;
      }
      gedcomText = body.gedcomText || gedcomText;
      removed.push(...(body.removed || []));
      failed.push(...(body.failed || []));
    }
    return { gedcomText, removed, failed };
  }

  // The dialog -----------------------------------------------------------------

  let duplicateGroups = [];
  let duplicateBusy = false;
  const duplicateSelected = new Set();

  function duplicateElements() {
    const dialog = document.querySelector('#duplicateMediaDialog');
    return {
      dialog,
      list: dialog.querySelector('#duplicateMediaList'),
      summary: dialog.querySelector('#duplicateMediaSummary'),
      status: dialog.querySelector('#duplicateMediaStatus'),
      archive: dialog.querySelector('#duplicateMediaArchive'),
      scan: dialog.querySelector('#duplicateMediaScanButton'),
      applyArchive: dialog.querySelector('#duplicateMediaArchiveButton'),
      applyDelete: dialog.querySelector('#duplicateMediaDeleteButton'),
      selected: dialog.querySelector('#duplicateMediaSelected')
    };
  }

  // The spinning wheel and text while the scan or a removal runs.
  function setDuplicateBusy(on, text = 'Looking for identical files…') {
    const ui = duplicateElements();
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

  function syncDuplicateSelection() {
    const ui = duplicateElements();
    const count = duplicateSelected.size;
    ui.selected.textContent = count ? `${count} cop${count === 1 ? 'y' : 'ies'} selected` : '';
    ui.applyDelete.disabled = duplicateBusy || !count;
    ui.applyArchive.disabled = duplicateBusy || !count;
  }

  function renderDuplicateGroups(groups) {
    const ui = duplicateElements();
    ui.list.replaceChildren();
    if (!groups.length) {
      ui.summary.textContent = 'No duplicates found. Every file differs from the others.';
      return;
    }
    const extraCopies = groups.reduce((total, group) => total + group.files.length - 1, 0);
    const protectedGroups = groups.filter((group) => group.protected).length;
    ui.summary.textContent = `${groups.length} group${groups.length === 1 ? '' : 's'} of identical files, ${extraCopies} extra cop${extraCopies === 1 ? 'y' : 'ies'}${protectedGroups ? `, ${protectedGroups} in use by a card image or life event so left alone` : ''}.`;
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = `duplicate-media-group${group.protected ? ' is-protected' : ''}`;
      const heading = document.createElement('h4');
      heading.textContent = `${duplicateSize(group.bytes)} · ${group.files.length} copies${group.protected ? ' · in use, so it is left alone' : ''}`;
      section.append(heading);
      for (const file of group.files) {
        const row = document.createElement('label');
        row.className = `duplicate-media-row${file.keeper ? ' is-keeper' : ''}`;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.disabled = Boolean(file.keeper) || group.protected;
        const selectionKey = duplicateKey(group, file);
        box.checked = duplicateSelected.has(selectionKey);
        box.addEventListener('change', () => {
          if (box.checked) duplicateSelected.add(selectionKey);
          else duplicateSelected.delete(selectionKey);
          syncDuplicateSelection();
        });
        row.append(box, duplicateThumbnail(file));
        const name = document.createElement('span');
        name.className = 'duplicate-media-name';
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = file.name || file.relativePath;
        link.title = `Open ${file.relativePath} in a new window`;
        link.addEventListener('click', async (event) => {
          event.preventDefault();
          const url = await duplicatePreviewUrl(file);
          if (url) window.open(url, '_blank', 'noopener');
          else showToast(`"${file.relativePath}" could not be opened. It may no longer be in the media folder.`);
        });
        const detail = document.createElement('span');
        detail.className = 'duplicate-media-detail';
        const where = file.relativePath.split('/').slice(0, -1).join('/');
        detail.textContent = ` · ${where || 'media folder root'}${file.owners?.length ? ` · ${file.owners.join(', ')}` : ''}`;
        name.append(link, detail);
        const keep = document.createElement('span');
        keep.className = 'duplicate-media-keep';
        keep.textContent = file.keeper ? 'Kept' : '';
        row.append(name, keep);
        section.append(row);
      }
      ui.list.append(section);
    }
  }

  async function scanDuplicateMedia() {
    const ui = duplicateElements();
    if (duplicateBusy) return;
    duplicateBusy = true;
    duplicateSelected.clear();
    ui.list.replaceChildren();
    ui.applyDelete.disabled = true;
    ui.applyArchive.disabled = true;
    setButtonContent(ui.scan, 'scanFace', 'Scanning…');
    setDuplicateBusy(true);
    try {
      duplicateGroups = await findDuplicateMedia();
      renderDuplicateGroups(duplicateGroups);
    } catch (error) {
      duplicateGroups = [];
      ui.summary.textContent = error?.message || 'The media folder could not be checked for duplicates.';
    } finally {
      duplicateBusy = false;
      setDuplicateBusy(false);
      setButtonContent(ui.scan, 'scanFace', 'Scan for duplicates');
      syncDuplicateSelection();
    }
  }

  // Drops the removed files from the index, the library cache and the records, so
  // nothing keeps showing a file that is gone, then saves the GEDCOM.
  async function afterDuplicateRemoval(result, removedPaths) {
    const nextText = result.gedcomText || '';
    if (nextText && nextText !== (state.gedcomText || serializeGedcomRecords(state.gedcomRecords))) {
      state.gedcomText = nextText;
      state.gedcomRecords = splitGedcomRecords(nextText);
      reparseGedcomRecords();
      markGedcomDirty();
    }
    if (state.mediaIndex) {
      for (const [key, files] of [...state.mediaIndex.byName]) {
        const remaining = files.filter((file) => !removedPaths.has(normalizeMediaPath(state.mediaRelativePaths.get(file) || file.name)));
        if (!remaining.length) state.mediaIndex.byName.delete(key);
        else if (remaining.length !== files.length) state.mediaIndex.byName.set(key, remaining);
      }
    }
    // Previews and face results belong to files that may be gone now.
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';
    state.mediaFaceAnalysis = null;
    releaseMediaUrls();
    if (state.mediaDirectoryHandle) await indexMediaDirectory(state.mediaDirectoryHandle);
    await persistActiveSession();
    if (state.selectedId) setFocus(state.selectedId, true); else render();
    if (state.gedcomDirty) await saveGedcomFile({ interactive: true });
  }

  async function applyDuplicateRemoval(mode) {
    const ui = duplicateElements();
    if (duplicateBusy || !duplicateSelected.size) return;
    const count = duplicateSelected.size;
    const outcome = mode === 'delete' ? 'delete these files for good' : 'move these files into the archive folder';
    if (!window.confirm(`Remove ${count} duplicate file${count === 1 ? '' : 's'} and unlink ${count === 1 ? 'it' : 'them'} from every person record?\n\nThis will ${outcome}. The copies that are kept stay as they are.`)) return;
    duplicateBusy = true;
    ui.applyDelete.disabled = true;
    ui.applyArchive.disabled = true;
    setDuplicateBusy(true, mode === 'delete' ? 'Deleting duplicate files…' : 'Moving duplicate files to the archive…');
    try {
      const result = await removeDuplicateMedia(duplicateGroups, duplicateSelected, mode);
      const removedPaths = new Set((result.removed || []).map((item) => normalizeMediaPath(item.file)));
      await afterDuplicateRemoval(result, removedPaths);
      const failed = result.failed || [];
      const removedCount = (result.removed || []).length;
      ui.summary.textContent = `${removedCount} file${removedCount === 1 ? '' : 's'} ${mode === 'delete' ? 'deleted' : 'archived'}${failed.length ? `; ${failed.length} could not be removed (${failed[0].error})` : ''}.`;
      duplicateGroups = duplicateGroups
        .map((group) => ({ ...group, files: group.files.filter((file) => !removedPaths.has(normalizeMediaPath(file.relativePath))) }))
        .filter((group) => group.files.length > 1);
      duplicateSelected.clear();
      renderDuplicateGroups(duplicateGroups);
    } catch (error) {
      ui.summary.textContent = error?.message || 'The duplicate files could not be removed.';
    } finally {
      duplicateBusy = false;
      setDuplicateBusy(false);
      syncDuplicateSelection();
    }
  }

  function openDuplicateMediaDialog() {
    const ui = duplicateElements();
    duplicateGroups = [];
    duplicateSelected.clear();
    ui.list.replaceChildren();
    ui.archive.value = 'Archive';
    ui.summary.textContent = 'Looks for exact copies (the same bytes, any file name) among the images and PDFs in the media folder.';
    ui.status.replaceChildren();
    ui.applyDelete.disabled = true;
    ui.applyArchive.disabled = true;
    ui.scan.disabled = false;
    setButtonContent(ui.scan, 'scanFace', 'Scan for duplicates');
    if (!state.gedcomRecords.length) ui.summary.textContent = 'Open a GEDCOM first.';
    else if (!state.mediaDirectoryHandle && !state.mediaHelper?.findDuplicates) {
      ui.summary.textContent = 'Choose or link a media folder in this menu first. The local helper can also do this when it is running.';
    }
    showModalFocused(ui.dialog);
  }

  const duplicateMenuButton = document.querySelector('#duplicateMediaMenuButton');
  const duplicateDialog = document.querySelector('#duplicateMediaDialog');
  if (duplicateMenuButton) duplicateMenuButton.addEventListener('click', openDuplicateMediaDialog);
  if (duplicateDialog) {
    duplicateDialog.querySelector('#closeDuplicateMedia').addEventListener('click', () => duplicateDialog.close());
    duplicateDialog.querySelector('#duplicateMediaScanButton').addEventListener('click', scanDuplicateMedia);
    duplicateDialog.querySelector('#duplicateMediaDeleteButton').addEventListener('click', () => applyDuplicateRemoval('delete'));
    duplicateDialog.querySelector('#duplicateMediaArchiveButton').addEventListener('click', () => applyDuplicateRemoval('archive'));
  }
})();
