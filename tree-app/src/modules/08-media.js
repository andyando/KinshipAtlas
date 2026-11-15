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

  function mediaUrl(file) {
    if (file.kinshipUrl) return file.kinshipUrl;
    if (!state.mediaUrls.has(file)) state.mediaUrls.set(file, URL.createObjectURL(file));
    return state.mediaUrls.get(file);
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
    ['document', 'Document'], ['family-photo', 'Family photo'], ['letter', 'Letter'],
    ['map-plan', 'Map / plan'], ['military-records', 'Military records'], ['newspaper', 'Newspaper'],
    ['other', 'Other'], ['portrait', 'Portrait'], ['unclassified', 'Unclassified'],
    ['wedding', 'Wedding'], ['will-probate', 'Will / Probate']
  ];
  const mediaTypeStorageKey = (storageKey) => `kinship-atlas:media-types:v1:${storageKey}`;

  // Shared "Classify" dropdown used by the person record's attached media and
  // the life-event media list, so both write the same media-type store as the
  // Media page.
  function mediaClassifyControl(mediaKey, label) {
    const wrapper = document.createElement('label');
    wrapper.className = 'media-classify';
    wrapper.textContent = 'Classify';
    const select = document.createElement('select');
    select.dataset.mediaTypeKey = mediaKey;
    select.setAttribute('aria-label', `Classify ${label}`);
    const current = state.mediaTypes.get(mediaKey) || 'unclassified';
    for (const [value, text] of mediaTypeOptions) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      option.selected = value === current;
      select.append(option);
    }
    select.addEventListener('change', () => {
      state.mediaTypes.set(mediaKey, select.value);
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
        if (typeof path === 'string' && validTypes.has(type)) types.set(path, type);
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
    'kinship-atlas:media-types:v1:'
  ];
  let helperSelections = null;
  const loadedSelectionKeys = new Set();
  let selectionSyncQueue = Promise.resolve(true);

