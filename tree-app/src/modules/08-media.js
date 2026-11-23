  // ---------------------------------------------------------------------------
  // 8. Media handling (index, storage, resolution)
  // ---------------------------------------------------------------------------

  function normalizeMediaPath(path) {
    return String(path || '').trim().replace(/^['"]|['"]$/g, '').replaceAll('\\', '/').replace(/\/+/g, '/').toLocaleLowerCase();
  }

  function resolveMediaFile(path) {
    if (!state.mediaIndex) return null;
    const segments = normalizeMediaPath(path).split('/').filter(Boolean);
    const candidates = state.mediaIndex.byName.get(segments.at(-1)) || [];
    if (candidates.length === 1) return candidates[0];

    let bestFile = null;
    let bestScore = 0;
    let tied = false;
    for (const file of candidates) {
      const fileSegments = normalizeMediaPath(state.mediaRelativePaths.get(file) || file.webkitRelativePath || file.name).split('/').filter(Boolean);
      let score = 0;
      while (score < segments.length && score < fileSegments.length && segments.at(-1 - score) === fileSegments.at(-1 - score)) score += 1;
      // An exact relative path (e.g. a new upload at the media folder root) wins over same-named files in subfolders.
      if (score === segments.length && score === fileSegments.length) return file;
      if (score > bestScore) {
        bestFile = file;
        bestScore = score;
        tied = false;
      } else if (score > 0 && score === bestScore) {
        tied = true;
      }
    }
    return bestScore && !tied ? bestFile : null;
  }

  function isImageFile(file) {
    return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name);
  }

  // A media item's address, with a version of its own, so a file that moved or
  // was replaced is fetched again rather than served from the browser's cache.
  function versionedMediaUrl(url, file) {
    if (!url) return url;
    const version = file && (file.size || file.lastModified) ? `${file.size}-${file.lastModified}` : '';
    if (!version || /[?&]v=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  }

  function mediaUrl(file) {
    if (file.kinshipUrl) return versionedMediaUrl(file.kinshipUrl, file);
    if (!state.mediaUrls.has(file)) state.mediaUrls.set(file, URL.createObjectURL(file));
    return state.mediaUrls.get(file);
  }

  // Files that left the media folder (moved by "Organise media files" or deleted
  // as duplicates) drop out of the index when the folder is re-read, because the
  // index is rebuilt only from the files that are there now.
  function pruneMediaIndex(byName, relativePaths) {
    state.mediaIndex = { byName };
    state.mediaRelativePaths = relativePaths;
  }

  function releaseMediaUrls() {
    for (const url of state.mediaUrls.values()) URL.revokeObjectURL(url);
    state.mediaUrls.clear();
  }

  async function primaryMediaStorageKey(file, text) {
    try {
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `kinship-atlas:primary-media:v1:${hash}`;
      }
    } catch { }
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `kinship-atlas:primary-media:v1:${file.name}:${file.size}:${(hash >>> 0).toString(16)}`;
  }

  function mediaPathsForPerson(personId) {
    const person = state.people.get(personId);
    if (!person) return [];
    const paths = [...person.mediaPaths];
    const familyIds = new Set([...person.parentFamilyIds, ...person.spouseFamilyIds]);
    for (const familyId of familyIds) {
      const family = state.families.get(familyId);
      if (!family) continue;
      for (const event of [family.marriage, family.divorce]) paths.push(...(event?.mediaPaths || []));
    }
    return [...new Set(paths)];
  }

  // Chooses the photo shown as a person's hero image when none has been picked in
  // this app yet: an image inside the person's own media folder, preferring one
  // classified as Portrait, then any image linked to the person. Only files
  // linked to the person are returned, so a hero image always has a link it can
  // fall back on when the person's media is replaced.
  function heroImageForPerson(person) {
    if (!person || !state.mediaIndex) return '';
    const folderName = mediaPersonFolderName(person.id).toLocaleLowerCase();
    const linked = [...new Set(mediaPathsForPerson(person.id))];
    let best = '';
    let bestRank = 0;
    for (const path of linked) {
      const file = resolveMediaFile(path);
      if (!file || !isImageFile(file)) continue;
      const inOwnFolder = String(state.mediaRelativePaths.get(file) || '').split('/')[0].toLocaleLowerCase() === folderName;
      const portrait = state.mediaTypes.get(normalizeMediaPath(path)) === 'portrait';
      const rank = (inOwnFolder ? 2 : 0) + (portrait ? 1 : 0);
      if (rank > bestRank) {
        best = path;
        bestRank = rank;
      }
    }
    return best;
  }

  // True when the hero image picked for a person is no longer one of their linked files.
  function heroImageIsStale(personId) {
    const current = state.primaryMedia.get(personId);
    if (!current) return false;
    return !state.mediaIndex || !mediaPathsForPerson(personId).includes(current);
  }

  function loadPrimaryMedia(storageKey, people) {
    const primaryMedia = new Map();
    try {
      const saved = readSelection(storageKey) || {};
      for (const [personId, path] of Object.entries(saved)) {
        if (typeof path === 'string' && people.has(personId) && mediaPathsForPerson(personId).includes(path)) primaryMedia.set(personId, path);
      }
    } catch { }
    return primaryMedia;
  }

  function savePrimaryMedia() {
    if (!state.primaryMediaKey) return false;
    return storeSelection(state.primaryMediaKey, Object.fromEntries(state.primaryMedia));
  }

  function loadAdditionalMedia(storageKey, people) {
    const additionalMedia = new Map();
    try {
      const saved = readSelection(`${storageKey}:additional-media:v1`) || {};
      for (const [personId, paths] of Object.entries(saved)) {
        const person = people.get(personId);
        if (!person || !Array.isArray(paths)) continue;
        const validPaths = [...new Set(paths.filter((path) => typeof path === 'string' && path && !/[\\/]/.test(path)))];
        if (!validPaths.length) continue;
        additionalMedia.set(personId, validPaths);
        for (const path of validPaths) if (!person.mediaPaths.includes(path)) person.mediaPaths.push(path);
      }
    } catch { }
    return additionalMedia;
  }

  function saveAdditionalMedia() {
    if (!state.primaryMediaKey) return false;
    return storeSelection(`${state.primaryMediaKey}:additional-media:v1`, Object.fromEntries(state.additionalMedia));
  }

  const mediaTypeOptions = [
    ['birth', 'Birth'], ['building-house', 'Building / house'], ['census', 'Census'],
    ['certificate', 'Certificate'], ['death', 'Death'], ['directory', 'Directory'],
    ['document', 'Document'], ['electoral-roll', 'Electoral roll'], ['family-photo', 'Family photo'],
    ['letter', 'Letter'], ['map-plan', 'Map / plan'], ['military-records', 'Military records'],
    ['newspaper', 'Newspaper'], ['other', 'Other'], ['petition', 'Petition'], ['portrait', 'Portrait'],
    ['unclassified', 'Unclassified'],
    ['wedding', 'Wedding'], ['will-probate', 'Will / Probate']
  ];
  const mediaTypeStorageKey = (storageKey) => `kinship-atlas:media-types:v1:${storageKey}`;
  const mediaFaceAnalysisKey = (storageKey) => `kinship-atlas:media-face-analysis:v2:${storageKey}`;

  // Face-scan cache, keyed by media path. Only new or changed files are scanned.
  // Card images and face scans are keyed by the GEDCOM hash, which only exists
  // after saving. Until then they live under the file name, so a freshly opened
  // media folder's selections are carried over once the key appears.
  function adoptUnsavedMediaSelections() {
    if (!state.primaryMediaKey) return;
    const unsavedKey = `kinship-atlas:primary-media:v1:${state.fileName}`;
    const legacyTypes = readSelection(mediaTypeStorageKey(unsavedKey));
    if (legacyTypes && typeof legacyTypes === 'object') {
      for (const [key, value] of Object.entries(legacyTypes)) {
        if (!state.mediaTypes.has(key)) state.mediaTypes.set(key, value);
      }
    }
    const legacyFaces = readSelection(mediaFaceAnalysisKey(unsavedKey));
    if (legacyFaces?.images && !state.mediaFaceAnalysis) state.mediaFaceAnalysis = legacyFaces;
  }

  function loadMediaFaceAnalysis() {
    if (!state.primaryMediaKey) return { version: 1, images: {} };
    const saved = readSelection(mediaFaceAnalysisKey(state.primaryMediaKey));
    return saved && saved.version === 2 && saved.images && typeof saved.images === 'object'
      ? saved
      : { version: 2, images: {} };
  }

  function saveMediaFaceAnalysis() {
    const analysis = state.mediaFaceAnalysis;
    if (!analysis || !state.primaryMediaKey) return false;
    const saved = storeSelection(mediaFaceAnalysisKey(state.primaryMediaKey), analysis);
    syncSelectionsToHelper();
    return saved;
  }

  // Shared "Classify" dropdown used by the person record's attached media and
  // the life-event media list, so both write the same media-type store as the
  // Media page. The key is always the normalised path, exactly what the Media
  // Library stores its classifications under, so a classification applied in
  // one place shows up in the other even when the GEDCOM spells the path
  // differently (an old install's absolute path, backslashes, capital letters).
  function mediaClassifyControl(mediaKey, label) {
    const key = normalizeMediaPath(mediaKey);
    const wrapper = document.createElement('label');
    wrapper.className = 'media-classify';
    wrapper.textContent = 'Classify';
    const select = document.createElement('select');
    select.dataset.mediaTypeKey = key;
    select.dataset.mediaTypeRawKey = mediaKey;
    select.setAttribute('aria-label', `Classify ${label}`);
    const current = state.mediaTypes.get(key)
      || state.mediaTypes.get(mediaKey)
      // A classification recorded under an earlier path spelling (the tree was
      // moved, or a duplicate person folder was merged away) still applies.
      || state.mediaTypes.get(`g:/tree-app/primary media library/${state.mediaHelper?.folder || ''}/${key}`.replace(/\/+/, '/'))
      || state.mediaTypes.get([...state.mediaTypes.keys()].find((stored) => stored.endsWith('/' + key) || key.endsWith('/' + stored)) || '')
      || 'unclassified';
    for (const [value, text] of mediaTypeOptions) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      option.selected = value === current;
      select.append(option);
    }
    select.addEventListener('change', () => {
      // Store under the normalised key, and drop any earlier alias so the two
      // spellings can never disagree.
      for (const stored of [...state.mediaTypes.keys()]) {
        if (stored === key) continue;
        const storedName = stored.split('/').pop();
        if (storedName === key.split('/').pop()) state.mediaTypes.delete(stored);
      }
      state.mediaTypes.set(key, select.value);
      if (!saveMediaTypes()) showToast('Classification saved for this tab only; browser storage is unavailable.');
    });
    wrapper.append(select);
    return wrapper;
  }

  function loadMediaTypes(storageKey) {
    const types = new Map();
    try {
      const saved = readSelection(mediaTypeStorageKey(storageKey)) || {};
      const validTypes = new Set(mediaTypeOptions.map(([value]) => value));
      for (const [path, type] of Object.entries(saved)) {
        if (typeof path !== 'string' || !validTypes.has(type)) continue;
        // A relative path (the Media Library's own key spelling) is kept as it
        // is; an absolute or backslashed spelling from an earlier install is
        // normalised, so both screens read one entry per file.
        if (/^([a-z]:[\\/]|\\\\|\/\/|file:)/i.test(path)) {
          const key = normalizeMediaPath(path);
          if (key && !types.has(key)) types.set(key, type);
        } else if (!types.has(path)) types.set(path, type);
      }
    } catch { }
    return types;
  }

  function saveMediaTypes() {
    if (!state.primaryMediaKey) return false;
    return storeSelection(mediaTypeStorageKey(state.primaryMediaKey), Object.fromEntries(state.mediaTypes));
  }

  // Card image, extra media and primary person choices live in localStorage, which is tied to the exact
  // origin (http://127.0.0.1:<port>) and browser. The local helper mirrors them to kinship-selections.json
  // beside the app so they survive moving or copying the app folder and switching browsers.
  const selectionKeyPrefixes = [
    'kinship-atlas:primary-media:v1:', 'kinship-atlas:primary-person:v1:',
    'kinship-atlas:media-types:v1:', 'kinship-atlas:hero-frame:'
  ];
  let helperSelections = null;
  const loadedSelectionKeys = new Set();
  let selectionSyncQueue = Promise.resolve(true);

