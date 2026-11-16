  // ---------------------------------------------------------------------------
  // 9. Selections and per-tree storage keys
  // ---------------------------------------------------------------------------

  function readSelection(key) {
    if (!helperSelections) return JSON.parse(localStorage.getItem(key) || 'null');
    if (!loadedSelectionKeys.has(key)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const local = JSON.parse(raw);
          if (local === null || (typeof local === 'object' && !Array.isArray(local))) {
            helperSelections[key] = local === null || key.startsWith('kinship-atlas:primary-person:v1:')
              ? local : { ...helperSelections[key], ...local };
          }
        }
      } catch {
        console.warn('Browser selection could not be read; using the selections file.');
      }
      loadedSelectionKeys.add(key);
    }
    return helperSelections[key] ?? null;
  }

  function storeSelection(key, value) {
    let browserSaved = false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      browserSaved = true;
    } catch {
      if (!helperSelections) console.warn('Browser storage could not save the selection.');
    }
    if (helperSelections) {
      helperSelections[key] = value;
      loadedSelectionKeys.add(key);
      syncSelectionsToHelper();
      return true;
    }
    return browserSaved;
  }

  function syncSelectionsToHelper() {
    if (!state.mediaHelper || !helperSelections || !/^https?:$/.test(location.protocol)) return selectionSyncQueue;
    selectionSyncQueue = selectionSyncQueue.then(async () => {
      try {
        const response = await fetch('/api/selections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app: 'Kinship Atlas', version: 1, selections: helperSelections })
        });
        if (!response.ok) throw new Error(`Helper returned HTTP ${response.status}.`);
        return true;
      } catch (error) {
        console.error('Selection file save failed.', error);
        showToast('Card images and media preferences could not be saved to kinship-selections.json. Keep this tab open and try again before closing or copying the app.');
        return false;
      }
    });
    return selectionSyncQueue;
  }

  async function loadHelperSelections() {
    if (!state.mediaHelper) return;
    let saved;
    try {
      const response = await fetch('/kinship-selections.json', { cache: 'no-store' });
      if (response.status === 404) saved = {};
      else {
        if (!response.ok) throw new Error(`Helper returned HTTP ${response.status}.`);
        saved = (await response.json())?.selections;
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid selections file.');
      }
    } catch (error) {
      console.error('Selection file load failed.', error);
      showToast('kinship-selections.json could not be read. Its contents will not be overwritten. Check the file before changing media preferences.');
      return;
    }
    helperSelections = Object.fromEntries(Object.entries(saved).filter(([key, value]) =>
      selectionKeyPrefixes.some((prefix) => key.startsWith(prefix)) && (value === null || (typeof value === 'object' && !Array.isArray(value)))));
    // Read browser entries only for trees that are opened, not every historical GEDCOM revision.
    loadedSelectionKeys.clear();
  }

  function moveMediaSelections(newKey) {
    const oldKey = state.primaryMediaKey;
    const entries = [
      [oldKey, newKey, Object.fromEntries(state.primaryMedia)],
      [`${oldKey}:additional-media:v1`, `${newKey}:additional-media:v1`, Object.fromEntries(state.additionalMedia)],
      [mediaTypeStorageKey(oldKey), mediaTypeStorageKey(newKey), Object.fromEntries(state.mediaTypes)]
    ];
    let browserSaved = false;
    const originals = new Map();
    try {
      for (const [old, next] of entries) {
        originals.set(old, localStorage.getItem(old));
        originals.set(next, localStorage.getItem(next));
      }
      for (const [old] of entries) localStorage.removeItem(old);
      for (const [, next, value] of entries) localStorage.setItem(next, JSON.stringify(value));
      browserSaved = true;
    } catch {
      try {
        for (const key of originals.keys()) localStorage.removeItem(key);
        for (const [key, value] of originals) if (value !== null) localStorage.setItem(key, value);
      } catch {
        console.error('Browser selections could not be restored after storage filled up.');
      }
    }
    if (helperSelections) {
      for (const [old, next, value] of entries) {
        delete helperSelections[old];
        helperSelections[next] = value;
        loadedSelectionKeys.add(next);
      }
    }
    if (!browserSaved && !helperSelections) {
      showToast('The GEDCOM was saved, but browser storage is full. Media preferences could not be linked to the saved version. Keep this tab open and use the local helper to save them.');
      return false;
    }
    state.primaryMediaKey = newKey;
    syncSelectionsToHelper();
    return true;
  }

  function addFileToMediaIndex(file, relativePath) {
    if (!state.mediaIndex) state.mediaIndex = { byName: new Map() };
    state.mediaRelativePaths.set(file, relativePath);
    const key = normalizeMediaPath(file.name);
    if (!state.mediaIndex.byName.has(key)) state.mediaIndex.byName.set(key, []);
    state.mediaIndex.byName.get(key).push(file);
  }

  async function indexMediaDirectory(directoryHandle) {
    const byName = new Map();
    const relativePaths = new WeakMap();
    async function visit(directory, prefix = '') {
      for await (const [name, entry] of directory.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'directory') {
          await visit(entry, path);
          continue;
        }
        const file = await entry.getFile();
        relativePaths.set(file, path);
        const key = normalizeMediaPath(file.name);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(file);
      }
    }
    await visit(directoryHandle);
    state.mediaRelativePaths = relativePaths;
    state.mediaIndex = { byName };
  }

  async function restoreMediaDirectoryHandle(directoryHandle) {
    if (!directoryHandle) return false;
    try {
      const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        state.rememberedMediaDirectoryHandle = directoryHandle;
        syncMediaButton();
        return false;
      }
      state.mediaDirectoryHandle = directoryHandle;
      state.rememberedMediaDirectoryHandle = null;
      syncMediaButton();
      await indexMediaDirectory(directoryHandle);
      render();
      return true;
    } catch {
      state.mediaDirectoryHandle = null;
      state.rememberedMediaDirectoryHandle = directoryHandle;
      syncMediaButton();
      return false;
    }
  }

  async function uniqueMediaFileName(directoryHandle, fileName) {
    const extensionIndex = fileName.lastIndexOf('.');
    const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
    const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
    for (let suffix = 0; suffix < 10000; suffix += 1) {
      const candidate = suffix ? `${baseName} (${suffix + 1})${extension}` : fileName;
      try {
        await directoryHandle.getFileHandle(candidate);
      } catch (error) {
        if (error.name === 'NotFoundError' || error.name === 'TypeMismatchError') return candidate;
        throw error;
      }
    }
    throw new Error('Could not find an unused filename for this media item.');
  }

  function mediaFolderName() {
    const baseName = state.fileName.replace(/\.[^.]+$/, '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '');
    return `${baseName || 'Family Tree'}_Media`;
  }

  function syncMediaButton() {
    const hasFolder = Boolean(state.mediaDirectoryHandle || state.rememberedMediaDirectoryHandle || state.mediaFolderPicked);
    const helperDefault = !hasFolder && state.mediaHelper;
    setButtonContent(elements.mediaButton, 'folder', helperDefault || hasFolder ? 'Change media folder' : 'Select Media Folder');
    elements.mediaButton.title = helperDefault ? `Photos and PDFs are saved to "${state.mediaHelper.folder}" inside Primary Media Library. Click to choose a different folder.` : '';
    elements.mediaButton.classList.toggle('media-button-needed', !hasFolder && !state.mediaHelper);
  }

  async function chooseMediaDirectory(createNew = false) {
    if (typeof window.showDirectoryPicker !== 'function') {
      showToast('Saving to a folder requires a browser with local directory access, such as Edge or Chrome.');
      return;
    }
    try {
      const selectedDirectory = await window.showDirectoryPicker({ mode: 'readwrite' });
      const directoryHandle = createNew
        ? await selectedDirectory.getDirectoryHandle(mediaFolderName(), { create: true })
        : selectedDirectory;
      state.mediaDirectoryHandle = directoryHandle;
      state.rememberedMediaDirectoryHandle = null;
      syncMediaButton();
      await indexMediaDirectory(directoryHandle);
      render();
      await persistActiveSession();
      showToast(createNew ? `Media folder ready: ${mediaFolderName()}.` : 'Media folder selected for this tab.');
    } catch (error) {
      if (error.name !== 'AbortError') showToast('The media folder could not be opened for writing.');
    }
  }

  function showMediaFolderDialog() {
    if (state.rememberedMediaDirectoryHandle?.requestPermission) {
      const handle = state.rememberedMediaDirectoryHandle;
      handle.requestPermission({ mode: 'readwrite' }).then(async (permission) => {
        if (permission !== 'granted') {
          document.querySelector('#newMediaFolderName').textContent = mediaFolderName();
          elements.mediaFolderDialog.showModal();
          return;
        }
        state.mediaDirectoryHandle = handle;
        state.rememberedMediaDirectoryHandle = null;
        syncMediaButton();
        await indexMediaDirectory(handle);
        render();
        await persistActiveSession();
        showToast('Media folder access restored.');
      }).catch(() => {
        document.querySelector('#newMediaFolderName').textContent = mediaFolderName();
        elements.mediaFolderDialog.showModal();
      });
      return;
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      elements.mediaInput.click();
      return;
    }
    document.querySelector('#newMediaFolderName').textContent = mediaFolderName();
    elements.mediaFolderDialog.showModal();
  }

  async function probeMediaHelper() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const response = await fetch('/api/media-info', { cache: 'no-store' });
      const info = response.ok ? await response.json() : null;
      state.mediaHelper = info?.available ? {
        folder: info.folder, deletePaths: info.deletePaths === true,
        saveGedcom: info.saveGedcom === true, gedcomName: typeof info.gedcom === 'string' ? info.gedcom : ''
      } : null;
    } catch {
      state.mediaHelper = null;
    }
  }

  async function uploadToMediaHelper(file) {
    const response = await fetch('/api/media', {
      method: 'POST',
      headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
      body: file
    });
    if (!response.ok) throw new Error('Upload failed.');
    return (await response.json()).name;
  }

  async function loadHelperMedia() {
    if (!state.mediaHelper || state.mediaDirectoryHandle) return;
    const names = new Set();
    for (const paths of state.additionalMedia.values()) paths.forEach((name) => names.add(name));
    let loaded = false;
    for (const name of names) {
      if (resolveMediaFile(name)) continue;
      try {
        const response = await fetch(`/media/${encodeURIComponent(name)}`);
        if (!response.ok) continue;
        const blob = await response.blob();
        const helperFile = new File([blob], name, { type: blob.type });
        helperMediaFiles.add(helperFile);
        addFileToMediaIndex(helperFile, name);
        loaded = true;
      } catch {
        // The link stays; the file is picked up when the media folder is selected.
      }
    }
    if (loaded) render();
  }

  function mediaSaveMode() {
    if (state.mediaDirectoryHandle) return 'folder';
    if (state.mediaHelper) return 'helper';
    return typeof window.showDirectoryPicker === 'function' ? 'none' : 'unsupported';
  }

  function isSupportedMediaFile(file) {
    return isImageFile(file) || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  // Writes one file to the selected media folder or the local helper and returns the saved file name.
  async function storeMediaFile(file, mode, directoryHandle) {
    if (mode === 'folder') {
      const fileName = await uniqueMediaFileName(directoryHandle, file.name);
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      addFileToMediaIndex(await fileHandle.getFile(), fileName);
      return fileName;
    }
    if (mode === 'helper') {
      const fileName = await uploadToMediaHelper(file);
      const helperFile = new File([file], fileName, { type: file.type });
      helperMediaFiles.add(helperFile);
      addFileToMediaIndex(helperFile, fileName);
      return fileName;
    }
    throw new Error('No media folder is available.');
  }

  async function saveUploadedMedia(files) {
    const portraitPersonId = state.pendingPortraitReplacement;
    const replacePortrait = Boolean(portraitPersonId);
    const person = state.people.get(portraitPersonId || state.pendingUploadPersonId);
    const directoryHandle = state.mediaDirectoryHandle;
    const mode = mediaSaveMode();
    state.pendingUploadPersonId = null;
    state.pendingPortraitReplacement = null;
    elements.mediaUploadInput.value = '';
    if (!person) return;
    if (mode === 'none' || mode === 'unsupported') {
      showToast('Choose a writable media folder or run the local helper before uploading media.');
      return;
    }

    let savedCount = 0;
    let failedCount = 0;
    const addedPaths = new Set();
    for (const file of (replacePortrait ? files.slice(0, 1) : files)) {
      if (replacePortrait ? !isImageFile(file) : !isSupportedMediaFile(file)) {
        failedCount += 1;
        continue;
      }
      try {
        const fileName = await storeMediaFile(file, mode, directoryHandle);
        addedPaths.add(fileName);
        if (!person.mediaPaths.includes(fileName)) person.mediaPaths.push(fileName);
        const paths = state.additionalMedia.get(person.id) || [];
        if (!paths.includes(fileName)) paths.push(fileName);
        state.additionalMedia.set(person.id, paths);
        if (replacePortrait) {
          state.primaryMedia.set(person.id, fileName);
          state.mediaTypes.set(fileName, 'portrait');
        }
        savedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    if (savedCount) {
      // New files are appended after the "Show more" cut-off, so expand the list and highlight them.
      if (state.selectedId === person.id) {
        expandedMediaPersonId = person.id;
        justAddedMedia = { personId: person.id, paths: addedPaths };
      }
      render();
      if (replacePortrait) {
        const selectedHeroImage = elements.details.querySelector('.detail-monogram-photo');
        if (selectedHeroImage) selectedHeroImage.title = 'Click to view this photo larger';
      }
      justAddedMedia = null;
      elements.details.querySelector('.is-just-added')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const linked = saveAdditionalMedia();
      const primarySaved = replacePortrait ? savePrimaryMedia() : true;
      const typesSaved = replacePortrait ? saveMediaTypes() : true;
      await persistActiveSession();
      const linkStatus = linked && primarySaved && typesSaved ? 'Person links and portrait selection saved in this browser.' : 'Some media preferences will last only for this tab because browser storage is unavailable.';
      const destination = mode === 'folder'
        ? 'saved to the selected folder'
        : `saved to the helper's media folder (${state.mediaHelper.folder})`;
      showToast(replacePortrait
        ? `${savedCount} replacement portrait saved and set as the hero image. It was attached to ${person.name} and classified as Portrait. ${destination}. ${linkStatus}${failedCount ? ` ${failedCount} item${failedCount === 1 ? '' : 's'} could not be saved.` : ''}`
        : `${savedCount} media item${savedCount === 1 ? '' : 's'} ${destination}. ${linkStatus}${failedCount ? ` ${failedCount} item${failedCount === 1 ? '' : 's'} could not be saved.` : ''}`);
    } else if (failedCount) {
      render();
      showToast(`${failedCount} item${failedCount === 1 ? '' : 's'} could not be saved. Choose an image or PDF and try again.`);
    }
  }

  function primaryImageFor(person) {
    const preferredPath = state.primaryMedia.get(person.id);
    if (preferredPath) {
      const file = resolveMediaFile(preferredPath);
      if (file && isImageFile(file)) return { path: preferredPath, file };
    }
    for (const path of mediaPathsForPerson(person.id)) {
      const file = resolveMediaFile(path);
      if (file && isImageFile(file)) return { path, file };
    }
    return null;
  }

  let pendingUnlink = null;
  const helperMediaFiles = new WeakSet();

  // Removes matching FILE lines and OBJE pointers within lines[from, to); returns the number removed.
  // An embedded OBJE left with no other files is removed whole so no empty OBJE remains.
  function removeMediaReferences(lines, from, to, fileMatches, pointerMatches) {
    const blockEnd = (start, level) => {
      let end = start + 1;
      while (end < lines.length) {
        const field = parseGedcomField(lines[end]);
        if (field && field.level <= level) break;
        end += 1;
      }
      return end;
    };
    let removed = 0;
    for (let index = from; index < to; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.tag !== 'FILE' && field?.tag !== 'OBJE') continue;
      const pointer = field.tag === 'OBJE' ? splitXref(field.value) : '';
      if (field.tag === 'OBJE' ? !(pointer && pointerMatches(pointer)) : !fileMatches(field.value)) continue;
      let start = index;
      let end = blockEnd(index, field.level);
      if (field.tag === 'FILE') {
        let parentIndex = index - 1;
        while (parentIndex >= from) {
          const candidate = parseGedcomField(lines[parentIndex]);
          if (candidate && candidate.level < field.level) break;
          parentIndex -= 1;
        }
        const parent = parentIndex >= from ? parseGedcomField(lines[parentIndex]) : null;
        if (parent?.tag === 'OBJE' && parent.level === field.level - 1 && !splitXref(parent.value)) {
          const parentEnd = blockEnd(parentIndex, parent.level);
          const otherFile = lines.slice(parentIndex + 1, parentEnd).some((line) => {
            const sibling = parseGedcomField(line);
            return sibling?.tag === 'FILE' && sibling.level === field.level && !fileMatches(sibling.value);
          });
          if (!otherFile) { start = parentIndex; end = parentEnd; }
        }
      }
      lines.splice(start, end - start);
      to -= end - start;
      index = start - 1;
      removed += 1;
    }
    return removed;
  }

  function pendingEventBlock(pending) {
    if (pending.familyId) {
      const record = state.gedcomRecords.find((entry) => entry.tag === 'FAM' && entry.xref === pending.familyId);
      const start = record ? gedcomLineIndexOf(record.lines, pending.config.tag) : -1;
      return start < 0 ? null : { record, start, end: lifeEventBlockEnd(record.lines, start) };
    }
    const record = state.gedcomRecords.find((entry) => entry.tag === 'INDI' && entry.xref === pending.personId);
    const start = record ? findLifeEventStart(record.lines, pending.ordinal) : -1;
    return start < 0 ? null : { record, start, end: lifeEventBlockEnd(record.lines, start) };
  }

  function currentPendingEventMedia(pending) {
    if (pending.familyId) {
      const family = state.families.get(pending.familyId);
      return [...(family?.[pending.config.tag === 'DIV' ? 'divorce' : 'marriage']?.mediaPaths || [])];
    }
    const lifeEvent = state.people.get(pending.personId)?.events.find((entry) => entry.ordinal === pending.ordinal);
    return [...(lifeEvent?.mediaPaths || [])];
  }

  // Removes the link from the event being edited only; the file and any other links stay.
  function unlinkEventMedia(path) {
    const pending = state.pendingLifeEvent;
    const block = pending && pendingEventBlock(pending);
    if (!block) return false;
    const linkedFiles = mediaRecordFiles(state.gedcomRecords);
    const target = normalizeMediaPath(path);
    const fileMatches = (value) => normalizeMediaPath(value) === target;
    const lines = [...block.record.lines];
    if (!removeMediaReferences(lines, block.start + 1, block.end, fileMatches,
      (pointer) => (linkedFiles.get(pointer) || []).some(fileMatches))) return false;
    block.record.lines = lines;
    refreshAfterGedcomMutation(pending.personId);
    pending.existingMedia = currentPendingEventMedia(pending);
    return true;
  }

  // In helper mode a file is deletable when the helper served it, or when it sits directly in a picked folder
  // with the same name as the helper's folder (the helper also checks the file size before deleting).
  function canDeleteMediaFile(file) {
    const mode = mediaSaveMode();
    if (!file) return false;
    if (mode === 'folder') return true;
    if (mode !== 'helper') return false;
    if (helperMediaFiles.has(file)) return true;
    // Primary Media Library files are listed by the launcher, which can delete them by their path in the library.
    if (file.kinshipUrl && state.mediaHelper.deletePaths) return true;
    const segments = String(file.webkitRelativePath || '').split('/').filter(Boolean);
    return segments.length === 2 && segments[0] === state.mediaHelper.folder;
  }

  function mediaFileUsage(file) {
    const people = [...state.people.values()].filter((person) => person.mediaPaths.some((path) => resolveMediaFile(path) === file)).length;
    const familyEvents = [...state.families.values()].flatMap((family) => [family.marriage, family.divorce])
      .filter((lifeEvent) => lifeEvent?.mediaPaths.some((path) => resolveMediaFile(path) === file)).length;
    return { people, familyEvents };
  }

  // Deletes the file from the media folder, then removes every link to it in the tree.
  async function deleteMediaFileEverywhere(path, personId) {
    const file = resolveMediaFile(path);
    if (!canDeleteMediaFile(file)) throw new Error('This file cannot be deleted from here.');
    if (mediaSaveMode() === 'folder') {
      const segments = String(state.mediaRelativePaths.get(file) || file.name).split('/').filter(Boolean);
      let directory = state.mediaDirectoryHandle;
      for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
      await directory.removeEntry(segments.at(-1));
    } else {
      const request = file.kinshipUrl
        ? { name: file.name, path: state.mediaRelativePaths.get(file) || file.name }
        : { name: file.name, size: file.size };
      const response = await fetch('/api/media-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      if (!response.ok) {
        throw new Error(response.status === 405
          ? 'The local helper is out of date. Restart it to enable deleting files.'
          : response.status === 404 ? `"${file.name}" was not found in the helper's media folder.`
            : response.status === 409 ? `The "${file.name}" in the helper's media folder is a different file, so it was not deleted.`
              : 'The local helper could not delete the file.');
      }
    }

    const matchesFile = (value) => resolveMediaFile(value) === file;
    const linkedFiles = mediaRecordFiles(state.gedcomRecords);
    const deletedObjects = new Set([...linkedFiles].filter(([, paths]) => paths.every(matchesFile)).map(([xref]) => xref));
    let removedLinks = 0;
    const records = state.gedcomRecords.filter((record) => !(record.tag === 'OBJE' && deletedObjects.has(record.xref)));
    for (const record of records) {
      const lines = [...record.lines];
      const removed = removeMediaReferences(lines, 1, lines.length, matchesFile, (pointer) => deletedObjects.has(pointer));
      if (removed) { record.lines = lines; removedLinks += removed; }
    }
    const recordsChanged = removedLinks > 0 || records.length !== state.gedcomRecords.length;
    state.gedcomRecords = records;
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';

    let additionalChanged = false;
    for (const [id, paths] of [...state.additionalMedia]) {
      const remaining = paths.filter((item) => !matchesFile(item));
      if (remaining.length === paths.length) continue;
      additionalChanged = true;
      removedLinks += paths.length - remaining.length;
      if (remaining.length) state.additionalMedia.set(id, remaining);
      else state.additionalMedia.delete(id);
      const person = state.people.get(id);
      if (person) person.mediaPaths = person.mediaPaths.filter((item) => !matchesFile(item));
    }
    if (additionalChanged) saveAdditionalMedia();
    let primaryChanged = false;
    for (const [id, item] of [...state.primaryMedia]) {
      if (matchesFile(item)) { state.primaryMedia.delete(id); primaryChanged = true; }
    }
    if (primaryChanged) savePrimaryMedia();

    for (const [key, files] of state.mediaIndex.byName) {
      const remaining = files.filter((entry) => entry !== file);
      if (!remaining.length) state.mediaIndex.byName.delete(key);
      else if (remaining.length !== files.length) state.mediaIndex.byName.set(key, remaining);
    }
    if (state.mediaUrls.has(file)) {
      URL.revokeObjectURL(state.mediaUrls.get(file));
      state.mediaUrls.delete(file);
    }

    if (recordsChanged) refreshAfterGedcomMutation(personId);
    else render();
    return { name: file.name, removedLinks };
  }

  // Browsers never expose a folder's real disk path. Prefer an absolute path recorded in the GEDCOM,
  // then a path the user saved earlier; prompt only when neither exists.
  function openMediaFolderInTab(mediaPath, forcePrompt) {
    const folderName = state.mediaDirectoryHandle?.name || 'media';
    const storageKey = `kinship-atlas:media-path:${folderName}`;
    const recorded = String(mediaPath || '').trim().replace(/^["']|["']$/g, '');
    const recordedDir = /^(?:[a-z]:[\\/]|\\\\|\/\/|file:)/i.test(recorded) ? recorded.replace(/[\\/][^\\/]*$/, '') : '';
    let folderPath = forcePrompt ? '' : recordedDir;
    let saved = '';
    try { saved = localStorage.getItem(storageKey) || ''; } catch { }
    if (!folderPath && !forcePrompt) folderPath = saved;
    if (!folderPath) {
      const entered = window.prompt(`The full location of "${folderName}" isn't recorded in this GEDCOM and browsers can't read it. Enter the folder path once (for example D:\\Family History\\${folderName}); it is remembered. Shift+click the folder button to change it.`, saved);
      if (!entered || !entered.trim()) return;
      folderPath = entered.trim().replace(/^["']|["']$/g, '');
      try { localStorage.setItem(storageKey, folderPath); } catch { }
    }
    const normalized = folderPath.replaceAll('\\', '/').replace(/^file:\/+/i, '').replace(/\/*$/, '/');
    const opened = window.open(`file:///${encodeURI(normalized)}`, '_blank');
    if (!opened) showToast('The browser blocked the new tab. Allow pop-ups for this page and try again.');
  }

  async function revealMediaInExplorer(path, forcePrompt = false) {
    const file = resolveMediaFile(path);
    if (!file) return;
    if (!state.mediaHelper) {
      openMediaFolderInTab(path, forcePrompt);
      return;
    }
    try {
      const response = await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name })
      });
      if (!response.ok) throw new Error('not found');
    } catch {
      showToast(`File Explorer could not show "${file.name}". It may not be in the helper's media folder.`);
    }
  }

  function unlinkPersonMedia(personId, path) {
    const person = state.people.get(personId);
    if (!person) return;
    let additionalChanged = false;
    const addedPaths = state.additionalMedia.get(personId) || [];
    if (addedPaths.includes(path)) {
      const remaining = addedPaths.filter((item) => item !== path);
      if (remaining.length) state.additionalMedia.set(personId, remaining);
      else state.additionalMedia.delete(personId);
      additionalChanged = true;
    }

    let recordChanged = false;
    const personRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === personId);
    if (personRecord) {
      const linkedFiles = mediaRecordFiles(state.gedcomRecords);
      const target = normalizeMediaPath(path);
      const fileMatches = (value) => normalizeMediaPath(value) === target;
      recordChanged = removeMediaReferences(personRecord.lines, 1, personRecord.lines.length, fileMatches,
        (pointer) => (linkedFiles.get(pointer) || []).some(fileMatches)) > 0;
    }

    if (additionalChanged) saveAdditionalMedia();
    if (state.primaryMedia.get(personId) === path) {
      state.primaryMedia.delete(personId);
      savePrimaryMedia();
    }
    if (recordChanged) {
      refreshAfterGedcomMutation(personId);
    } else {
      person.mediaPaths = person.mediaPaths.filter((item) => item !== path);
      render();
    }
    showToast('Media unlinked from this person. The file remains in the media folder.');
  }

