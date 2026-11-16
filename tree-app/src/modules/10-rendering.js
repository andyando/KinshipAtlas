  // ---------------------------------------------------------------------------
  // 10. Rendering (tree, roster, details, media library, reports)
  // ---------------------------------------------------------------------------

  function setLoaded(fileName, data, storageKey, gedcomText = '') {
    releaseMediaUrls();
    state.mediaIndex = null;
    state.mediaFolderPicked = false;
    state.mediaRelativePaths = new WeakMap();
    state.mediaDirectoryHandle = null;
    state.rememberedMediaDirectoryHandle = null;
    elements.mediaInput.value = '';
    elements.mediaButton.disabled = false;
    syncMediaButton();
    state.people = data.people;
    state.families = data.families;
    state.sources = data.sources;
    refreshDirectoryFilters(true);
    state.gedcomRecords = data.gedcomRecords;
    state.gedcomDirty = false;
    state.gedcomText = gedcomText || serializeGedcomRecords(data.gedcomRecords);
    state.gedcomSource = 'file';
    state.gedcomFileHandle = null;
    state.gedcomBaseHash = '';
    state.gedcomPickerDeclined = false;
    state.primaryMediaKey = storageKey;
    state.additionalMedia = loadAdditionalMedia(storageKey, state.people);
    state.primaryMedia = loadPrimaryMedia(storageKey, state.people);
    state.mediaTypes = loadMediaTypes(storageKey);
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';
    document.querySelector('#mediaLibrarySearch').value = '';
    document.querySelector('#mediaLibraryTypeFilter').value = '';
    state.fileName = fileName;
    loadPrimaryPerson();
    state.searchText = '';
    state.history = [];
    state.historyIndex = -1;
    elements.search.value = '';
    elements.search.disabled = false;
    elements.clear.disabled = false;
    document.querySelector('#importGedcomButton').disabled = false;
    elements.mapViewButton.disabled = false;
    elements.reportsButton.disabled = false;
    elements.mediaLibraryButton.disabled = false;
    document.querySelector('#viewSwitch').disabled = false;
    document.querySelector('#mediaLibraryMenuButton').disabled = false;
    document.querySelector('#birthCountryMenuButton').disabled = false;
    document.querySelector('#duplicateFinderMenuButton').disabled = false;
    document.querySelector('#duplicateRelationMenuButton').disabled = false;
    elements.printMapButton.disabled = false;
    elements.showSiblings.disabled = false;
    document.querySelector('#openGedcomLabel').hidden = true;
    state.zoom = 1;
    elements.zoomIn.disabled = false;
    elements.zoomOut.disabled = false;
    elements.zoomLabel.textContent = '100%';
    elements.treeLabel.textContent = fileName;
    elements.treeLabel.disabled = false;
    elements.peopleCount.textContent = state.people.size.toLocaleString();
    elements.loadStatus.textContent = 'TREE LOADED LOCALLY';
    elements.statusPip.classList.add('ready');
    syncGedcomSaveUi();
    const firstPerson = state.people.values().next().value;
    setFocus(firstPerson.id, true);
    renderRoster();
  }

  async function restoreActiveSession() {
    let session;
    try {
      session = await readActiveSession();
    } catch {
      return;
    }
    if (!session?.fileName || !session.gedcomText) return;
    try {
      const parsed = parseGedcom(session.gedcomText);
      const bundle = window.KINSHIP_PRIMARY;
      // Sessions saved before file saving existed did not record where the tree came from.
      const legacyPrimary = !session.gedcomSource && typeof bundle?.gedcomText === 'string' && bundle.gedcomName === session.fileName;
      const originalText = legacyPrimary ? bundle.gedcomText : session.gedcomText;
      const storageKey = session.primaryMediaKey
        || await primaryMediaStorageKey(new File([originalText], session.fileName, { type: 'text/plain' }), originalText);
      setLoaded(session.fileName, parsed, storageKey, session.gedcomText);
      state.gedcomSource = legacyPrimary ? 'primary' : session.gedcomSource || 'file';
      state.gedcomFileHandle = session.gedcomFileHandle || null;
      state.gedcomBaseHash = session.gedcomBaseHash || (legacyPrimary ? await sha256Hex(bundle.gedcomText) : '');
      state.gedcomDirty = Boolean(session.gedcomDirty);
      if (state.gedcomDirty) elements.loadStatus.textContent = 'UNSAVED CHANGES';
      syncGedcomSaveUi();
      await restoreMediaDirectoryHandle(session.mediaDirectoryHandle);
      if (session.selectedId && state.people.has(session.selectedId)) setFocus(session.selectedId, true);
    } catch {
      showToast('The saved browser session could not be restored. Choose the GEDCOM file again.');
    }
  }

  function markGedcomDirty() {
    state.gedcomDirty = true;
    state.gedcomText = serializeGedcomRecords(state.gedcomRecords);
    elements.loadStatus.textContent = 'UNSAVED CHANGES';
    persistActiveSession();
    syncGedcomSaveUi();
    // Edits come from a click, so the browser may still allow a permission or save-location prompt.
    saveGedcomFile({ interactive: Boolean(navigator.userActivation?.isActive), automatic: true });
  }

  async function sha256Hex(text) {
    if (!globalThis.crypto?.subtle) return '';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function gedcomSaveTarget() {
    if (state.gedcomSource === 'primary' && state.mediaHelper?.saveGedcom && state.mediaHelper.gedcomName === state.fileName) return 'primary';
    if (state.gedcomFileHandle && typeof state.gedcomFileHandle.createWritable === 'function') return 'handle';
    return typeof window.showSaveFilePicker === 'function' ? 'picker' : 'download';
  }

  function syncGedcomSaveUi() {
    const button = document.querySelector('#saveGedcomButton');
    const label = state.gedcomSaving ? 'Saving…' : state.gedcomDirty ? 'Save to GEDCOM' : 'Saved';
    if (button) {
      button.hidden = !state.fileName;
      button.disabled = state.gedcomSaving || !state.gedcomDirty;
      button.classList.toggle('is-dirty', state.gedcomDirty && !state.gedcomSaving);
      setButtonContent(button, state.gedcomDirty || state.gedcomSaving ? 'save' : 'saved', label);
      button.title = state.gedcomDirty ? `Write the unsaved changes to ${state.fileName}` : `All changes are saved to ${state.fileName}`;
    }
    for (const recordButton of document.querySelectorAll('[data-save-gedcom]')) {
      recordButton.hidden = !state.gedcomDirty;
      recordButton.disabled = state.gedcomSaving;
    }
  }

  function saveGedcomFile(options = {}) {
    const run = () => saveGedcomOnce(options);
    const result = state.gedcomSaveQueue.then(run, run);
    state.gedcomSaveQueue = result.catch(() => false);
    return result;
  }

  async function saveGedcomOnce({ interactive = false, automatic = false } = {}) {
    if (!state.fileName || !state.gedcomDirty || !state.gedcomRecords.length) return !state.gedcomDirty;
    const target = gedcomSaveTarget();
    if (automatic && (target === 'download' || (target === 'picker' && (!interactive || state.gedcomPickerDeclined)))) {
      showToast('Changes are not yet in a file. Click "Save to GEDCOM" at the top of the screen to save them.');
      return false;
    }
    const text = state.gedcomText || serializeGedcomRecords(state.gedcomRecords);
    state.gedcomSaving = true;
    syncGedcomSaveUi();
    let result = null;
    try {
      if (target === 'primary') result = await saveGedcomViaHelper(text, false);
      else if (target === 'handle') result = await saveGedcomViaHandle(state.gedcomFileHandle, text, interactive, false);
      else if (target === 'picker') result = await saveGedcomViaPicker(text);
      else result = saveGedcomViaDownload(text);
    } catch (error) {
      result = null;
      showToast(error?.message
        ? `The GEDCOM file could not be saved: ${error.message}`
        : 'The GEDCOM file could not be saved. Your changes are still kept in this browser.');
    } finally {
      state.gedcomSaving = false;
    }
    if (!result) {
      syncGedcomSaveUi();
      return false;
    }
    await finishGedcomSave(text);
    if (!automatic) showToast(result);
    return true;
  }

  async function saveGedcomViaHelper(text, overwrite) {
    const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Gedcom-Name': encodeURIComponent(state.fileName) };
    if (state.gedcomBaseHash) headers['X-Base-Sha256'] = state.gedcomBaseHash;
    if (overwrite) headers['X-Overwrite'] = '1';
    let response;
    try {
      response = await fetch('/api/gedcom-save', { method: 'POST', headers, body: text });
    } catch {
      throw new Error('Kinship Atlas.exe is not responding. Open it again, then click "Save to GEDCOM".');
    }
    if (response.status === 409 || (response.status === 400 && !state.gedcomBaseHash)) {
      const replace = window.confirm(`"${state.fileName}" in the Primary GEDCOM folder has been changed outside this tab since it was opened.\n\nReplace it with the tree shown here? The current file will be kept in Primary GEDCOM\\Backups.`);
      return replace ? saveGedcomViaHelper(text, true) : null;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `the helper returned ${response.status}.`);
    return `Saved to ${state.fileName}.${body.backup ? ` The previous version was kept in Primary GEDCOM\\Backups\\${body.backup}.` : ''}`;
  }

  async function saveGedcomViaHandle(handle, text, interactive, fresh) {
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && interactive) permission = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (permission !== 'granted') {
      showToast(`Changes are not yet saved. Click "Save to GEDCOM" and allow access to ${handle.name}.`);
      return null;
    }
    if (!fresh && state.gedcomBaseHash) {
      let current = null;
      try { current = await (await handle.getFile()).text(); } catch { }
      if (current !== null && await sha256Hex(current) !== state.gedcomBaseHash
        && !window.confirm(`"${handle.name}" has been changed outside this tab since it was opened.\n\nReplace it with the tree shown here?`)) return null;
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return `Saved to ${handle.name}.`;
  }

  async function saveGedcomViaPicker(text) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: state.fileName,
        types: [{ description: 'GEDCOM', accept: { 'text/plain': ['.ged', '.gedcom'] } }]
      });
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
      state.gedcomPickerDeclined = true;
      showToast('Not saved. Click "Save to GEDCOM" when you are ready to choose the file.');
      return null;
    }
    const message = await saveGedcomViaHandle(handle, text, true, true);
    if (message) {
      state.gedcomFileHandle = handle;
      state.gedcomSource = 'handle';
      state.gedcomPickerDeclined = false;
    }
    return message;
  }

  function saveGedcomViaDownload(text) {
    const url = URL.createObjectURL(new File([text], state.fileName, { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = state.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return `Downloaded ${state.fileName}. This browser cannot write to files directly, so replace your original GEDCOM with the downloaded copy.`;
  }

  async function finishGedcomSave(text) {
    state.gedcomBaseHash = await sha256Hex(text);
    if (state.gedcomText === text) {
      state.gedcomDirty = false;
      elements.loadStatus.textContent = 'SAVED TO FILE';
    }
    // Card images and extra media links are stored under a key derived from the file contents.
    const newKey = await primaryMediaStorageKey(new File([text], state.fileName, { type: 'text/plain' }), text);
    if (state.primaryMediaKey && newKey !== state.primaryMediaKey) {
      moveMediaSelections(newKey);
    }
    syncGedcomSaveUi();
    await persistActiveSession();
  }

  function setFocus(personId, replaceHistory = false) {
    if (!state.people.has(personId)) return;
    state.selectedId = personId;
    if (replaceHistory && state.historyIndex >= 0) {
      state.history[state.historyIndex] = personId;
    } else {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(personId);
      state.historyIndex = state.history.length - 1;
    }
    render();
    if (state.pedigreeMode) renderPedigreeView();
    elements.back.disabled = state.historyIndex <= 0;
    elements.forward.disabled = state.historyIndex >= state.history.length - 1;
    elements.viewport.scrollTop = 0;
  }

  function addPersonControl(container, personId, relation = '', navigation = {}) {
    const person = state.people.get(personId);
    if (!person) return;
    const node = document.createElement('div');
    node.className = 'person-node';
    const button = makeButton('', `person-card${person.sex === 'F' ? ' female' : ''}${relation === 'Partner' ? ' partner' : ''}`);
    button.dataset.personId = personId;
    button.dataset.generation = container.dataset.generation;
    button.setAttribute('aria-current', String(personId === state.selectedId));
    const canShiftUp = navigation.up && parentsOf(personId).length > 0;
    const canShiftDown = navigation.down && childrenOf(personId).length > 0;
    if (canShiftUp || canShiftDown) button.classList.add('has-generation-shifts');
    const primaryImage = primaryImageFor(person);
    if (primaryImage) {
      button.classList.add('has-photo');
      const photo = document.createElement('img');
      photo.className = 'card-photo';
      photo.src = mediaUrl(primaryImage.file);
      photo.alt = `${person.name} photo`;
      button.append(photo);
    }
    const relationLabel = document.createElement('span');
    relationLabel.className = 'card-relation';
    relationLabel.textContent = relation || (personId === state.selectedId ? 'Selected person' : 'Family member');
    const birthPlace = person.events.find((event) => event.type === 'BIRT')?.place || '';
    const nameLine = document.createElement('span');
    nameLine.className = 'card-name-line';
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = person.name;
    nameLine.append(name);
    const birthCountry = countryFlagForPlace(birthPlace);
    if (birthCountry) {
      const flag = document.createElement('span');
      flag.className = 'card-country-flag';
      const image = document.createElement('img');
      image.src = `flags/4x3/${birthCountry.file}`;
      image.alt = `Birth country: ${birthCountry.country}`;
      flag.title = birthCountry.country;
      flag.append(image);
      relationLabel.append(flag);
    }
    const years = document.createElement('span');
    years.className = 'card-years';
    years.textContent = lifespan(person);
    button.append(relationLabel, nameLine, years);
    if (birthPlace) {
      const place = document.createElement('span');
      place.className = 'card-place';
      place.textContent = birthPlace;
      place.title = `Born in ${birthPlace}`;
      button.append(place);
    }
    node.append(button);
    for (const [direction, enabled] of [['up', canShiftUp], ['down', canShiftDown]]) {
      if (!enabled) continue;
      const shiftButton = makeButton(direction === 'up' ? '↑' : '↓', `generation-shift generation-shift-${direction}`);
      shiftButton.dataset.personId = personId;
      shiftButton.dataset.treeShift = direction;
      shiftButton.setAttribute('aria-label', `Show one generation ${direction === 'up' ? 'above' : 'below'} through ${person.name}`);
      shiftButton.title = shiftButton.getAttribute('aria-label');
      node.append(shiftButton);
    }
    container.append(node);
  }

  function appendGeneration(canvas, label, generation, people, relation = '', navigation = {}, familyGroups = null) {
    if (!people.length) return null;
    const section = document.createElement('section');
    section.className = 'tree-generation';
    section.dataset.generation = String(generation);
    const heading = document.createElement('div');
    heading.className = 'generation-heading';
    heading.textContent = label;
    const nodes = document.createElement('div');
    nodes.className = 'generation-nodes';
    nodes.dataset.generation = String(generation);
    if (familyGroups) {
      for (const { familyId, people: members } of familyGroups) {
        const group = document.createElement('div');
        group.className = 'ancestor-couple';
        group.dataset.generation = String(generation);
        if (familyId) group.dataset.familyId = familyId;
        for (const person of members) addPersonControl(group, person.id, '', navigation);
        nodes.append(group);
      }
    } else {
      for (const person of people) addPersonControl(nodes, person.id, typeof relation === 'function' ? relation(person) : relation, navigation);
    }
    section.append(heading, nodes);
    canvas.append(section);
    return nodes;
  }

  // Shown after a default tree opens: nobody is selected until the user picks someone.
  function renderTreeWelcome() {
    elements.canvas.replaceChildren();
    const welcome = document.createElement('div');
    welcome.className = 'welcome-state tree-welcome';
    welcome.innerHTML = '<div class="welcome-art" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="welcome-node node-a"></span><span class="welcome-node node-b"></span><span class="welcome-node node-c"></span><span class="welcome-node node-d"></span><span class="welcome-node node-e"></span><span class="welcome-stem stem-a"></span><span class="welcome-stem stem-b"></span><span class="welcome-stem stem-c"></span><span class="welcome-stem stem-d"></span></div><div class="eyebrow">WELCOME</div><h2></h2><p></p><span class="welcome-note">Use the search box or directory on the left to choose a person, or switch to Map View to see where everyone lived.</span>';
    welcome.querySelector('h2').textContent = 'Welcome to your family archive';
    welcome.querySelector('p').textContent = `${state.fileName} is open with ${state.people.size.toLocaleString()} ${state.people.size === 1 ? 'person' : 'people'}. Select someone to see their relationships.`;
    if (state.people.has(state.primaryPersonId)) {
      const homeMapButton = makeButton('Go to Home/Default Person in Tree', 'button button-secondary welcome-button welcome-home-map');
      homeMapButton.addEventListener('click', showPrimaryPersonRelationshipMap);
      welcome.insertBefore(homeMapButton, welcome.querySelector('.welcome-note'));
    }
    elements.canvas.append(welcome);
    elements.generationLabel.textContent = 'NO PERSON SELECTED';
    elements.graphSummary.textContent = `${state.people.size.toLocaleString()} IN TREE`;
  }

  function showTreeWelcome() {
    state.selectedId = null;
    state.history = [];
    state.historyIndex = -1;
    elements.back.disabled = true;
    elements.forward.disabled = true;
    elements.title.textContent = 'Welcome';
    elements.subtitle.textContent = 'Select a person from the directory to begin.';
    renderRoster();
    if (!state.mapMode) renderTreeWelcome();
    renderDetails();
  }

  function renderGraph() {
    const selected = state.people.get(state.selectedId);
    elements.canvas.replaceChildren();
    if (!selected) {
      if (state.people.size) renderTreeWelcome();
      return;
    }
    const descendants = generationLevels(selected.id, 'down', 2);
    const ancestors = generationLevels(selected.id, 'up', descendants.get(1)?.size ? 2 : 3);
    const partners = partnersOf(selected.id).map((item) => item.id);
    const siblingIds = new Set(state.showSiblings ? siblingsOf(selected.id) : []);
    const allIds = new Set([selected.id, ...partners, ...siblingIds]);
    for (const ids of [...ancestors.values(), ...descendants.values()]) ids.forEach((id) => allIds.add(id));
    const nodeKeys = new Set();

    const nameOrder = (ids) => sortedPeople(ids);
    // Keeps each generation grouped under (or above) the people it connects to, instead of sorting by name.
    const orderByRelatives = (ids, referenceRow, relatives) => {
      const remaining = new Set(ids);
      const ordered = [];
      for (const reference of referenceRow) {
        for (const id of relatives(reference.id)) {
          if (remaining.delete(id)) ordered.push(state.people.get(id));
        }
      }
      return [...ordered, ...nameOrder(remaining)].filter(Boolean);
    };
    const ancestorIds = (generation) => ancestors.get(generation) || new Set();
    const descendantIds = (generation) => descendants.get(generation) || new Set();
    const selectedAndPartners = nameOrder(new Set([selected.id, ...partners]));
    const coupleIds = new Set(selectedAndPartners.map((person) => person.id));
    const siblingsRow = nameOrder(new Set([...siblingIds].filter((id) => !coupleIds.has(id))));
    const rowZero = selectedAndPartners.length > 1 && selectedAndPartners[0].id === selected.id
      ? [...siblingsRow, ...selectedAndPartners]
      : [...selectedAndPartners, ...siblingsRow];
    const parentsRow = orderByRelatives(ancestorIds(-1), [selected], parentsOf);
    const grandparentsRow = orderByRelatives(ancestorIds(-2), parentsRow, parentsOf);
    const greatGrandparentsRow = orderByRelatives(ancestorIds(-3), grandparentsRow, parentsOf);
    const greatGrandparentGroups = [];
    const groupedFamilies = new Set();
    const groupedAncestors = new Set();
    for (const grandparent of grandparentsRow) {
      for (const familyId of grandparent.parentFamilyIds) {
        if (groupedFamilies.has(familyId)) continue;
        groupedFamilies.add(familyId);
        const family = state.families.get(familyId);
        if (!family) continue;
        const members = [...new Set([family.wifeId, family.husbandId])]
          .filter((id) => ancestorIds(-3).has(id)).map((id) => state.people.get(id));
        if (!members.length) continue;
        greatGrandparentGroups.push({ familyId, people: members });
        members.forEach((person) => groupedAncestors.add(person.id));
      }
    }
    for (const person of greatGrandparentsRow) {
      if (!groupedAncestors.has(person.id)) greatGrandparentGroups.push({ familyId: '', people: [person] });
    }
    const childrenRow = orderByRelatives(descendantIds(1), selectedAndPartners, childrenOf);
    const grandchildrenRow = orderByRelatives(descendantIds(2), childrenRow, childrenOf);
    const rows = [
      { generation: -3, label: 'Great-grandparents', people: greatGrandparentsRow, familyGroups: greatGrandparentGroups },
      { generation: -2, label: 'Grandparents', people: grandparentsRow },
      { generation: -1, label: 'Parents', people: parentsRow },
      { generation: 0, label: siblingIds.size ? 'Selected person, partners & siblings' : 'Selected person & partners', people: rowZero },
      { generation: 1, label: 'Children', people: childrenRow },
      { generation: 2, label: 'Grandchildren', people: grandchildrenRow }
    ];
    const visibleRows = rows.map((row) => {
      const people = [...row.people];
      if (!people.length && row.generation === 0) people.push(selected);
      return { ...row, people };
    }).filter((row) => row.people.length);
    const topGeneration = visibleRows[0].generation;
    const bottomGeneration = visibleRows.at(-1).generation;
    for (const row of visibleRows) {
      appendGeneration(elements.canvas, row.label, row.generation, row.people, row.generation === 0 ? (person) => siblingIds.has(person.id) ? 'Sibling' : '' : '', {
        up: row.generation === topGeneration,
        down: row.generation === bottomGeneration
      }, row.familyGroups);
      for (const person of row.people) nodeKeys.add(`${row.generation}|${person.id}`);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connector-layer');
    svg.setAttribute('aria-hidden', 'true');
    elements.canvas.prepend(svg);
    elements.generationLabel.textContent = `${visibleRows.length} GENERATIONS`;
    elements.graphSummary.textContent = `${allIds.size} PEOPLE IN VIEW · ${state.people.size.toLocaleString()} IN TREE`;
    requestAnimationFrame(() => drawConnectors(svg, nodeKeys, selected.id, partners));
  }

  function drawConnectors(svg, nodeKeys, selectedId, partners) {
    const canvas = elements.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const zoom = Number.parseFloat(getComputedStyle(canvas).zoom) || 1;
    const width = Math.max(canvas.scrollWidth, canvas.clientWidth);
    const height = Math.max(canvas.scrollHeight, canvas.clientHeight);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();



    function cardFor(generation, id) {
      return elements.canvas.querySelector(`.person-card[data-generation="${generation}"][data-person-id="${CSS.escape(id)}"]`);
    }
    function point(card, side) {
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        x: (rect.left - canvasRect.left + rect.width / 2) / zoom,
        y: (side === 'top' ? rect.top - canvasRect.top : rect.bottom - canvasRect.top) / zoom
      };
    }
    function appendPath(d, className) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', className);
      svg.append(path);
    }
    function rectPoint(card) {
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        left: (rect.left - canvasRect.left) / zoom,
        right: (rect.right - canvasRect.left) / zoom,
        top: (rect.top - canvasRect.top) / zoom,
        bottom: (rect.bottom - canvasRect.top) / zoom,
        x: (rect.left - canvasRect.left + rect.width / 2) / zoom,
        y: (rect.top - canvasRect.top + rect.height / 2) / zoom
      };
    }
    function drawMarriage(first, second) {
      if (!first || !second) return;
      if (Math.abs(first.y - second.y) < 2) {
        const left = first.x < second.x ? first : second;
        const right = first.x < second.x ? second : first;
        appendPath(`M ${left.right} ${left.y} H ${right.left}`, 'marriage-link');
      } else if (Math.abs(first.x - second.x) < 2) {
        const upper = first.y < second.y ? first : second;
        const lower = first.y < second.y ? second : first;
        appendPath(`M ${upper.x} ${upper.bottom} V ${lower.top}`, 'marriage-link');
      } else {
        const left = first.x < second.x ? first : second;
        const right = first.x < second.x ? second : first;
        const junctionX = (left.right + right.left) / 2;
        appendPath(`M ${left.right} ${left.y} H ${junctionX} V ${right.y} H ${right.left}`, 'marriage-link');
      }
    }

    for (const [familyId, family] of state.families) {
      for (const generation of [-3, -2, -1, 0, 1]) {
        const parentPoints = [family.husbandId, family.wifeId].filter(Boolean)
          .filter((parentId) => nodeKeys.has(`${generation}|${parentId}`))
          .map((parentId) => point(cardFor(generation, parentId), 'bottom'))
          .filter(Boolean);
        if (!parentPoints.length) continue;
        // One line from the couple's midpoint when both parents are shown.
        const couple = generation === -3
          ? elements.canvas.querySelector(`.ancestor-couple[data-family-id="${CSS.escape(familyId)}"]`) : null;
        const origin = couple ? point(couple, 'bottom') : {
          x: parentPoints.reduce((sum, item) => sum + item.x, 0) / parentPoints.length,
          y: Math.max(...parentPoints.map((item) => item.y))
        };
        for (const childId of family.childIds) {
          if (!nodeKeys.has(`${generation + 1}|${childId}`)) continue;
          const child = point(cardFor(generation + 1, childId), 'top');
          if (child) {
            const middle = (origin.y + child.y) / 2;
            appendPath(`M ${origin.x} ${origin.y} C ${origin.x} ${middle}, ${child.x} ${middle}, ${child.x} ${child.y}`, 'parent-link');
          }
        }
        if (family.marriage) {
          const husband = family.husbandId && nodeKeys.has(`${generation}|${family.husbandId}`)
            ? rectPoint(cardFor(generation, family.husbandId)) : null;
          const wife = family.wifeId && nodeKeys.has(`${generation}|${family.wifeId}`)
            ? rectPoint(cardFor(generation, family.wifeId)) : null;
          if (husband && wife) drawMarriage(husband, wife);
        }
      }
    }
  }

  function renderRoster() {
    const searchTerms = normalizeDirectoryName(state.searchText.trim()).split(/\s+/).filter(Boolean);
    const matches = [...state.people.values()].filter((person) => {
      const name = normalizeDirectoryName(person.name);
      if (!searchTerms.every((term) => name.includes(term))) return false;
      if (state.surnameFilter.size && !state.surnameFilter.has(normalizeDirectoryName(person.surname || 'Unknown surname'))) return false;
      if (!matchesOccupationType(person, state.directoryFilters.occupationType)) return false;
      for (const [eventType, countryFilter, minFilter, maxFilter] of [
        ['BIRT', 'birthCountry', 'birthMin', 'birthMax'], ['DEAT', 'deathCountry', 'deathMin', 'deathMax']
      ]) {
        const event = person.events.find((item) => item.type === eventType);
        const country = countryFlagForPlace(event?.place || '')?.country || '';
        const year = Number(yearFrom(event?.date || '')) || null;
        const selectedCountry = state.directoryFilters[countryFilter];
        if (selectedCountry && country !== selectedCountry) return false;
        const rangePrefix = eventType === 'BIRT' ? 'birth' : 'death';
        const bounds = state.directoryYearBounds[rangePrefix];
        const rangeActive = bounds && (state.directoryFilters[minFilter] > bounds.min || state.directoryFilters[maxFilter] < bounds.max);
        if (rangeActive && (!year || year < state.directoryFilters[minFilter] || year > state.directoryFilters[maxFilter])) return false;
      }
      return true;
    }).sort((a, b) => {
      const surnameOrder = (a.surname || '').localeCompare(b.surname || '', undefined, { sensitivity: 'base' });
      return surnameOrder || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    elements.peopleList.replaceChildren();
    state.directoryMatches = matches;
    elements.visibleCount.textContent = matches.length.toLocaleString();
    elements.clearSurnameFilter.hidden = !state.surnameFilter.size;
    refreshMapView();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = state.people.size ? 'No people match these filters.' : 'Open a GEDCOM to see people here.';
      elements.peopleList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    const groups = new Map();
    for (const person of matches) {
      const surname = person.surname || 'Unknown surname';
      const surnameKey = normalizeDirectoryName(surname);
      if (!groups.has(surnameKey)) groups.set(surnameKey, { surname, people: [] });
      groups.get(surnameKey).people.push(person);
    }
    for (const [surnameKey, { surname, people }] of groups) {
      const group = document.createElement('section');
      group.className = 'surname-group';
      const expanded = state.expandedSurnames.has(surnameKey) || searchTerms.length > 0;
      const header = document.createElement('div');
      header.className = 'surname-group-header';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'surname-group-check';
      check.dataset.surnameFilter = surnameKey;
      check.checked = state.surnameFilter.has(surnameKey);
      check.title = `Show only people with the surname ${surname}`;
      check.setAttribute('aria-label', `Show only ${surname}`);
      const toggle = makeButton('', 'surname-group-toggle');
      toggle.dataset.surnameToggle = surnameKey;
      toggle.setAttribute('aria-expanded', String(expanded));
      const indicator = document.createElement('span');
      indicator.className = 'surname-group-indicator';
      indicator.textContent = expanded ? '−' : '+';
      const label = document.createElement('span');
      label.className = 'surname-group-name';
      label.textContent = surname;
      const count = document.createElement('span');
      count.className = 'surname-group-count';
      count.textContent = String(people.length);
      toggle.append(indicator, label, count);
      header.append(check, toggle);
      group.append(header);
      const groupedPeople = document.createElement('div');
      groupedPeople.className = 'surname-group-people';
      groupedPeople.hidden = !expanded;
      for (const person of people) {
        const button = makeButton('', 'person-list-button');
        button.dataset.personId = person.id;
        button.setAttribute('aria-current', String(person.id === state.selectedId));
        const avatar = document.createElement('span');
        avatar.className = `roster-avatar${person.sex === 'F' ? ' female' : person.sex ? '' : ' unknown'}`;
        avatar.textContent = initials(person.name);
        const name = document.createElement('span');
        name.className = 'roster-name';
        name.textContent = person.name;
        const dates = document.createElement('span');
        dates.className = 'roster-years';
        dates.textContent = lifespan(person).replace(' — ', '–');
        button.append(avatar, name, dates);
        groupedPeople.append(button);
      }
      group.append(groupedPeople);
      fragment.append(group);
    }
    elements.peopleList.append(fragment);
  }

  function countryOptionsFor(eventType) {
    return [...new Set([...state.people.values()].map((person) => {
      const place = person.events.find((event) => event.type === eventType)?.place || '';
      return countryFlagForPlace(place)?.country || '';
    }).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function yearsFor(eventType) {
    return [...new Set([...state.people.values()].map((person) => {
      const year = Number(yearFrom(person.events.find((event) => event.type === eventType)?.date || ''));
      return year || null;
    }).filter(Boolean))].sort((a, b) => a - b);
  }

  function populateCountryFilter(select, eventType) {
    const selected = select.value;
    select.replaceChildren(new Option('All countries', ''));
    for (const country of countryOptionsFor(eventType)) select.add(new Option(country, country));
    select.disabled = !state.people.size;
    select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
    state.directoryFilters[eventType === 'BIRT' ? 'birthCountry' : 'deathCountry'] = select.value;
  }

  function updateYearFilterLabel(prefix) {
    const min = state.directoryFilters[`${prefix}Min`];
    const max = state.directoryFilters[`${prefix}Max`];
    const years = yearsFor(prefix === 'birth' ? 'BIRT' : 'DEAT');
    elements[`${prefix}YearLabel`].textContent = min === years[0] && max === years.at(-1) ? 'All years' : `${min}–${max}`;
  }

  function handleYearFilterInput(prefix, changedEdge) {
    const minInput = elements[`${prefix}YearMin`];
    const maxInput = elements[`${prefix}YearMax`];
    let min = Number(minInput.value);
    let max = Number(maxInput.value);
    if (min > max) {
      if (changedEdge === 'min') max = min;
      else min = max;
    }
    minInput.value = String(min);
    maxInput.value = String(max);
    state.directoryFilters[`${prefix}Min`] = min;
    state.directoryFilters[`${prefix}Max`] = max;
    updateYearFilterLabel(prefix);
    renderRoster();
  }

  function setupYearFilter(eventType) {
    const prefix = eventType === 'BIRT' ? 'birth' : 'death';
    const minInput = elements[`${prefix}YearMin`];
    const maxInput = elements[`${prefix}YearMax`];
    const years = yearsFor(eventType);
    if (!years.length) {
      state.directoryYearBounds[prefix] = null;
      minInput.disabled = true;
      maxInput.disabled = true;
      state.directoryFilters[`${prefix}Min`] = null;
      state.directoryFilters[`${prefix}Max`] = null;
      elements[`${prefix}YearLabel`].textContent = 'No years recorded';
      return;
    }
    const min = years[0];
    const max = years.at(-1);
    state.directoryYearBounds[prefix] = { min, max };
    minInput.min = maxInput.min = String(min);
    minInput.max = maxInput.max = String(max);
    if (state.directoryFilters[`${prefix}Min`] === null) state.directoryFilters[`${prefix}Min`] = min;
    if (state.directoryFilters[`${prefix}Max`] === null) state.directoryFilters[`${prefix}Max`] = max;
    state.directoryFilters[`${prefix}Min`] = Math.max(min, Math.min(max, state.directoryFilters[`${prefix}Min`]));
    state.directoryFilters[`${prefix}Max`] = Math.max(state.directoryFilters[`${prefix}Min`], Math.min(max, state.directoryFilters[`${prefix}Max`]));
    minInput.value = String(state.directoryFilters[`${prefix}Min`]);
    maxInput.value = String(state.directoryFilters[`${prefix}Max`]);
    minInput.disabled = false;
    maxInput.disabled = false;
    updateYearFilterLabel(prefix);
  }

  function refreshDirectoryFilters(reset = false) {
    if (reset) {
      state.directoryFilters = { birthCountry: '', deathCountry: '', occupationType: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null };
      state.expandedSurnames.clear();
      state.surnameFilter.clear();
      elements.birthCountryFilter.value = '';
      elements.deathCountryFilter.value = '';
      elements.occupationTypeFilter.value = '';
    }
    populateCountryFilter(elements.birthCountryFilter, 'BIRT');
    populateCountryFilter(elements.deathCountryFilter, 'DEAT');
    populateOccupationFilter();
    setupYearFilter('BIRT');
    setupYearFilter('DEAT');
  }

  function section(title) {
    const wrapper = document.createElement('section');
    wrapper.className = 'detail-section';
    const heading = document.createElement('h3');
    heading.className = 'detail-section-title';
    heading.textContent = title;
    wrapper.append(heading);
    return wrapper;
  }

  const relationGroupTypes = { Parents: 'PARENT', Siblings: 'SIBLING', 'Partners / spouses': 'PARTNER', Children: 'CHILD' };
  const relationAddTitles = { PARENT: 'Add a parent', SIBLING: 'Add a sibling', PARTNER: 'Add a partner', CHILD: 'Add a child' };

  function addRelationGroup(parent, label, items) {
    const group = document.createElement('div');
    group.className = 'relation-group';
    const heading = document.createElement('div');
    heading.className = 'relation-label';
    heading.textContent = label;
    const list = document.createElement('div');
    list.className = 'relation-list';
    const groupType = relationGroupTypes[label];
    if (!items.length) {
      const empty = makeButton('Not recorded', 'relation-button empty relation-add');
      empty.dataset.addRelation = groupType;
      empty.title = `${relationAddTitles[groupType]} (not recorded)`;
      list.append(empty);
    } else {
      for (const item of items) {
        if (!item.id) {
          const unknown = makeButton(item.label, 'relation-button empty relation-add');
          unknown.dataset.addRelation = groupType;
          if (item.familyId) unknown.dataset.parentFamilyId = item.familyId;
          if (item.parentRole) unknown.dataset.parentRole = item.parentRole;
          unknown.title = item.parentRole
            ? `Add the missing ${item.parentRole === 'HUSB' ? 'father' : 'mother'}: create a new person or select an existing person`
            : relationAddTitles[groupType];
          list.append(unknown);
          continue;
        }
        const wrapper = document.createElement('span');
        wrapper.className = 'relation-item';
        const button = makeButton(item.label, 'relation-button');
        button.dataset.personId = item.id;
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'relation-detail';
          detail.textContent = item.detail;
          button.append(detail);
        }
        wrapper.append(button);
        if (item.familyId) {
          const edit = makeButton('✎', 'relation-edit');
          edit.dataset.editRelationship = groupType;
          edit.dataset.familyId = item.familyId;
          edit.dataset.otherId = item.id;
          edit.title = `Edit relationship with ${item.label}`;
          edit.setAttribute('aria-label', edit.title);
          wrapper.append(edit);
        }
        list.append(wrapper);
      }
    }
    group.append(heading, list);
    parent.append(group);
  }

  function relationshipGroups(person) {
    const parentFamilies = person.parentFamilyIds.map((id) => state.families.get(id)).filter(Boolean);
    const parents = [];
    const siblings = siblingFamiliesOf(person.id);
    for (const family of parentFamilies) {
      const present = [family.husbandId, family.wifeId].filter(Boolean);
      for (const id of present) if (state.people.has(id)) parents.push({ id, label: personName(id), familyId: family.id });
      for (const [parentRole, id] of [['HUSB', family.husbandId], ['WIFE', family.wifeId]]) {
        if (!id) parents.push({ id: '', label: 'Parent not identified', familyId: family.id, parentRole });
      }
    }
    const partners = partnersOf(person.id).map(({ id, family }) => ({
      id, label: personName(id), familyId: family.id
    }));
    const children = [];
    for (const familyId of person.spouseFamilyIds) {
      const family = state.families.get(familyId);
      if (!family) continue;
      for (const id of family.childIds) {
        if (state.people.has(id) && !children.some((child) => child.id === id)) children.push({ id, label: personName(id), familyId: family.id });
      }
    }
    return [
      ['Parents', parents], ['Siblings', [...siblings].map(([id, familyId]) => ({ id, label: personName(id), familyId }))],
      ['Partners / spouses', partners], ['Children', children]
    ];
  }

  function eventTitle(event) {
    if (event.type === 'EVEN' && event.detail) return cleanEventDisplayText(event.detail);
    return cleanEventDisplayText(eventNames[event.type] || event.type);
  }

  // Marriages live in FAM records, so they are gathered from the person's spouse families.
  function marriageEventsFor(person) {
    const result = [];
    for (const family of state.families.values()) {
      if (family.husbandId !== person.id && family.wifeId !== person.id) continue;
      const spouseId = family.husbandId === person.id ? family.wifeId : family.husbandId;
      const spouse = spouseId && state.people.has(spouseId) ? personName(spouseId) : '';
      for (const familyEvent of [family.marriage, family.divorce]) {
        if (!familyEvent) continue;
        result.push({
          ...familyEvent, ordinal: -1, familyId: family.id, spouseId,
          value: [spouse, familyEvent.detail && `(${familyEvent.detail})`].filter(Boolean).join(' ')
        });
      }
    }
    return result;
  }

  function renderEventMedia(lifeEvent) {
    const paths = lifeEvent.mediaPaths || [];
    if (!paths.length) return null;
    const visibleLimit = 4;
    const wrapper = document.createElement('div');
    wrapper.className = 'event-media';
    const label = document.createElement('span');
    label.className = 'event-media-label';
    label.textContent = `📎 ${paths.length} linked media`;
    wrapper.append(label);
    if (!state.mediaIndex) return wrapper;

    const strip = document.createElement('div');
    strip.className = 'event-media-strip';
    const items = [];
    let missing = 0;
    for (const path of paths) {
      const file = resolveMediaFile(path);
      if (!file) { missing += 1; continue; }
      const link = document.createElement('a');
      link.href = mediaUrl(file);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = file.name;
      if (isImageFile(file)) {
        link.className = 'event-media-thumb';
        const image = document.createElement('img');
        image.src = mediaUrl(file);
        image.alt = file.name;
        image.loading = 'lazy';
        link.append(image);
      } else {
        link.className = 'event-media-file';
        link.textContent = file.name;
      }
      link.hidden = items.length >= visibleLimit;
      items.push(link);
      strip.append(link);
    }
    if (items.length) wrapper.append(strip);
    if (items.length > visibleLimit) {
      const more = makeButton(`+${items.length - visibleLimit} more`, 'event-media-more');
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        const expanded = more.getAttribute('aria-expanded') !== 'true';
        items.slice(visibleLimit).forEach((item) => { item.hidden = !expanded; });
        more.setAttribute('aria-expanded', String(expanded));
        more.textContent = expanded ? 'Show less' : `+${items.length - visibleLimit} more`;
      });
      strip.append(more);
    }
    if (missing) {
      const note = document.createElement('span');
      note.className = 'event-media-missing';
      note.textContent = `${missing} not found in media folder`;
      wrapper.append(note);
    }
    return wrapper;
  }

  function renderEvents(person) {
    const events = [...person.events, ...marriageEventsFor(person)].sort((a, b) => {
      const aYear = Number(yearFrom(a.date)) || 9999;
      const bYear = Number(yearFrom(b.date)) || 9999;
      return aYear - bYear;
    });
    const eventSection = section('Life events');
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'event-detail';
      empty.textContent = 'No events recorded.';
      eventSection.append(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'event-list';
      for (const event of events) {
        const item = document.createElement('div');
        item.className = 'event-item';
        if (event.ordinal >= 0 || event.familyId) {
          item.classList.add('event-item-editable');
          if (event.familyId) { item.dataset.familyId = event.familyId; item.dataset.familyEvent = event.type; }
          else item.dataset.eventOrdinal = String(event.ordinal);
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
          item.title = 'Click to edit this event';
        }
        // Create icon for the event type
        const icon = document.createElement('span');
        icon.className = 'event-icon';
        
        // Map event types to appropriate SVG icons from buttonIcons
        const eventIconMap = {
          BIRT: 'birth',
          DEAT: 'death',
          BAPM: 'religion',
          CHR: 'religion',
          CHRA: 'religion',
          BURI: 'burial',
          CREM: 'burial',
          ADOP: 'userPlus',
          BARM: 'religion',
          BASM: 'religion',
          BLES: 'religion',
          CONF: 'religion',
          FCOM: 'religion',
          ORDN: 'religion',
          CENS: 'census',
          GRAD: 'education',
          RETI: 'occupation',
          PROB: 'document',
          WILL: 'document',
          SSN: 'document',
          RESI: 'residence',
          IMMI: 'immigration',
          EMIG: 'emigration',
          NATU: 'immigration',
          MARR: 'marriage',
          DIV: 'targetClear',
          OCCU: 'occupation',
          EDUC: 'education',
          MILT: 'military',
          RELI: 'religion',
          EVEN: 'calendarPlus'
        };
        // Typed EVEN records (e.g. TYPE Arrival / Departure) reuse the icon of their resolved type config.
        const evenConfig = event.type === 'EVEN' ? lifeEventConfigFor(event) : null;
        const iconType = eventIconMap[evenConfig && !evenConfig.custom ? evenConfig.key : event.type] || 'calendarPlus';
        
        // Create the SVG icon using existing createButtonIcon function
        const svg = createButtonIcon(iconType);
        icon.appendChild(svg);
        
        const marker = document.createElement('span');
        marker.className = `event-marker ${event.type === 'RESI' ? 'residence' : event.type === 'OCCU' ? 'occupation' : ['BIRT', 'DEAT'].includes(event.type) ? '' : 'other'}`;
        const body = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'event-label';
        label.textContent = eventTitle(event);
        const detail = document.createElement('div');
        detail.className = 'event-detail';
        detail.textContent = [event.date, event.place, event.value, ...event.notes]
          .map(cleanEventDisplayText).filter(Boolean).join(' · ') || 'Details not recorded';
        body.append(label, detail);
        const sourceIds = [...new Set(event.sources)];
        if (sourceIds.length) {
          const source = document.createElement('span');
          source.className = 'event-source';
          source.textContent = sourceIds.map((id) => {
            const title = cleanEventDisplayText(state.sources.get(id)?.title);
            return title ? `${id}: ${title}` : id;
          }).join(' · ');
          body.append(source);
        }
        const eventMedia = renderEventMedia(event);
        if (eventMedia) body.append(eventMedia);
        item.append(icon, marker, body);
        list.append(item);
      }
      eventSection.append(list);
    }
    return eventSection;
  }

  function renderKinship(person) {
    const primary = state.people.get(state.primaryPersonId);
    if (!primary) return null;
    const kinSection = section('Relationship to primary person');
    const summary = document.createElement('p');
    summary.className = 'kinship-summary';
    if (primary.id === person.id) {
      summary.textContent = `${person.name} is the primary person.`;
      kinSection.append(summary);
      return kinSection;
    }
    const graph = kinshipGraph();
    const result = describeKinship(graph, primary.id, person.id);
    if (result.term) {
      const term = document.createElement('strong');
      term.className = 'kinship-term';
      term.textContent = result.term;
      summary.append(`${person.name} is ${primary.name}'s `, term, '.');
    } else {
      summary.textContent = `${person.name} is not a blood relative or close in-law of ${primary.name} in the recorded tree.`;
    }
    kinSection.append(summary);

    const addPeople = (label, ids) => {
      const group = document.createElement('div');
      group.className = 'relation-group';
      const heading = document.createElement('div');
      heading.className = 'relation-label';
      heading.textContent = label;
      const list = document.createElement('div');
      list.className = 'relation-list';
      for (const id of ids) {
        const button = makeButton(personName(id), 'relation-button');
        button.dataset.personId = id;
        list.append(button);
      }
      group.append(heading, list);
      kinSection.append(group);
    };
    if (result.ancestors?.length) addPeople(result.ancestors.length === 1 ? 'Closest common ancestor' : 'Closest common ancestors', result.ancestors);
    if (result.via) addPeople('Connected through', [result.via]);

    const path = kinshipPath(graph, primary.id, person.id);
    if (!path) {
      const none = document.createElement('div');
      none.className = 'event-detail';
      none.textContent = `No recorded family links connect ${person.name} to ${primary.name}.`;
      kinSection.append(none);
    } else {
      const group = document.createElement('div');
      group.className = 'relation-group';
      const heading = document.createElement('div');
      heading.className = 'relation-label';
      heading.textContent = `Recorded path (${path.length} link${path.length === 1 ? '' : 's'})`;
      const list = document.createElement('div');
      list.className = 'kinship-path';
      const start = makeButton(primary.name, 'relation-button');
      start.dataset.personId = primary.id;
      list.append(start);
      for (const step of path) {
        const sex = state.people.get(step.id)?.sex;
        const label = document.createElement('span');
        label.className = 'kinship-step';
        label.textContent = `→ ${step.type === 'parent' ? genderedTerm(sex, 'father', 'mother', 'parent')
          : step.type === 'child' ? genderedTerm(sex, 'son', 'daughter', 'child') : 'spouse/partner'}`;
        const button = makeButton(personName(step.id), 'relation-button');
        button.dataset.personId = step.id;
        list.append(label, button);
      }
      group.append(heading, list);
      kinSection.append(group);
    }
    const note = document.createElement('div');
    note.className = 'event-source';
    note.textContent = 'Calculated from relationships recorded in this GEDCOM; confirm against sources before relying on it.';
    kinSection.append(note);
    return kinSection;
  }

  function primaryPersonStorageKey() {
    return state.fileName ? `kinship-atlas:primary-person:v1:${state.fileName}` : '';
  }

  function loadPrimaryPerson() {
    state.primaryPersonId = '';
    try {
      const saved = readSelection(primaryPersonStorageKey());
      if (saved?.id && state.people.has(saved.id)) state.primaryPersonId = saved.id;
    } catch { }
    syncPrimaryPersonBar();
  }

  function syncPrimaryPersonBar() {
    const primary = state.people.get(state.primaryPersonId);
    elements.primaryPersonBar.hidden = !primary;
    elements.primaryPersonName.textContent = primary ? primary.name : '';
    elements.primaryPersonName.title = primary ? primary.name : '';
    elements.primaryHomeButton.setAttribute('aria-current', String(Boolean(primary) && primary.id === state.selectedId));
  }

  function showPrimaryPersonRelationshipMap() {
    if (!state.people.has(state.primaryPersonId)) return;
    if (state.mediaLibraryMode) setMediaLibraryMode(false);
    if (state.reportsMode) setReportsMode(false);
    if (state.mapMode) setMapMode(false);
    setFocus(state.primaryPersonId);
  }

  function togglePrimaryPerson(personId) {
    const person = state.people.get(personId);
    if (!person) return;
    const clearing = state.primaryPersonId === personId;
    state.primaryPersonId = clearing ? '' : personId;
    const saved = storeSelection(primaryPersonStorageKey(), clearing ? null : { id: person.id, name: person.name });
    syncPrimaryPersonBar();
    renderDetails();
    refreshMapView();
    const suffix = saved ? '' : ' This browser could not remember it after closing.';
    showToast(clearing ? `Primary person cleared.${suffix}` : `${person.name} is now the primary person.${suffix}`);
  }

  function showCardImageChoices() {
    const mediaSection = elements.details.querySelector('.detail-media-section');
    if (!mediaSection) return;
    const showMore = mediaSection.querySelector('.media-show-more');
    if (showMore && showMore.getAttribute('aria-expanded') !== 'true') showMore.click();
    mediaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    mediaSection.classList.remove('is-choosing-card-image');
    void mediaSection.offsetWidth;
    mediaSection.classList.add('is-choosing-card-image');
    mediaSection.addEventListener('animationend', () => mediaSection.classList.remove('is-choosing-card-image'), { once: true });
    const current = mediaSection.querySelector('.media-primary-button.is-primary') || mediaSection.querySelector('.media-primary-button');
    current?.focus({ preventScroll: true });
    showToast('Select ☆ on an image to make it the card image.');
  }



  // Full-screen preview of the card image, opened by clicking the portrait.
  function showExpandedHeroImage(person) {
    const cardImage = primaryImageFor(person);
    if (!cardImage) return;
    const overlay = document.createElement('dialog');
    overlay.className = 'hero-expand-dialog';
    const img = document.createElement('img');
    img.className = 'hero-expand-image';
    img.src = mediaUrl(cardImage.file);
    img.alt = `${person.name} — enlarged card image`;
    img.style.maxWidth = '92vw';
    img.style.maxHeight = 'min(700px, 88vh)';
    const shrink = document.createElement('button');
    shrink.type = 'button';
    shrink.className = 'hero-expand-shrink';
    shrink.title = 'Shrink image back to normal size';
    shrink.setAttribute('aria-label', 'Shrink the image back to normal size');
    shrink.textContent = '⤡ Shrink';
    const close = () => { overlay.close(); overlay.remove(); };
    shrink.addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.append(img, shrink);
    document.body.append(overlay);
    overlay.showModal();
  }

  // --- Hero image reframing -------------------------------------------------
  // Stores how the card image sits inside its circular frame, per person, in
  // browser storage and the helper-backed selections file.
  function heroFrameStorageKey(personId) {
    return `kinship-atlas:hero-frame:${personId}`;
  }

  function loadHeroFrameState(personId, fileName) {
    const saved = readSelection(heroFrameStorageKey(personId));
    if (saved && saved.file === fileName && typeof saved.scale === 'number') return saved;
    return null;
  }

  function saveHeroFrameState(personId, framing) {
    return storeSelection(heroFrameStorageKey(personId), framing);
  }

  function createHeroFrameRenderer(framing) {
    const cropSize = 0.84;
    const clamp = () => {
      framing.scale = Math.min(3, Math.max(1, Number(framing.scale) || 1));
      const maxOffset = Math.max(0, (framing.scale - cropSize) / 2);
      framing.x = Math.min(maxOffset, Math.max(-maxOffset, Number(framing.x) || 0));
      framing.y = Math.min(maxOffset, Math.max(-maxOffset, Number(framing.y) || 0));
    };
    const paint = (img, scale, translateScale) => {
      if (!img) return;
      img.style.transformOrigin = 'center';
      img.style.transform = `translate(${framing.x * translateScale * 100}%, ${framing.y * translateScale * 100}%) scale(${framing.scale * scale})`;
    };
    clamp();
    return {
      paintHero(img) { paint(img, 1 / cropSize, 1 / cropSize); },
      paintHelper(img) { paint(img, 1, 1); },
      setOffset(dx, dy) {
        framing.x += dx;
        framing.y += dy;
        clamp();
      },
      zoomBy(direction) {
        framing.scale = Math.min(3, Math.max(1, framing.scale + direction * 0.2));
        clamp();
      },
      reset() { framing.x = 0; framing.y = 0; framing.scale = 1; },
      get state() { return { ...framing }; }
    };
  }

  // Bigger editor: shows the photo enlarged inside a square stage with a
  // dashed circular overlay showing the crop. Drag to pan, wheel or buttons
  // to zoom. "Apply & close" persists; Cancel discards the adjustments.
  function openHeroReframeEditor(person) {
    const cardImage = primaryImageFor(person);
    if (!cardImage) return;
    const saved = loadHeroFrameState(person.id, cardImage.file);
    const working = saved ? { ...saved } : { file: cardImage.file, x: 0, y: 0, scale: 1 };

    const dialog = document.createElement('dialog');
    dialog.className = 'hero-frame-editor';
    dialog.innerHTML = `
      <header>
        <h2>Reframe photo — ${person.name}</h2>
        <button type="button" class="dialog-close" aria-label="Close">&times;</button>
      </header>
      <p class="hero-frame-hint">Drag the photo or use the controls to choose what appears inside the circular hero frame. The dashed circle shows the exact crop.</p>
      <div class="hero-frame-stage">
        <img class="hero-frame-photo" alt="${person.name} — reframing preview">
        <div class="hero-frame-circle" aria-hidden="true"></div>
      </div>
      <div class="hero-frame-controls">
        <button type="button" class="hero-frame-replace">Replace portrait</button>
        <span class="hero-frame-controls-spacer"></span>
        <button type="button" class="hero-frame-zoom" data-zoom="out" aria-label="Zoom out">−</button>
        <span class="hero-frame-zoom-value">100%</span>
        <button type="button" class="hero-frame-zoom" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" class="hero-frame-reset">Reset</button>
      </div>
      <footer>
        <button type="button" class="button button-secondary hero-frame-cancel">Cancel</button>
        <button type="button" class="button hero-frame-apply">Apply &amp; close</button>
      </footer>`;

    const stage = dialog.querySelector('.hero-frame-stage');
    const img = dialog.querySelector('.hero-frame-photo');
    const zoomValue = dialog.querySelector('.hero-frame-zoom-value');
    const replaceButton = dialog.querySelector('.hero-frame-replace');
    const frameRenderer = createHeroFrameRenderer(working);
    img.src = mediaUrl(cardImage.file);

    const close = () => { dialog.close(); dialog.remove(); };
    replaceButton.disabled = mediaSaveMode() === 'none' || mediaSaveMode() === 'unsupported';
    replaceButton.title = replaceButton.disabled ? 'Select a writable media folder or use the local helper before replacing a portrait' : 'Upload and attach a new portrait image';
    replaceButton.addEventListener('click', () => {
      state.pendingPortraitReplacement = person.id;
      state.pendingUploadPersonId = null;
      close();
      elements.mediaUploadInput.accept = 'image/*';
      elements.mediaUploadInput.click();
    });

    const render = () => {
      frameRenderer.paintHelper(img);
      zoomValue.textContent = `${Math.round(working.scale * 100)}%`;
    };
    render();

    let dragging = null;
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = { x: event.clientX, y: event.clientY, offsetX: working.x, offsetY: working.y };
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const desiredX = dragging.offsetX + (event.clientX - dragging.x) / (rect.width || 1);
      const desiredY = dragging.offsetY + (event.clientY - dragging.y) / (rect.height || 1);
      frameRenderer.setOffset(desiredX - working.x, desiredY - working.y);
      render();
    });
    stage.addEventListener('pointerup', () => { dragging = null; });
    stage.addEventListener('pointercancel', () => { dragging = null; });

    const zoomStep = (direction) => {
      frameRenderer.zoomBy(direction);
      render();
    };
    dialog.querySelector('[data-zoom="in"]').addEventListener('click', () => zoomStep(1));
    dialog.querySelector('[data-zoom="out"]').addEventListener('click', () => zoomStep(-1));
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomStep(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    dialog.querySelector('.hero-frame-reset').addEventListener('click', () => {
      frameRenderer.reset();
      render();
    });

    dialog.querySelector('.hero-frame-cancel').addEventListener('click', close);
    dialog.querySelector('.dialog-close').addEventListener('click', close);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    dialog.querySelector('.hero-frame-apply').addEventListener('click', async () => {
      const stored = saveHeroFrameState(person.id, { ...frameRenderer.state, file: cardImage.file });
      close();
      renderDetails();
      const synced = await syncSelectionsToHelper();
      if (stored && synced) showToast('Photo framing saved.');
      else showToast('Photo framing could not be saved. Check browser storage and kinship-selections.json.');
    });

    document.body.append(dialog);
    dialog.showModal();
  }

  function makeHeroReframeButton(person) {
    const reframe = document.createElement('button');
    reframe.type = 'button';
    reframe.className = 'detail-monogram-reframe';
    reframe.title = 'Reframe photo (move, zoom and pan inside the circle)';
    reframe.setAttribute('aria-label', 'Reframe the card photo inside its circular frame');
    reframe.textContent = '⛶';
    reframe.addEventListener('click', (event) => {
      event.stopPropagation();
      openHeroReframeEditor(person);
    });
    return reframe;
  }

  function openHeroImageChooser(personId) {
    const person = state.people.get(personId);
    if (!person) return;

    if (!state.mediaIndex) {
      showToast('Link a media folder first to choose or add a card image.');
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'hero-image-chooser';
    dialog.innerHTML = `
      <form method="dialog">
        <header>
          <h2>Choose card image for ${person.name}</h2>
          <button type="submit" class="dialog-close" value="close" aria-label="Close">&times;</button>
        </header>
        <div class="chooser-content"></div>
        <footer>
          <button type="submit" class="button button-secondary" value="close">Cancel</button>
        </footer>
      </form>
    `;

    const content = dialog.querySelector('.chooser-content');
    const images = [];

    for (const path of person.mediaPaths) {
      const file = resolveMediaFile(path);
      if (file && isImageFile(file)) {
        images.push({ path, file });
      }
    }

    if (images.length === 0) {
      const note = document.createElement('p');
      note.className = 'chooser-empty';
      note.textContent = 'No attached images found. Add a photo to use as the card image.';
      content.append(note);
    } else {
      const grid = document.createElement('div');
      grid.className = 'chooser-grid';
      for (const { path, file } of images) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chooser-item';
        item.dataset.mediaPath = path;
        item.setAttribute('aria-label', `Use ${file.name} as card image`);
        const img = document.createElement('img');
        img.src = mediaUrl(file);
        img.alt = file.name;
        item.append(img);
        grid.append(item);
        item.addEventListener('click', () => {
          state.primaryMedia.set(personId, path);
          const saved = savePrimaryMedia();
          render();
          dialog.close();
          showToast(saved ? 'Card image set.' : 'Card image set for this tab; browser storage is unavailable.');
        });
      }
      content.append(grid);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'chooser-add-button';
    addButton.textContent = '+ Add new photo or PDF';
    addButton.addEventListener('click', () => {
      state.pendingUploadPersonId = personId;
      dialog.close();
      elements.mediaUploadInput.click();
    });
    content.append(addButton);

    document.body.append(dialog);
    dialog.showModal();

    dialog.addEventListener('close', () => dialog.remove());
  }

  function personHeaderCountries(person) {
    const birth = countryFlagForPlace(person.events.find((event) => event.type === 'BIRT')?.place);
    const death = countryFlagForPlace(person.events.find((event) => event.type === 'DEAT')?.place);
    const countries = [];
    if (birth) countries.push({ label: 'Birth country', ...birth });
    if (death && death.code !== birth?.code) countries.push({ label: 'Death country', ...death });
    return countries;
  }

  let lastDetailsPersonId = null;
  let expandedMediaPersonId = null;
  let justAddedMedia = null;

  function renderDetails() {
    const person = state.people.get(state.selectedId);
    elements.details.replaceChildren();
    // Re-renders for the same person (e.g. after an edit) keep their scroll position.
    if (state.selectedId !== lastDetailsPersonId) {
      elements.details.scrollTop = 0;
      lastDetailsPersonId = state.selectedId;
    }
    syncPrimaryPersonBar();
    if (!person) {
      const empty = document.createElement('div');
      empty.className = 'details-empty';
      const emblem = document.createElement('div'); emblem.className = 'details-emblem'; emblem.textContent = 'K';
      const kicker = document.createElement('div'); kicker.className = 'eyebrow'; kicker.textContent = 'PERSON RECORD';
      const title = document.createElement('h2'); title.textContent = 'No person selected';
      const note = document.createElement('p'); note.textContent = 'Details recorded in the source tree will appear here.';
      empty.append(emblem, kicker, title, note);
      elements.details.append(empty);
      return;
    }
    const hero = document.createElement('header');
    hero.className = 'detail-hero';
    const monogram = document.createElement('div'); monogram.className = 'detail-monogram';
    const cardImage = primaryImageFor(person);
    if (cardImage) {
      monogram.classList.add('has-photo');
      const crop = document.createElement('div');
      crop.className = 'detail-monogram-crop';
      const photo = document.createElement('img');
      photo.className = 'detail-monogram-photo';
      photo.src = mediaUrl(cardImage.file);
      photo.alt = `${person.name} card image`;
      const framing = loadHeroFrameState(person.id, cardImage.file) || { file: cardImage.file, x: 0, y: 0, scale: 1 };
      monogram.classList.add('hero-frame-applied');
      createHeroFrameRenderer(framing).paintHero(photo);
      photo.title = 'Click to view this photo larger';
      photo.addEventListener('click', (event) => {
        event.stopPropagation();
        showExpandedHeroImage(person);
      });
      const changeImage = document.createElement('button');
      changeImage.type = 'button';
      changeImage.className = 'detail-monogram-edit';
      changeImage.dataset.changeCardImage = person.id;
      changeImage.title = 'Choose a different card image';
      changeImage.setAttribute('aria-label', 'Choose a different card image from attached media');
      setButtonContent(changeImage, 'edit', '');
      crop.append(photo);
      monogram.append(crop, changeImage);
      monogram.append(makeHeroReframeButton(person));
    } else {
      monogram.textContent = initials(person.name);
      monogram.classList.add('detail-monogram-placeholder');
      monogram.title = 'Click to choose a card image from attached media or add a new photo';
      monogram.setAttribute('role', 'button');
      monogram.setAttribute('tabindex', '0');
      monogram.dataset.chooseHeroImage = person.id;
    }
    const kicker = document.createElement('div');
    kicker.className = 'eyebrow';
    kicker.textContent = 'PERSON RECORD';
    if (person.sex === 'M' || person.sex === 'F') {
      const sexIcon = document.createElement('span');
      sexIcon.className = 'person-sex-icon';
      sexIcon.setAttribute('aria-hidden', 'true');
      sexIcon.appendChild(createButtonIcon(person.sex === 'M' ? 'male' : 'female'));
      kicker.append(' ', sexIcon);
    }
    const title = document.createElement('h2'); title.textContent = person.name;
    const life = document.createElement('p'); life.className = 'detail-life'; life.textContent = lifespan(person);
    const id = document.createElement('span'); id.className = 'detail-id'; id.textContent = `GEDCOM @${person.id}@`;
    const portraitRow = document.createElement('div');
    portraitRow.className = 'detail-portrait-row';
    portraitRow.append(monogram);
    const countries = personHeaderCountries(person);
    if (countries.length) {
      const countryList = document.createElement('div');
      countryList.className = 'detail-countries';
      for (const country of countries) {
        const row = document.createElement('div');
        row.className = 'detail-country';
        const flag = document.createElement('img');
        flag.src = `flags/4x3/${country.file}`;
        flag.alt = '';
        const text = document.createElement('span');
        const label = document.createElement('span');
        label.className = 'detail-country-label';
        label.textContent = country.label;
        const name = document.createElement('span');
        name.textContent = country.country;
        text.append(label, name);
        row.append(flag, text);
        countryList.append(row);
      }
      portraitRow.append(countryList);
    }
    hero.append(portraitRow, kicker, title, life, id);
    const personActions = document.createElement('div');
    personActions.className = 'person-action-row';
    const iconButton = (icon, text, className = 'research-button') => {
      const button = makeButton('', className);
      setButtonContent(button, icon, text);
      return button;
    };
    const summaryEditButton = iconButton('edit', 'Edit person details');
    summaryEditButton.dataset.editPersonSummary = person.id;
    const addEventButton = iconButton('calendarPlus', 'Add Life Event');
    addEventButton.dataset.addLifeEvent = person.id;
    const addRelativeButton = iconButton('userPlus', 'Add relative');
    addRelativeButton.dataset.addRelative = person.id;
    personActions.append(summaryEditButton, addEventButton, addRelativeButton);
    const isPrimaryPerson = state.primaryPersonId === person.id;
    const primaryPersonButton = iconButton(isPrimaryPerson ? 'targetClear' : 'target', isPrimaryPerson ? 'Clear primary person' : 'Set as primary person', `research-button primary-person-toggle${isPrimaryPerson ? ' is-primary' : ''}`);
    primaryPersonButton.dataset.primaryPerson = person.id;
    primaryPersonButton.setAttribute('aria-pressed', String(isPrimaryPerson));
    primaryPersonButton.title = isPrimaryPerson
      ? 'Stop using this person as the primary person'
      : state.primaryPersonId ? `Replace ${personName(state.primaryPersonId)} as the primary person` : 'Show relationships to this person and add a Home Person button';
    personActions.append(primaryPersonButton);
    const printButton = iconButton('print', 'Print record');
    printButton.dataset.printPerson = person.id;
    printButton.title = 'Print this person record on A4 (attached media is left out)';
    personActions.append(printButton);
    const saveRecordButton = iconButton('save', 'Save to GEDCOM', 'research-button gedcom-save-record');
    saveRecordButton.dataset.saveGedcom = 'true';
    saveRecordButton.title = `Write the unsaved changes to ${state.fileName}`;
    saveRecordButton.hidden = !state.gedcomDirty;
    saveRecordButton.disabled = state.gedcomSaving;
    personActions.append(saveRecordButton);
    if (isRecordedDeceased(person)) {
      const researchButton = iconButton('search', 'Search Public Records');
      researchButton.dataset.publicRecordsSearch = person.id;
      researchButton.title = 'Search public record services for this person';
      researchButton.setAttribute('aria-label', 'Search Public Records');
      personActions.append(researchButton);
    }
    const deletePersonButton = iconButton('trash', 'Delete person', 'research-button person-delete-button');
    deletePersonButton.dataset.deletePerson = person.id;
    deletePersonButton.disabled = state.people.size < 2 || state.gedcomSaving;
    deletePersonButton.title = state.people.size < 2
      ? 'The only person in a tree cannot be deleted'
      : 'Remove this person and all links to them from the GEDCOM file';
    personActions.append(deletePersonButton);
    hero.append(personActions);
    elements.details.append(hero);
    const kinship = renderKinship(person);
    if (kinship) elements.details.append(kinship);
    const relationSection = section('Relationships');
    for (const [label, items] of relationshipGroups(person)) addRelationGroup(relationSection, label, items);
    elements.details.append(relationSection);
    elements.details.append(renderEvents(person));
    const sourceIds = [...new Set(person.sourceIds)];
    const sourceSection = section('Source references');
    if (!sourceIds.length) {
      const empty = document.createElement('div'); empty.className = 'event-detail'; empty.textContent = 'No person-level source references recorded.';
      sourceSection.append(empty);
    } else {
      const list = document.createElement('div'); list.className = 'source-list';
      for (const sourceId of sourceIds) {
        const chip = document.createElement('span'); chip.className = 'source-chip';
        const source = state.sources.get(sourceId);
        chip.textContent = source?.title ? `${sourceId} · ${source.title}` : sourceId;
        list.append(chip);
      }
      sourceSection.append(list);
    }
    elements.details.append(sourceSection);
    const media = renderMedia(person);
    if (media) elements.details.append(media);
  }

  function renderMedia(person) {
    const mediaSection = document.createElement('section');
    mediaSection.className = 'detail-section detail-media-section';
    const heading = document.createElement('h3');
    heading.className = 'detail-section-title';
    heading.textContent = `Attached media (${person.mediaPaths.length})`;
    mediaSection.append(heading);

    const actions = document.createElement('div');
    actions.className = 'media-actions';
    const saveMode = mediaSaveMode();
    if (saveMode !== 'unsupported') {
      const addButton = makeButton('Add photo or PDF', 'media-add-button');
      addButton.dataset.addMediaFor = person.id;
      addButton.disabled = saveMode === 'none';
      addButton.title = saveMode === 'folder'
        ? 'Add photo or PDF to the selected folder'
        : saveMode === 'helper'
          ? `Add photo or PDF; saved by the local helper to ${state.mediaHelper.folder}`
          : 'Select a media folder before adding files';
      actions.append(addButton);
    }
    mediaSection.append(actions);

    if (!person.mediaPaths.length) {
      const note = document.createElement('div');
      note.className = 'event-detail';
      note.textContent = 'No media attached yet.';
      mediaSection.append(note);
      return mediaSection;
    }

    if (!state.mediaIndex) {
      const note = document.createElement('div');
      note.className = 'event-detail';
      note.textContent = 'Link the media folder to view these files.';
      mediaSection.append(note);
      return mediaSection;
    }

    const makeRevealButton = (mediaPath) => {
      const revealButton = makeButton('📂', 'media-reveal-button');
      revealButton.dataset.revealMedia = mediaPath;
      revealButton.setAttribute('aria-label', 'Open the media folder in a new tab');
      revealButton.title = 'Open media folder in a new tab (Shift+click to change the saved path)';
      return revealButton;
    };
    const grid = document.createElement('div');
    grid.className = 'media-grid';
    mediaSection.append(grid);
    const mediaItems = [];
    const primaryImage = primaryImageFor(person);
    const linkedEvents = new Map();
    for (const lifeEvent of [...person.events, ...marriageEventsFor(person)]) {
      const year = yearFrom(lifeEvent.date);
      for (const mediaPath of lifeEvent.mediaPaths || []) {
        if (!linkedEvents.has(mediaPath)) linkedEvents.set(mediaPath, []);
        linkedEvents.get(mediaPath).push(`${eventTitle(lifeEvent)}${year ? ` ${year}` : ''}`);
      }
    }
    const mediaTitle = (file, mediaPath) => linkedEvents.has(mediaPath)
      ? `${file.name}\nLinked to: ${linkedEvents.get(mediaPath).join(', ')}`
      : file.name;
    let missing = 0;
    const markJustAdded = (item, path) => {
      if (justAddedMedia?.personId === person.id && justAddedMedia.paths.has(path)) item.classList.add('is-just-added');
    };
    for (const path of person.mediaPaths) {
      const file = resolveMediaFile(path);
      if (!file) {
        missing += 1;
        continue;
      }
      if (isImageFile(file)) {
        const item = document.createElement('div');
        item.className = 'media-image-item';
        const link = document.createElement('a');
        link.className = 'media-image-link';
        link.href = mediaUrl(file);
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = mediaTitle(file, path);
        const image = document.createElement('img');
        image.src = mediaUrl(file);
        image.alt = file.name;
        link.append(image);
        const isPrimary = primaryImage?.path === path;
        const primaryButton = makeButton(isPrimary ? '★' : '☆', `media-primary-button${isPrimary ? ' is-primary' : ''}`);
        primaryButton.dataset.personId = person.id;
        primaryButton.dataset.primaryMedia = path;
        primaryButton.setAttribute('aria-pressed', String(isPrimary));
        primaryButton.setAttribute('aria-label', isPrimary ? 'Primary card image' : 'Set as primary card image');
        primaryButton.title = isPrimary ? 'Primary card image' : 'Set as primary card image';
        const unlinkButton = makeButton('🗑', 'media-remove-button');
        unlinkButton.dataset.personId = person.id;
        unlinkButton.dataset.unlinkMedia = path;
        unlinkButton.setAttribute('aria-label', 'Unlink image from this person; file will remain in the media folder');
        unlinkButton.title = 'Unlink from person (file remains in folder)';
        item.append(link, primaryButton, unlinkButton);
        // Classify the file the same way the Media page does.
        item.append(mediaClassifyControl(path, file.name));
        markJustAdded(item, path);
        item.hidden = mediaItems.length >= 4;
        mediaItems.push(item);
        grid.append(item);
      } else {
        const item = document.createElement('div');
        item.className = 'media-file-item';
        const link = document.createElement('a');
        link.className = 'media-file-link';
        link.href = mediaUrl(file);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = file.name;
        link.title = mediaTitle(file, path);
        const unlinkButton = makeButton('🗑', 'media-remove-button');
        unlinkButton.dataset.personId = person.id;
        unlinkButton.dataset.unlinkMedia = path;
        unlinkButton.setAttribute('aria-label', 'Unlink media from this person; file will remain in the media folder');
        unlinkButton.title = 'Unlink from person (file remains in folder)';
        item.append(link, unlinkButton);
        item.append(mediaClassifyControl(path, file.name));
        markJustAdded(item, path);
        item.hidden = mediaItems.length >= 4;
        mediaItems.push(item);
        grid.append(item);
      }
    }
    if (mediaItems.length > 4) {
      let expanded = expandedMediaPersonId === person.id;
      const showMoreButton = makeButton('', 'media-show-more');
      const applyExpanded = () => {
        mediaItems.slice(4).forEach((item) => { item.hidden = !expanded; });
        showMoreButton.setAttribute('aria-expanded', String(expanded));
        showMoreButton.textContent = expanded ? 'Show less' : 'Show more';
      };
      applyExpanded();
      showMoreButton.addEventListener('click', () => {
        expanded = !expanded;
        expandedMediaPersonId = expanded ? person.id : null;
        applyExpanded();
      });
      mediaSection.append(showMoreButton);
    }
    if (missing === person.mediaPaths.length) {
      const note = document.createElement('div');
      note.className = 'event-detail';
      note.textContent = 'No referenced files were found in the selected folder.';
      mediaSection.append(note);
    } else if (missing) {
      const note = document.createElement('div');
      note.className = 'event-source';
      note.textContent = `${missing} referenced file${missing === 1 ? '' : 's'} not found.`;
      mediaSection.append(note);
    }
    return mediaSection;
  }

  function computeMediaLibraryCacheKey() {
    return `${state.gedcomRecords.length}:${state.people.size}:${state.families.size}:${state.gedcomDirty ? 'dirty' : 'clean'}`;
  }

  function getMediaLibraryEntries() {
    const cacheKey = computeMediaLibraryCacheKey();
    if (state.mediaLibraryCache && state.mediaLibraryCacheKey === cacheKey) {
      return state.mediaLibraryCache;
    }
    const entries = new Map();
    const entriesByFile = new Map();
    const ensureEntry = (path) => {
      if (!path) return null;
      const file = resolveMediaFile(path);
      const displayPath = file ? state.mediaRelativePaths.get(file) || file.name : path;
      const key = normalizeMediaPath(path);
      if (!key) return null;
      let entry = file ? entriesByFile.get(file) : null;
      if (!entry) entry = entries.get(key);
      if (!entry) {
        entry = { key, path: displayPath, file, aliases: new Set(), people: new Map(), events: new Set(), searchText: '' };
        entries.set(key, entry);
      }
      entry.aliases.add(key);
      if (file) entry.file = file;
      if (file) entriesByFile.set(file, entry);
      return entry;
    };
    const linkPerson = (path, personId, mediaPath = path, event = '') => {
      const entry = ensureEntry(path);
      if (!entry) return;
      const person = state.people.get(personId);
      if (person) {
        if (!entry.people.has(personId)) entry.people.set(personId, { person, path: mediaPath });
        if (event) entry.events.add(`${person.name} · ${event}`);
      }
    };
    const sourcePeople = new Map();
    const linkSourcePeople = (sourceIds, personIds) => {
      for (const sourceId of sourceIds || []) {
        if (!sourcePeople.has(sourceId)) sourcePeople.set(sourceId, new Set());
        for (const personId of personIds) if (state.people.has(personId)) sourcePeople.get(sourceId).add(personId);
      }
    };
    for (const person of state.people.values()) {
      linkSourcePeople(person.sourceIds, [person.id]);
      for (const event of person.events) linkSourcePeople(event.sources, [person.id]);
    }
    for (const family of state.families.values()) {
      const familyPeople = [family.husbandId, family.wifeId, ...(family.childIds || [])];
      linkSourcePeople(family.sourceIds, familyPeople);
      for (const event of [family.marriage, family.divorce]) linkSourcePeople(event?.sources, familyPeople);
    }
    const linkedPeopleForSource = (sourceId) => [...(sourcePeople.get(sourceId) || [])];
    const linkedFiles = mediaRecordFiles(state.gedcomRecords);

    for (const [objectId, paths] of linkedFiles) {
      for (const path of paths) ensureEntry(path);
    }

    for (const person of state.people.values()) {
      for (const path of person.mediaPaths) linkPerson(path, person.id, path);
      for (const event of person.events) {
        for (const path of event.mediaPaths || []) linkPerson(path, person.id, path, eventTitle(event));
      }
    }
    for (const family of state.families.values()) {
      const personIds = [family.husbandId, family.wifeId, ...(family.childIds || [])].filter((id) => state.people.has(id));
      for (const event of [family.marriage, family.divorce].filter(Boolean)) {
        for (const path of event.mediaPaths || []) {
          ensureEntry(path);
          for (const personId of personIds) linkPerson(path, personId, path, eventTitle(event));
        }
      }
    }

    for (const record of state.gedcomRecords) {
      const paths = new Set();
      for (const line of record.lines.slice(1)) {
        const field = parseGedcomField(line);
        if (field?.tag === 'FILE' && field.value.trim()) paths.add(field.value.trim());
        if (field?.tag === 'OBJE') {
          const objectPaths = linkedFiles.get(splitXref(field.value)) || [];
          for (const path of objectPaths) paths.add(path);
        }
      }
      if (!paths.size) continue;
      let personIds = [];
      let eventLabel = '';
      if (record.tag === 'INDI') {
        if (state.people.has(record.xref)) personIds = [record.xref];
      } else if (record.tag === 'FAM') {
        const family = state.families.get(record.xref);
        personIds = family ? [family.husbandId, family.wifeId, ...(family.childIds || [])].filter((id) => state.people.has(id)) : [];
      } else if (record.tag === 'SOUR') {
        personIds = linkedPeopleForSource(record.xref);
      }
      for (const path of paths) {
        ensureEntry(path);
        for (const personId of personIds) linkPerson(path, personId, path, eventLabel);
      }
    }
    const result = [...entries.values()].sort((a, b) => (a.file?.name || a.path).localeCompare(b.file?.name || b.path, undefined, { sensitivity: 'base' }));
    for (const entry of result) {
      const names = [...entry.people.values()].map(({ person }) => person.name).join(' ');
      entry.searchText = `${entry.file?.name || entry.path} ${names}`.toLocaleLowerCase();
    }
    state.mediaLibraryCache = result;
    state.mediaLibraryCacheKey = cacheKey;
    return result;
  }

  function renderMediaLibrary() {
    if (!state.people.size) {
      elements.mediaLibraryContent.replaceChildren();
      return;
    }
    document.querySelector('#mediaLibraryFileName').textContent = state.fileName;
    const search = document.querySelector('#mediaLibrarySearch').value.trim().toLocaleLowerCase();
    const selectedType = document.querySelector('#mediaLibraryTypeFilter').value;
    const allEntries = getMediaLibraryEntries();
    const entries = allEntries.filter((entry) => {
      const type = state.mediaTypes.get(entry.key) || 'unclassified';
      if (selectedType && type !== selectedType) return false;
      return !search || entry.searchText.includes(search);
    });
    const total = allEntries.length;
    document.querySelector('#mediaLibraryCount').textContent = `${entries.length.toLocaleString()} of ${total.toLocaleString()} items`;
    document.querySelector('#mediaLibrarySummary').textContent = `${total.toLocaleString()} media item${total === 1 ? '' : 's'} linked or referenced in this tree.`;
    elements.mediaLibraryContent.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'media-library-empty';
      empty.textContent = total ? 'No media matches these filters.' : 'No attached media was found in this GEDCOM.';
      elements.mediaLibraryContent.append(empty);
      return;
    }
    if (state.mediaLibraryRenderTimer) clearTimeout(state.mediaLibraryRenderTimer);
    let index = 0;
    const batchSize = 10;
    const fragment = document.createDocumentFragment();

    function renderBatch() {
      const end = Math.min(index + batchSize, entries.length);
      for (; index < end; index++) {
        const entry = entries[index];
        fragment.append(createMediaLibraryCard(entry));
      }
      elements.mediaLibraryContent.appendChild(fragment);
      if (index < entries.length) {
        state.mediaLibraryRenderTimer = requestIdleCallback(renderBatch, { timeout: 200 });
      } else {
        state.mediaLibraryRenderTimer = 0;
      }
    }
    renderBatch();
  }

  function createMediaLibraryCard(entry) {
    const card = document.createElement('article');
    card.className = 'media-library-card';
    card.dataset.mediaKey = entry.key;
    const preview = document.createElement('div');
    preview.className = 'media-library-preview';
    if (entry.file && isImageFile(entry.file)) {
      const link = document.createElement('a');
      link.href = mediaUrl(entry.file);
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('aria-label', `View ${entry.file.name}`);
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.src = mediaUrl(entry.file);
      image.alt = entry.file.name;
      link.append(image);
      preview.append(link);
    } else if (entry.file) {
      const link = document.createElement('a');
      link.className = 'media-library-document';
      link.href = mediaUrl(entry.file);
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open document';
      preview.append(link);
    } else {
      const missing = document.createElement('span');
      missing.className = 'media-library-missing';
      missing.textContent = 'File not found';
      preview.append(missing);
    }

    const details = document.createElement('div');
    details.className = 'media-library-details';
    const heading = document.createElement('h2');
    heading.textContent = entry.file?.name || entry.path.split(/[\\/]/).pop() || entry.path;
    heading.title = entry.path;
    const pathLabel = document.createElement('p');
    pathLabel.className = 'media-library-path';
    pathLabel.textContent = entry.path;
    details.append(heading, pathLabel);

    const typeLabel = document.createElement('label');
    typeLabel.className = 'media-library-type';
    typeLabel.textContent = 'Classify';
    const typeSelect = document.createElement('select');
    typeSelect.dataset.mediaTypeKey = entry.key;
    const currentType = state.mediaTypes.get(entry.key) || 'unclassified';
    for (const [value, label] of mediaTypeOptions) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === currentType;
      typeSelect.append(option);
    }
    typeSelect.addEventListener('change', () => {
      state.mediaTypes.set(entry.key, typeSelect.value);
      const saved = saveMediaTypes();
      const cardEl = elements.mediaLibraryContent.querySelector(`[data-media-key="${entry.key}"]`);
      if (cardEl) {
        const selectEl = cardEl.querySelector('[data-media-type-key]');
        if (selectEl) selectEl.value = typeSelect.value;
      }
      if (!saved) showToast('Classification saved for this tab only; browser storage is unavailable.');
    });
    typeLabel.append(typeSelect);
    details.append(typeLabel);

    const linked = document.createElement('div');
    linked.className = 'media-library-links';
    const linkedLabel = document.createElement('strong');
    linkedLabel.textContent = 'Linked people';
    linked.append(linkedLabel);
    const peopleList = document.createElement('div');
    peopleList.className = 'media-library-people';
    if (entry.people.size) {
      for (const { person, path } of [...entry.people.values()].sort((a, b) => a.person.name.localeCompare(b.person.name))) {
        const personLink = makeButton(person.name, 'media-library-person');
        personLink.dataset.mediaPerson = person.id;
        personLink.dataset.mediaPath = path;
        personLink.addEventListener('click', () => {
          setMediaLibraryMode(false);
          setFocus(person.id);
        });
        peopleList.append(personLink);
        const selected = state.primaryMedia.get(person.id);
        const primary = selected && (entry.file ? resolveMediaFile(selected) === entry.file : normalizeMediaPath(selected) === entry.key);
        if (primary) {
          const badge = document.createElement('span');
          badge.className = 'media-library-primary-badge';
          badge.textContent = 'Primary card image';
          peopleList.append(badge);
        }
        if (entry.events.size) {
          const eventNote = document.createElement('span');
          eventNote.className = 'media-library-event-note';
          eventNote.textContent = [...entry.events].filter((item) => item.startsWith(`${person.name} · `)).map((item) => item.slice(person.name.length + 3)).join(', ');
          if (eventNote.textContent) peopleList.append(eventNote);
        }
      }
    } else {
      const none = document.createElement('span');
      none.className = 'media-library-unlinked';
      none.textContent = 'No person link recorded';
      peopleList.append(none);
    }
    linked.append(peopleList);
    details.append(linked);

    const actions = document.createElement('div');
    actions.className = 'media-library-actions';
    if (entry.file && isImageFile(entry.file) && entry.people.size) {
      const primaryPerson = document.createElement('select');
      primaryPerson.className = 'media-library-primary-person';
      primaryPerson.setAttribute('aria-label', 'Person to assign this card image to');
      for (const { person } of entry.people.values()) {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name;
        primaryPerson.append(option);
      }
      const setPrimary = makeButton('Set as card image', 'media-library-primary-action');
      setPrimary.addEventListener('click', () => {
        const personId = primaryPerson.value;
        const path = entry.people.get(personId)?.path;
        if (!path) return;
        state.primaryMedia.set(personId, path);
        const saved = savePrimaryMedia();
        render();
        renderMediaLibrary();
        showToast(saved ? `${entry.file.name} is now ${state.people.get(personId)?.name}'s primary card image.` : 'Primary card image selected for this tab; browser storage is unavailable.');
      });
      actions.append(primaryPerson, setPrimary);
    }
    const deleteButton = makeButton('Delete file', 'media-library-delete');
    deleteButton.disabled = !canDeleteMediaFile(entry.file);
    deleteButton.title = deleteButton.disabled
      ? entry.file ? 'Select a writable media folder or use the local helper to delete files.' : 'The file is unavailable in the linked media folder.'
      : 'Permanently delete this file and remove its links from the GEDCOM.';
    deleteButton.addEventListener('click', () => openMediaLibraryDeleteDialog(entry));
    actions.append(deleteButton);
    details.append(actions);
    card.append(preview, details);
    return card;
  }

  let logoPersonId = null;
  let logoAngle = 0;

  function spinBrandMark() {
    const mark = document.querySelector('.brand-mark');
    if (!mark?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = logoAngle;
    const to = from + 45;
    logoAngle = to % 360;
    mark.getAnimations().forEach((animation) => animation.cancel());
    // Individual rotate/scale properties compose with the small-screen transform on .brand-mark.
    mark.style.rotate = `${logoAngle}deg`;
    mark.animate([
      { rotate: `${from}deg`, scale: '1', filter: 'drop-shadow(0 0 0 rgba(242,191,117,0))' },
      { rotate: `${from + 22.5}deg`, scale: '1.25', filter: 'drop-shadow(0 0 7px rgba(242,191,117,.85))', offset: 0.5 },
      { rotate: `${to}deg`, scale: '1', filter: 'drop-shadow(0 0 0 rgba(242,191,117,0))' }
    ], { duration: 650, easing: 'ease-in-out' });
  }

  function render() {
    if (state.reportsMode) renderReports();
    const person = state.people.get(state.selectedId);
    if (!person) { logoPersonId = null; return; }
    if (person.id !== logoPersonId) { logoPersonId = person.id; spinBrandMark(); }
    elements.title.textContent = person.name;
    const birth = person.events.find((event) => event.type === 'BIRT');
    const death = person.events.find((event) => event.type === 'DEAT');
    const summary = [];
    if (birth) summary.push(`Born ${[birth.date, birth.place].filter(Boolean).join(' · ') || 'date/place not recorded'}`);
    if (death) summary.push(`Died ${[death.date, death.place].filter(Boolean).join(' · ') || 'date/place not recorded'}`);
    elements.subtitle.textContent = summary.join('   /   ') || 'Birth and death details not recorded';
    renderRoster();
    if (state.mapMode) updateMapLabels(); else renderGraph();
    renderDetails();
  }

  function parseGedcomCoordinate(value) {
    const match = String(value || '').trim().match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i);
    if (!match) return null;
    const number = Number(match[2]);
    return /^[SW]$/i.test(match[1] || '') ? -number : number;
  }

  let mapInstance = null;

  function primaryBloodlines() {
    const empty = { all: new Set(), paternal: new Set(), maternal: new Set(), descendants: new Set() };
    if (!state.people.has(state.primaryPersonId)) return empty;
    const parents = new Map();
    const children = new Map();
    const fathers = new Set();
    const mothers = new Set();
    for (const family of state.families.values()) {
      for (const childId of family.childIds) {
        const pedigree = readPedigree(childId, family.id);
        if (pedigree && pedigree !== 'birth') continue;
        for (const parentId of [family.husbandId, family.wifeId]) {
          if (!state.people.has(parentId) || !state.people.has(childId)) continue;
          if (!parents.has(childId)) parents.set(childId, new Set());
          if (!children.has(parentId)) children.set(parentId, new Set());
          parents.get(childId).add(parentId);
          children.get(parentId).add(childId);
          if (childId === state.primaryPersonId) {
            if (parentId === family.husbandId) fathers.add(parentId);
            if (parentId === family.wifeId) mothers.add(parentId);
          }
        }
      }
    }
    const walk = (seeds, edges) => {
      const visited = new Set(seeds);
      const pending = [...seeds];
      while (pending.length) {
        for (const id of edges.get(pending.pop()) || []) {
          if (!visited.has(id)) { visited.add(id); pending.push(id); }
        }
      }
      return visited;
    };
    // Descend only from each side's ancestors, never from relatives' spouses.
    const paternal = walk(walk(fathers, parents), children);
    const maternal = walk(walk(mothers, parents), children);
    const descendants = walk([state.primaryPersonId], children);
    return { all: new Set([...paternal, ...maternal, ...descendants]), paternal, maternal, descendants };
  }

  function getMapInstance() {
    if (!mapInstance && window.KinshipMap) {
      mapInstance = window.KinshipMap.create({
        container: document.querySelector('#mapView'),
        getPeople: () => state.directoryMatches || [],
        placeEventsFor: (person) => [...person.events, ...marriageEventsFor(person)],
        getSelectedId: () => state.selectedId,
        getBloodlines: primaryBloodlines,
        bloodlineIcons: {
          bloodline: createButtonIcon('tree'),
          maternal: createButtonIcon('parentLeft'),
          paternal: createButtonIcon('parentRight'),
          descendants: createButtonIcon('descendants')
        },
        onStatsChange: (stats) => { state.mapStats = stats; updateMapLabels(); },
        onSelect: (id) => setFocus(id),
        describe: (person) => lifespan(person),
        eventLabel: (event) => eventTitle(event)
      });
    }
    return mapInstance;
  }

  function updateMapLabels() {
    if (!state.mapMode || !state.mapStats) return;
    const { placed, unplaced } = state.mapStats;
    elements.generationLabel.textContent = `${placed} ON MAP`;
    elements.graphSummary.textContent = `${placed} PLACED · ${unplaced} NOT PLACED · ${(state.directoryMatches || []).length} IN DIRECTORY`;
  }

  function refreshMapView() {
    if (!state.mapMode || !mapInstance) return;
    state.mapStats = mapInstance.refresh();
    updateMapLabels();
  }

  // Inline SVG icons use currentColor, so they render the same in every browser (no emoji or icon fonts).
  const buttonIcons = {
    map: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"/>',
    tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    parentLeft: '<circle cx="6" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><path d="M6 8v4h6v4M12 12h6V8"/><path d="M16 5h4"/>',
    parentRight: '<circle cx="18" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><path d="M18 8v4h-6v4M12 12H6V8"/><path d="M4 5h4"/>',
    descendants: '<circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 6v6M5 17v-5h14v5M9 9l3 3 3-3"/>',
    chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx=".5"/><rect x="10.5" y="5" width="3" height="13" rx=".5"/><rect x="16" y="8" width="3" height="10" rx=".5"/>',
    media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 20"/>',
    exit: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    update: '<path d="M20 7a9 9 0 0 0-15-1M4 17a9 9 0 0 0 15 1"/><path d="M20 3v4h-4M4 21v-4h4M12 8v8M9 13l3 3 3-3"/>',
    import: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8"/>',
    saved: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6M16 11h6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    targetClear: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/><path d="M9 8h6"/>',
    // Birth: a baby — round head with a hair curl, smile, and a swaddled body below.
    birth: '<circle cx="12" cy="8" r="4"/><path d="M12 4c.3-1.3 1.9-1.3 2-.1"/><path d="M10.8 9.4c.7.6 1.7.6 2.4 0"/><path d="M8 21v-2a4 4 0 0 1 8 0v2"/>',
    death: '<path d="M8 8a4 4 0 1 1 8 0v10H8V8z"/><path d="M12 8v4"/><path d="M10 10h4"/><path d="M6 21h12"/>',
    residence: '<path d="M3 11 12 4 21 11"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    marriage: '<circle cx="9" cy="12" r="4"/><circle cx="15" cy="12" r="4"/>',
    // Arrival / departure: a dart-shaped plane landing (nose down toward the runway)
    // or taking off (climbing away from it), with a ground line underneath.
    // Plane landing (plane-landing, Lucide) / taking off (plane-takeoff, Lucide).
    immigration: '<path d="M2 22h20"/><path d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z"/>',
    emigration: '<path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z"/>',
    burial: '<path d="M8 5h8l2 4v9l-2 1H8l-2-1V9z"/><path d="M10 5v14"/>',
    occupation: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5h6v2"/><path d="M3 12h18"/>',
    military: '<path d="M12 2l2.5 5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z"/>',
    education: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v4c0 2 3 4 6 4s6-2 6-4v-4"/>',
    census: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    dna: '<path d="M8 3c6 4 6 14 0 18"/><path d="M16 3c-6 4-6 14 0 18"/><path d="M9 7h6"/><path d="M8 12h8"/><path d="M9 17h6"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/>',
    document: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    religion: '<path d="M12 4v16"/><path d="M7 9h10"/>',
    // Gender signs: small circle low-left, stem/arrow extends up-right (♂) or a
    // stem with crossbar below the circle (♀). Scaled to the 24x24 view box.
    male: '<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M20 4h-5M20 4v5"/>',
    female: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>'
  };

  function createButtonIcon(icon) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'button-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = buttonIcons[icon];
    return svg;
  }

  function setButtonContent(button, icon, text) {
    const svg = createButtonIcon(icon);
    button.replaceChildren(svg, document.createTextNode(text));
  }

  function setMapMode(on) {
    const map = on ? getMapInstance() : mapInstance;
    if (on && !map) { showToast('The map component could not be loaded.'); return; }
    state.mapMode = on;
    setButtonContent(elements.mapViewButton, on ? 'tree' : 'map', on ? 'Relationship View' : 'Map View');
    elements.mapViewButton.setAttribute('aria-pressed', String(on));
    elements.viewport.classList.toggle('map-active', on);
    elements.canvas.hidden = on;
    document.querySelector('.main-panel').classList.toggle('map-mode', on);
    document.querySelector('#viewEyebrow').textContent = on ? 'WORLD MAP' : 'RELATIONSHIP MAP';
    document.querySelector('.graph-footer-right').textContent = on ? 'CLICK A PIN TO OPEN THAT PERSON' : 'SELECT A PERSON TO RECENTER';
    if (on) {
      state.mapStats = map.show();
      updateMapLabels();
    } else {
      map?.hide();
      if (state.people.size) renderGraph();
    }
    syncViewSwitch();
  }

  function setReportsMode(on) {
    if (on && !state.people.size) return;
    state.reportsMode = on;
    if (on && state.mediaLibraryMode) {
      state.mediaLibraryMode = false;
      elements.mediaLibraryView.hidden = true;
      elements.mediaLibraryButton.setAttribute('aria-pressed', 'false');
    }
    elements.reportsView.hidden = !on || state.mediaLibraryMode;
    elements.appShell.hidden = on || state.mediaLibraryMode;
    setButtonContent(elements.reportsButton, on ? 'tree' : 'chart', on ? 'Back to tree' : 'Reports');
    elements.reportsButton.setAttribute('aria-pressed', String(on));
    syncViewSwitch();
    if (on) {
      renderReports();
      elements.reportsView.scrollTop = 0;
    }
  }

  function setMediaLibraryMode(on) {
    if (on && !state.people.size) return;
    if (!on) {
      if (state.mediaLibraryRenderTimer) {
        cancelIdleCallback(state.mediaLibraryRenderTimer);
        state.mediaLibraryRenderTimer = 0;
      }
      clearTimeout(state.mediaLibrarySearchDebounce);
      state.mediaLibrarySearchDebounce = 0;
    }
    state.mediaLibraryMode = on;
    if (on && state.reportsMode) {
      state.reportsMode = false;
      setButtonContent(elements.reportsButton, 'chart', 'Reports');
      elements.reportsButton.setAttribute('aria-pressed', 'false');
    }
    elements.mediaLibraryView.hidden = !on;
    elements.appShell.hidden = on || state.reportsMode;
    elements.reportsView.hidden = on || !state.reportsMode;
    elements.mediaLibraryButton.setAttribute('aria-pressed', String(on));
    syncViewSwitch();
    if (on) {
      renderMediaLibrary();
      elements.mediaLibraryView.scrollTop = 0;
    }
  }

  // ---------- Pedigree view ----------

  // Rows of ancestors: generation 0 is the selected person, then their parents,
  // grandparents and so on. Each slot keeps its own two parents, so siblings in
  // the same generation each get their own copy of the shared parent.
  //
  // Siblings share parents: Julius and Daniel Magnus are both children of the
  // same couple. An earlier version dropped repeated ancestors so each person
  // appeared once per generation, but that blanked the second sibling's parent
  // slots (shown as "Parent not recorded") and broke their connector lines.
  // Repeating the shared ancestor in the second slot is the standard pedigree
  // treatment and keeps every child's line intact.
  function pedigreeGenerations(personId, maxGenerations = 4) {
    const rows = [[personId]];
    for (let generation = 1; generation < maxGenerations; generation += 1) {
      const next = [];
      for (const id of rows[generation - 1]) {
        if (!id) { next.push('', ''); continue; }
        const parents = parentsOf(id).slice(0, 2);
        while (parents.length < 2) parents.push('');
        next.push(...parents);
      }
      // Stop when a generation adds no recorded ancestor at all, so a tree with
      // unknown grandparents does not end in rows of empty placeholders.
      if (!next.some(Boolean)) break;
      rows.push(next);
    }
    return rows;
  }

  function pedigreeFlagFor(place) {
    return countryFlagForPlace(place);
  }

  function pedigreeCard(personId, generation, isFocus) {
    if (!personId) {
      const empty = document.createElement('div');
      empty.className = 'pedigree-card pedigree-card-empty';
      const unknown = document.createElement('div');
      unknown.className = 'pedigree-card-dates';
      unknown.textContent = 'Parent not recorded';
      empty.append(unknown);
      return empty;
    }
    const card = document.createElement(isFocus ? 'div' : 'button');
    card.className = `pedigree-card${generation >= 4 ? ' pedigree-card-compact' : ''}${isFocus ? ' is-focus' : ''}`;
    card.dataset.pedigreePerson = personId;
    if (!isFocus) {
      card.type = 'button';
      card.addEventListener('click', () => setFocus(personId));
    }
    const person = state.people.get(personId);
    if (!person) return card;
    // Round hero portraits for the selected person, parents, grandparents and
    // great-grandparents; the outermost generation stays text-only.
    const portrait = generation <= 3 ? primaryImageFor(person) : null;
    if (portrait) {
      const media = document.createElement('div');
      media.className = 'pedigree-card-media';
      const image = document.createElement('img');
      // primaryImageFor returns { path, file }; the object URL comes from the file.
      image.src = mediaUrl(portrait.file);
      image.alt = '';
      image.loading = 'lazy';
      media.append(image);
      card.append(media);
    }
    const name = document.createElement('div');
    name.className = 'pedigree-card-name';
    name.textContent = person.name;
    card.append(name);
    const birth = person.events.find((event) => event.type === 'BIRT');
    const death = person.events.find((event) => event.type === 'DEAT');
    const years = lifespan(person);
    // Dates and country flags share one row so the card stays short.
    const meta = document.createElement('div');
    meta.className = 'pedigree-card-meta';
    if (years) {
      const dates = document.createElement('span');
      dates.className = 'pedigree-card-dates';
      dates.textContent = years;
      meta.append(dates);
    }
    const flags = document.createElement('span');
    flags.className = 'pedigree-card-flags';
    for (const event of [birth, death]) {
      const country = pedigreeFlagFor(event?.place);
      if (!country) continue;
      const image = document.createElement('img');
      image.src = `flags/4x3/${country.file}`;
      image.alt = `${event.type === 'BIRT' ? 'Born' : 'Died'} in ${country.country}`;
      image.title = `${event.type === 'BIRT' ? 'Born' : 'Died'} in ${country.country}`;
      flags.append(image);
    }
    if (flags.childElementCount) meta.append(flags);
    if (meta.childElementCount) card.append(meta);
    return card;
  }

  const pedigreeGenerationLabels = ['Selected person', 'Parents', 'Grandparents', 'Great-grandparents', 'Second great-grandparents'];
  const pedigreeMaxGenerations = 5;

  // Parent/child connectors are drawn as orthogonal elbows from each child card
  // to the midpoint between its two parent cards in the next column. The parent
  // slots are passed in explicitly (rather than inferred from card positions)
  // because pedigree collapse can leave a column shorter than 2 x children.
  // Each generation's elbows sit at a different x offset inside the gap so the
  // vertical runs of neighbouring groups never coincide.
  function drawPedigreeLinks(flow, columns, rows) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pedigree-links');
    svg.setAttribute('aria-hidden', 'true');
    flow.prepend(svg);
    const flowBox = flow.getBoundingClientRect();
    const zoom = Number.parseFloat(getComputedStyle(flow).zoom) || 1;
    const boxOf = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: (rect.left - flowBox.left) / zoom,
        right: (rect.right - flowBox.left) / zoom,
        top: (rect.top - flowBox.top) / zoom,
        bottom: (rect.bottom - flowBox.top) / zoom,
        midX: (rect.left - flowBox.left + rect.width / 2) / zoom,
        midY: (rect.top - flowBox.top + rect.height / 2) / zoom
      };
    };
    const cardAt = (generation, slot) => columns[generation]?.querySelectorAll('.pedigree-card')[slot] || null;
    for (let generation = 0; generation < columns.length; generation += 1) {
      const ids = rows[generation] || [];
      for (let slot = 0; slot < ids.length; slot += 1) {
        const personId = ids[slot];
        if (!personId) continue;
        const person = state.people.get(personId);
        for (const familyId of person?.spouseFamilyIds || []) {
          const family = state.families.get(familyId);
          if (!family?.marriage || !family.husbandId || !family.wifeId) continue;
          const spouseId = family.husbandId === personId ? family.wifeId : family.husbandId;
          const spouseSlot = ids.indexOf(spouseId);
          if (spouseSlot < 0 || spouseSlot <= slot) continue;
          const first = boxOf(cardAt(generation, slot));
          const second = boxOf(cardAt(generation, spouseSlot));
          if (!first || !second) continue;
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          line.setAttribute('class', 'pedigree-marriage-link');
          if (Math.abs(first.midY - second.midY) < 2) {
            const left = first.midX < second.midX ? first : second;
            const right = first.midX < second.midX ? second : first;
            line.setAttribute('d', `M ${left.right} ${left.midY} H ${right.left}`);
          } else {
            const left = first.midX < second.midX ? first : second;
            const right = first.midX < second.midX ? second : first;
            const junctionX = (left.right + right.left) / 2;
            line.setAttribute('d', `M ${left.right} ${left.midY} H ${junctionX} V ${right.midY} H ${right.left}`);
          }
          svg.append(line);
        }
      }
      const childIds = rows[generation] || [];
      childIds.forEach((childId, slot) => {
        if (!childId) return;
        const childCard = cardAt(generation, slot);
        if (!childCard) return;
        // The two parent slots for this child are 2*slot and 2*slot+1.
        const pair = [cardAt(generation + 1, slot * 2), cardAt(generation + 1, slot * 2 + 1)]
          .filter((card) => card && card.dataset.pedigreePerson);
        if (!pair.length) return;
        const child = boxOf(childCard);
        const boxes = pair.map(boxOf);
        const startX = child.right;
        const endX = Math.min(...boxes.map((box) => box.left));
        const gap = Math.max(0, endX - startX);
        // Stagger the vertical run per group so neighbouring groups stay apart:
        // odd groups turn early in the gap, even groups turn late.
        const evenGroup = slot % 2 === 0;
        const elbowX = evenGroup ? startX + gap * 0.32 : startX + gap * 0.68;
        for (const box of boxes) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${startX} ${child.midY} H ${elbowX} V ${box.midY} H ${box.left}`);
          svg.append(path);
        }
        if (boxes.length > 1) {
          // Vertical spine joining both parents back to the shared elbow.
          const spine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const ys = boxes.map((box) => box.midY);
          spine.setAttribute('d', `M ${elbowX} ${Math.min(...ys)} V ${Math.max(...ys)}`);
          svg.append(spine);
        }
      });
    }
  }

  function renderPedigreeView() {
    const chart = document.querySelector('#pedigreeChart');
    const person = state.people.get(state.selectedId);
    const summary = document.querySelector('#pedigreeSummary');
    document.querySelector('#pedigreePersonName').textContent = person?.name || '';
    chart.replaceChildren();
    if (!person) {
      summary.textContent = 'Select a person in the tree to see their pedigree.';
      return;
    }
    const rows = pedigreeGenerations(person.id, pedigreeMaxGenerations);
    const recorded = rows.flat().filter(Boolean).length - 1;
    summary.textContent = `${recorded} ancestor${recorded === 1 ? '' : 's'} over ${rows.length - 1} generation${rows.length === 2 ? '' : 's'} · generations three and older show name and dates only`;
    const flow = document.createElement('div');
    flow.className = 'pedigree-flow';
    const columns = [];
    for (const [generation, ids] of rows.entries()) {
      const column = document.createElement('div');
      column.className = `pedigree-column pedigree-column-gen${generation}`;
      const label = document.createElement('div');
      label.className = 'pedigree-column-label';
      label.textContent = pedigreeGenerationLabels[generation] || `Generation ${generation}`;
      column.append(label);
      for (const id of ids) column.append(pedigreeCard(id, generation, generation === 0));
      flow.append(column);
      columns.push(column);
    }
    chart.append(flow);
    // Layout must settle before measuring card positions for the connectors.
    // Connectors are drawn at natural size, then the whole flow is scaled to fit
    // the centre panel, so the SVG geometry stays in one coordinate space.
    requestAnimationFrame(() => {
      drawPedigreeLinks(flow, columns, rows);
      fitPedigreeFlow(flow, chart);
    });
  }

  // Shrinks the flow so all generations fit side by side in the middle panel
  // rather than scrolling horizontally. The user's zoom multiplies that fit.
  function fitPedigreeFlow(flow, chart) {
    if (!flow || !chart) return;
    const userZoom = state.pedigreeZoom || 1;
    flow.style.zoom = '1';
    const available = chart.clientWidth - 40;
    const natural = flow.offsetWidth;
    if (available <= 0 || natural <= 0) return;
    const fit = Math.min(1, available / natural);
    flow.style.zoom = String(fit * userZoom);
  }

  function setPedigreeMode(on) {
    if (on && !state.people.size) return;
    state.pedigreeMode = on;
    if (on) {
      if (state.mediaLibraryMode) setMediaLibraryMode(false);
      if (state.reportsMode) setReportsMode(false);
      if (state.mapMode) setMapMode(false);
    }
    // The pedigree is drawn inside the relationship-map viewport, so the app
    // shell (topbar, directory, person record) stays visible around it.
    const view = document.querySelector('#pedigreeView');
    view.hidden = !on;
    elements.appShell.hidden = state.reportsMode || state.mediaLibraryMode;
    elements.reportsView.hidden = !state.reportsMode;
    elements.mediaLibraryView.hidden = !state.mediaLibraryMode;
    document.querySelector('.main-panel').classList.toggle('pedigree-mode', on);
    if (on) {
      document.querySelector('#viewEyebrow').textContent = 'PEDIGREE';
      document.querySelector('.graph-footer-right').textContent = 'CLICK AN ANCESTOR TO FOLLOW THAT LINE';
      // Hand the zoom controls to the pedigree chart at 100%.
      state.pedigreeZoom = 1;
      elements.zoomLabel.textContent = '100%';
      elements.zoomOut.disabled = false;
      elements.zoomIn.disabled = false;
      elements.printMapButton.title = 'Print pedigree chart (A4)';
      elements.printMapButton.setAttribute('aria-label', 'Print pedigree chart');
    } else {
      document.querySelector('#viewEyebrow').textContent = 'RELATIONSHIP MAP';
      document.querySelector('.graph-footer-right').textContent = 'SELECT A PERSON TO RECENTER';
      elements.printMapButton.title = 'Print relationship map (A4)';
      elements.printMapButton.setAttribute('aria-label', 'Print relationship map');
      setZoom(state.zoom);
    }
    syncViewSwitch();
    if (on) renderPedigreeView();
  }

  // Keeps the top-bar dropdown matching whichever view is currently active.
  function syncViewSwitch() {
    const select = document.querySelector('#viewSwitch');
    if (!select) return;
    select.value = state.mediaLibraryMode ? 'media' : state.reportsMode ? 'reports' : state.pedigreeMode ? 'pedigree' : state.mapMode ? 'map' : 'tree';
  }

  const reportMonthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // Sorts on the first date in the value; qualifiers such as ABT/BEF/BET are compared by their stated date.
  function reportDateKey(date) {
    const text = String(date || '').toUpperCase();
    const match = text.match(/(?:(\d{1,2})\s+)?(?:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+)?(?<!\d)(\d{3,4})(?!\d)/);
    if (!match) return null;
    const month = match[2] ? reportMonthNames.indexOf(match[2]) + 1 : 0;
    const day = month && match[1] ? Number(match[1]) : 0;
    return { key: Number(match[3]) * 10000 + month * 100 + day, year: Number(match[3]), approximate: /\b(ABT|ABOUT|BEF|BEFORE|AFT|AFTER|EST|CAL|BET|FROM|TO|C|CIRCA)\b/.test(text) };
  }

  // Specific roles precede generic terms: bank/railway clerks, marine engineers and printing directors.
  const reportOccupationTaxonomy = [
    ['Protective Services', [
      ['Police Officer', /\bpolice\b/]
    ]],
    ['Law & Judiciary', [
      ['Solicitor/Barrister', /\b(?:barrister.*solicitor|solicitor.*barrister)\b/],
      ['Barrister', /\bbarrister\b/], ['Solicitor', /\bsolicitor\b/],
      ['Judge', /\bjudge\b/], ['Doctor of Laws', /\bdoctor of laws\b/]
    ]],
    ['Healthcare & Medical', [
      ['Dental Nurse', /\bdental nurse\b/], ['Nurse', /\bnurse\b/],
      ['Medical Officer', /\bmedical officer\b/], ['Morbid Anatomist', /\bmorbid anatomist\b/],
      ['Medical Research Staff', /\b(?:research medical|medical research) staff\b/],
      ['Homeopath', /\bhom[eo]+opath\b/], ['Physician', /\b(?:doctor|physician)\b/]
    ]],
    ['Science & Research', [
      ['Analytical Chemist', /\banalytical chemist\b/], ['Chemist', /\bchemist\b/],
      ['Geophysicist', /\bgeophysicist\b/], ['Scientist', /\bscientist\b/], ['Researcher', /\bresearcher\b/]
    ]],
    ['Printing & Publishing', [
      ['Printing Director', /\bprinting director\b/], ['Printer', /\bprinter\b/],
      ['Compositor', /\bcompositor\b/], ['Bookbinder', /\bbook[\s-]?binder\b/]
    ]],
    ['Manufacturing & Industrial', [
      ['Wood Machinist', /\bwood machinist\b/], ['Blast Furnace Worker', /\bblast furnace\b/],
      ['Chemical Manufacturing', /\bchemical manufactur(?:ing|er)\b/],
      ['Extract Manufacturer', /\bextract manufacturer\b/], ['Draft Maker', /\bdraft maker\b/],
      ['Spinner', /\bspinner\b/]
    ]],
    ['Engineering & Technical', [
      ['Marine Engineer', /\b(?:engineer.*(?:marine|ship)|(?:marine|ship).*engineer)\b/],
      ['Engineer', /\bengineer\b/], ['Telegraphist', /\btelegraphist\b/],
      ['Mechanic', /\bmechanic\b/], ['Machinist', /\bmachinist\b/]
    ]],
    ['Education & Academia', [
      ['Student Teacher', /\bstudent teacher\b/], ['Head Teacher', /\bhead teacher\b/],
      ['Teacher', /\b(?:teacher|schoolmaster|schoolmistress|assistant master)\b/],
      ['Principal', /\bprincipal\b/], ['Lecturer', /\blecturer\b/], ['Professor', /\bprofessor\b/]
    ]],
    ['Agriculture & Farming', [
      ['Farm Labourer', /\bfarm[\s-]*(?:labourer|worker)\b/], ['Farmer', /\bfarmer\b/],
      ['Crofter', /\bcrofter\b/], ['Shepherd', /\bshepherd\b/],
      ['Market Gardener', /\bmarket gardener\b/], ['Horticulturist', /\bhorticulturist\b/],
      ['Seedsman', /\bseedsman\b/]
    ]],
    ['Mining & Resources', [
      ['Mine Manager', /\bmine manager\b/], ['Miner', /\bminer\b/]
    ]],
    ['Transport & Railways', [
      ['Railway Clerk', /\brailway clerk\b/], ['Railway Porter', /\brailway porter\b/],
      ['Railway Worker', /\brailway (?:employee|worker)\b/],
      ['Locomotive Fireman', /\bloc(?:omotive|o) fireman\b/], ['Motor Driver', /\bmotor driver\b/]
    ]],
    ['Sales & Business Development', [
      ['Commercial Traveller', /\bcommercial traveller\b/],
      ['Sales Traveller', /\btraveller.*sales\b/], ['Sales Manager', /\bsales manager\b/],
      ['Salesperson', /\b(?:salesman|saleswoman|salesperson)\b/]
    ]],
    ['Clerical & Administration', [
      ['Clerk', /\bclerk\b/], ['Secretary', /\bsecretary\b/],
      ['Receptionist', /\breceptionist\b/], ['Cashier', /\bcashier\b/]
    ]],
    ['Merchants, Import & Export', [
      ['Merchant', /\bmerchants?\b/], ['Importer', /\bimporters?\b/],
      ['Exporter', /\bexporters?\b/], ['Manufacturing Agent', /\bmanufacturing agent\b/]
    ]],
    ['Finance & Banking', [
      ['Accountant', /\baccountant\b/], ['Bookkeeper', /\bbook[\s-]?keeper\b/],
      ['Bank Manager', /\bbank manager\b/], ['Underwriter', /\bunderwriter\b/], ['Treasurer', /\btreasurer\b/]
    ]],
    ['Government & Public Service', [
      ['Public Servant', /\bpublic servant\b/], ['Civil Servant', /\bcivil servant\b/],
      ['Customs Officer', /\bcustoms officer\b/], ['Public Trustee', /\bpublic trustee\b/],
      ['Inspector', /\binspector\b/]
    ]],
    ['Construction & Building Trades', [
      ['Builder', /\bbuilder\b/], ['Bricklayer', /\bbricklayer\b/],
      ['Mason', /\b(?:mason|stoneworker)\b/], ['Joiner', /\bjoiner\b/], ['Plumber', /\bplumber\b/]
    ]],
    ['Maritime & Shipping', [
      ['Shipmaster', /\bship[\s-]?master\b/], ['Master Mariner', /\bmaster mariner\b/],
      ['Shipwright', /\bship[\s-]?wright\b/], ['Seaman', /\bsea[\s-]?m[ae]n\b/],
      ['Sailor', /\bsailor\b/], ['Shipping Worker', /\bshipping\b/]
    ]],
    ['Retail & Commerce', [
      ['Grocer', /\bgrocer\b/], ['Shopkeeper', /\bshop[\s-]?keeper\b/],
      ['Draper', /\bdraper\b/], ['Wool Buyer', /\bwool buyer\b/],
      ['Book Store Employee', /\bbook[\s-]?store employee\b/]
    ]],
    ['Hospitality & Tourism', [
      ['Hotel Keeper', /\bhotel[\s-]?keeper\b/], ['Publican', /\bpublican\b/],
      ['Hostess', /\bhostess\b/], ['Innkeeper', /\binn[\s-]?keeper\b/],
      ['Cafe Operator', /\bcafe operator\b/]
    ]],
    ['Management & Executive', [
      ['Managing Director', /\bmanaging director\b/], ['Director', /\bdirector\b/],
      ['General Manager', /\bgeneral manager\b/], ['Manager', /\bmanager\b/], ['Chairman', /\bchairman\b/]
    ]],
    ['Trades & Craftsmanship', [
      ['Baker', /\bbaker\b/], ['Basket Maker', /\bbasket maker\b/], ['Blacksmith', /\bblacksmith\b/],
      ['Coachbuilder', /\bcoach[\s-]?builder\b/], ['Mantelpiece Maker', /\bmantelpiece maker\b/],
      ['Tailor', /\b(?:tailor|tailoress)\b/], ['Sailmaker', /\bsailmaker\b/]
    ]],
    ['Arts, Music & Media', [
      ['Band Member', /\bband member\b/], ['Choir Member', /\bchoir member\b/],
      ['News Correspondent', /\b(?:foreign )?news correspondent\b/], ['Librarian', /\blibrarian\b/]
    ]],
    ['Labouring & General Work', [
      ['Labourer', /\blabourers?\b/], ['Yardman', /\byardman\b/],
      ['Storeman', /\bstoreman\b/], ['Bushman', /\bbushman\b/]
    ]],
    ['Religious Occupations', [
      ['Priest', /\bpriest\b/]
    ]],
    ['Domestic / Unpaid', [
      ['Home Duties', /\bhome duties\b/], ['Spinster', /^spinster$/]
    ]],
    ['Unknown / Miscellaneous', []]
  ];

  function reportOccupation(value) {
    const original = value;
    const description = value.trim().replace(/\s+/g, ' ');
    const occupation = description.split(',')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase().replace(/\blaborers?\b/g, (word) => word.replace('labor', 'labour'));
    // Bank clerk must precede the general clerk rule without moving every finance role ahead of merchants.
    if (/\bbank clerk\b/.test(occupation)) return { original, standard: 'Bank Clerk', category: 'Finance & Banking' };
    for (const [category, rules] of reportOccupationTaxonomy) {
      for (const [standard, pattern] of rules) {
        if (pattern.test(occupation)) return { original, standard, category };
      }
    }
    return { original, standard: description, category: 'Unknown / Miscellaneous' };
  }

  function matchesOccupationType(person, category) {
    return !category || person.events.some((event) =>
      event.type === 'OCCU' && event.value.trim() && reportOccupation(event.value).category === category);
  }

  function populateOccupationFilter() {
    const select = elements.occupationTypeFilter;
    const selected = state.directoryFilters.occupationType;
    select.replaceChildren(new Option('All occupation types', ''));
    const categories = reportOccupationTaxonomy.map(([category]) => category).sort((a, b) => a.localeCompare(b));
    for (const category of categories) select.add(new Option(category, category));
    select.disabled = !state.people.size;
    select.value = categories.includes(selected) ? selected : '';
    state.directoryFilters.occupationType = select.value;
  }

  function buildReportStats() {
    const people = [...state.people.values()];
    const stats = {
      total: people.length,
      men: people.filter((person) => person.sex === 'M').length,
      women: people.filter((person) => person.sex === 'F').length,
      withMedia: people.filter((person) => person.mediaPaths.length).length,
      mediaFiles: new Set(people.flatMap((person) => person.mediaPaths)).size,
      countries: new Map(), unmatchedPlaces: new Set(), births: [], decades: new Map(),
      occupations: new Map(), withOccupation: 0, surnames: new Map(),
      birthCountry: { withCountry: 0, unrecognised: 0, noPlace: 0 },
      deathCountry: { withCountry: 0, unrecognised: 0, noPlace: 0, excluded: 0 }
    };
    stats.unknownSex = stats.total - stats.men - stats.women;
    stats.withoutMedia = stats.total - stats.withMedia;
    const addPlace = (place, personIds) => {
      if (!place) return;
      const country = countryFlagForPlace(place)?.country;
      if (!country) { stats.unmatchedPlaces.add(place.trim().toLocaleLowerCase()); return; }
      if (!stats.countries.has(country)) stats.countries.set(country, new Set());
      personIds.forEach((id) => stats.countries.get(country).add(id));
    };
    for (const person of people) {
      for (const event of person.events) addPlace(event.place, [person.id]);
      // Surname tally for the popular-surnames chart. People with no recorded
      // surname are counted separately so they do not form a fake top entry.
      const surname = (person.surname || '').trim();
      if (surname) {
        const key = surname.toLocaleLowerCase();
        if (!stats.surnames.has(key)) stats.surnames.set(key, { label: surname, count: 0 });
        stats.surnames.get(key).count += 1;
      }
      for (const [type, tally] of [['BIRT', stats.birthCountry], ['DEAT', stats.deathCountry]]) {
        const event = person.events.find((item) => item.type === type);
        // No death event or no death date: possibly living, so left out of the death country count.
        if (type === 'DEAT' && !(event?.date || '').trim()) { tally.excluded += 1; continue; }
        const place = (event?.place || '').trim();
        if (!place) tally.noPlace += 1;
        else if (countryFlagForPlace(place)) tally.withCountry += 1;
        else tally.unrecognised += 1;
      }
      const occupations = new Set();
      for (const event of person.events) {
        if (event.type !== 'OCCU') continue;
        if (!event.value.trim()) continue;
        const { original, standard, category: label } = reportOccupation(event.value);
        const key = label.toLocaleLowerCase();
        if (!stats.occupations.has(key)) stats.occupations.set(key, { label, count: 0, descriptions: new Set() });
        stats.occupations.get(key).descriptions.add(`${original} -> ${standard}`);
        if (occupations.has(key)) continue;
        occupations.add(key);
        stats.occupations.get(key).count += 1;
      }
      if (occupations.size) stats.withOccupation += 1;
      const birth = person.events.find((event) => event.type === 'BIRT');
      const parsed = reportDateKey(birth?.date);
      if (parsed) {
        stats.births.push({ person, birth, ...parsed });
        const decade = Math.floor(parsed.year / 10) * 10;
        stats.decades.set(decade, (stats.decades.get(decade) || 0) + 1);
      }
    }
    for (const family of state.families.values()) {
      const spouses = [family.husbandId, family.wifeId].filter((id) => state.people.has(id));
      for (const event of [family.marriage, family.divorce]) if (event) addPlace(event.place, spouses);
    }
    stats.births.sort((a, b) => a.key - b.key || a.person.name.localeCompare(b.person.name));
    return stats;
  }

  function reportElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function reportPercent(value, total) {
    return total ? `${Math.round((value / total) * 100)}%` : '0%';
  }

  function reportStatCard(label, value, detail, accent) {
    const card = reportElement('div', 'report-stat');
    if (accent) card.style.setProperty('--report-accent', accent);
    card.append(reportElement('div', 'report-stat-label', label), reportElement('div', 'report-stat-value', value));
    if (detail) card.append(reportElement('div', 'report-stat-detail', detail));
    return card;
  }

  function reportPanel(title, wide = false) {
    const panel = reportElement('section', `report-panel${wide ? ' is-wide' : ''}`);
    panel.append(reportElement('h2', '', title));
    return panel;
  }

  function reportDonut(segments, caption) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const wrap = reportElement('div', 'report-donut');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', segments.map((segment) => `${segment.label}: ${segment.value}`).join(', '));
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const track = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 60, cy: 60, r: radius, fill: 'none', stroke: '#eef3f0', 'stroke-width': 16 }).forEach(([key, value]) => track.setAttribute(key, value));
    svg.append(track);
    let offset = 0;
    for (const segment of segments) {
      if (!segment.value || !total) continue;
      const length = (segment.value / total) * circumference;
      const arc = document.createElementNS(ns, 'circle');
      Object.entries({ cx: 60, cy: 60, r: radius, fill: 'none', stroke: segment.color, 'stroke-width': 16, 'stroke-dasharray': `${length} ${circumference - length}`, 'stroke-dashoffset': String(-offset), transform: 'rotate(-90 60 60)' })
        .forEach(([key, value]) => arc.setAttribute(key, value));
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${segment.label}: ${segment.value.toLocaleString()} (${reportPercent(segment.value, total)})`;
      arc.append(title);
      svg.append(arc);
      offset += length;
    }
    const totalText = document.createElementNS(ns, 'text');
    Object.entries({ x: 60, y: 62, 'text-anchor': 'middle', class: 'report-donut-total' }).forEach(([key, value]) => totalText.setAttribute(key, value));
    totalText.textContent = total.toLocaleString();
    const captionText = document.createElementNS(ns, 'text');
    Object.entries({ x: 60, y: 78, 'text-anchor': 'middle', class: 'report-donut-caption' }).forEach(([key, value]) => captionText.setAttribute(key, value));
    captionText.textContent = caption;
    svg.append(totalText, captionText);
    const legend = reportElement('ul', 'report-legend');
    for (const segment of segments) {
      const item = document.createElement('li');
      const swatch = reportElement('span', 'report-swatch');
      swatch.style.background = segment.color;
      const value = reportElement('span', 'report-legend-value', segment.value.toLocaleString());
      value.append(' ', reportElement('small', '', reportPercent(segment.value, total)));
      item.append(swatch, reportElement('span', '', segment.label), value);
      legend.append(item);
    }
    wrap.append(svg, legend);
    return wrap;
  }

  function reportPersonLink(person, className = 'report-person-link') {
    const button = makeButton(person.name, className);
    button.dataset.reportPerson = person.id;
    button.title = `Open ${person.name}'s Person Record`;
    return button;
  }

  function appendReportBars(panel, rows, category, options = {}) {
    const bars = reportElement('div', 'report-bars');
    const top = rows[0][1];
    rows.forEach(([label, value, descriptions], index) => {
      const row = reportElement('div', `report-bar-row${index >= 10 ? ' is-extra' : ''}`);
      row.hidden = index >= 10;
      row.title = `${label}: ${value.toLocaleString()} ${value === 1 ? 'person' : 'people'}`;
      if (descriptions) row.title += `\nRecorded descriptions: ${descriptions}`;
      const track = reportElement('div', 'report-bar-track');
      const fill = reportElement('div', 'report-bar-fill');
      fill.style.width = `${(value / top) * 100}%`;
      track.append(fill);
      const labelEl = reportElement('span', 'report-bar-label', label);
      // Country rows show the flag before the name, using the same flag files
      // as the person cards; inserted first so the name follows it.
      if (options.flags) {
        const country = countryFlagForPlace(label);
        if (country) {
          const flag = reportElement('img', 'report-bar-flag');
          flag.src = `flags/4x3/${country.file}`;
          flag.alt = '';
          flag.title = country.country;
          labelEl.prepend(flag);
        }
      }
      row.append(labelEl, track, reportElement('span', 'report-bar-value', value.toLocaleString()));
      bars.append(row);
    });
    panel.append(bars);
    if (rows.length > 10) {
      const more = makeButton(`Show all ${rows.length} ${category}`, 'report-more');
      more.dataset.reportMore = more.textContent;
      panel.append(more);
    }
  }

  function renderReports() {
    if (!state.reportsMode) return;
    const stats = buildReportStats();
    document.querySelector('#reportsFileName').textContent = state.fileName;
    document.querySelector('#reportsSubtitle').textContent = `A summary of the ${stats.total.toLocaleString()} people recorded in this GEDCOM.`;
    const earliest = stats.births[0];

    const cards = reportElement('div', 'report-stats');
    cards.append(
      reportStatCard('Total people', stats.total.toLocaleString(), `${state.families.size.toLocaleString()} family records`, 'var(--ink)'),
      reportStatCard('Men', stats.men.toLocaleString(), `${reportPercent(stats.men, stats.total)} of people`, 'var(--blue)'),
      reportStatCard('Women', stats.women.toLocaleString(), `${reportPercent(stats.women, stats.total)} of people`, 'var(--coral)'),
      reportStatCard('Countries', stats.countries.size.toLocaleString(), 'Recognised in event places', 'var(--gold)'),
      reportStatCard('With media', stats.withMedia.toLocaleString(), `${stats.mediaFiles.toLocaleString()} distinct media files`, 'var(--green)'),
      reportStatCard('Without media', stats.withoutMedia.toLocaleString(), `${reportPercent(stats.withoutMedia, stats.total)} of people`, '#a3b3ab')
    );

    const charts = reportElement('div', 'report-charts');

    const sexPanel = reportPanel('Men and women');
    const sexSegments = [
      { label: 'Men', value: stats.men, color: '#5a88a1' },
      { label: 'Women', value: stats.women, color: '#c9694e' }
    ];
    if (stats.unknownSex) sexSegments.push({ label: 'Not recorded', value: stats.unknownSex, color: '#b8c4be' });
    sexPanel.append(reportDonut(sexSegments, 'PEOPLE'));

    const mediaPanel = reportPanel('Media coverage');
    mediaPanel.append(reportDonut([
      { label: 'People with media', value: stats.withMedia, color: '#2f786a' },
      { label: 'People without media', value: stats.withoutMedia, color: '#d5dfda' }
    ], 'PEOPLE'));
    mediaPanel.append(reportElement('p', 'report-note', 'Counts photos and PDFs attached to the person or to any of their life events.'));

    const countryCoveragePanel = (title, tally, eventLabel, note) => {
      const panel = reportPanel(title);
      const without = tally.unrecognised + tally.noPlace;
      panel.append(reportDonut([
        { label: `With a ${eventLabel} country`, value: tally.withCountry, color: '#2f786a' },
        { label: `${eventLabel[0].toUpperCase()}${eventLabel.slice(1)} place with no recognised country`, value: tally.unrecognised, color: '#d6a63f' },
        { label: `No ${eventLabel} place recorded`, value: tally.noPlace, color: '#d5dfda' }
      ], 'PEOPLE'));
      panel.append(reportElement('p', 'report-note', `${tally.withCountry.toLocaleString()} ${tally.withCountry === 1 ? 'person has' : 'people have'} a ${eventLabel} country and ${without.toLocaleString()} ${without === 1 ? 'does' : 'do'} not. ${note}`));
      return panel;
    };
    const birthCountryPanel = countryCoveragePanel('Birth country', stats.birthCountry, 'birth',
      'Uses the place on the first birth event, as the directory filter and Settings > People without a birth country do.');
    const deathCountryPanel = countryCoveragePanel('Death country', stats.deathCountry, 'death',
      `Counts only people with a recorded death date, using the place on their first death event.${stats.deathCountry.excluded ? ` ${stats.deathCountry.excluded.toLocaleString()} ${stats.deathCountry.excluded === 1 ? 'person is' : 'people are'} not counted because no death date is recorded; this includes anyone who may be living.` : ''}`);

    const earliestPanel = reportPanel('Earliest recorded birth');
    if (earliest) {
      earliestPanel.append(reportPersonLink(earliest.person, 'report-earliest-name'));
      earliestPanel.append(reportElement('p', 'report-earliest-meta', [`Born ${earliest.birth.date}`, earliest.birth.place].filter(Boolean).join(' · ')));
      const tied = stats.births.filter((entry) => entry.key === earliest.key).length;
      if (tied > 1) earliestPanel.append(reportElement('p', 'report-note', `${tied} people share this earliest birth date.`));
      const runners = stats.births.slice(1, 6);
      if (runners.length) {
        const list = reportElement('ol', 'report-runners');
        list.start = 2;
        for (const entry of runners) {
          const item = document.createElement('li');
          item.append(reportPersonLink(entry.person), document.createTextNode(' '), reportElement('span', 'report-runner-date', `· ${entry.birth.date}`));
          list.append(item);
        }
        earliestPanel.append(list);
      }
      if (earliest.approximate) earliestPanel.append(reportElement('p', 'report-note', 'This date is approximate or a range, so it is compared using the first date it states.'));
    } else {
      earliestPanel.append(reportElement('p', 'report-empty', 'No birth dates are recorded in this tree.'));
    }
    const undated = stats.total - stats.births.length;
    if (undated) earliestPanel.append(reportElement('p', 'report-note', `${undated.toLocaleString()} ${undated === 1 ? 'person has' : 'people have'} no birth year recorded and ${undated === 1 ? 'is' : 'are'} not included.`));

    const birthsPanel = reportPanel('Births by decade');
    if (stats.decades.size) {
      const decades = [...stats.decades.keys()];
      const first = Math.min(...decades);
      const last = Math.max(...decades);
      const peak = Math.max(...stats.decades.values());
      const count = (last - first) / 10 + 1;
      const labelEvery = Math.max(1, Math.ceil(count / 12));
      const columns = reportElement('div', 'report-columns');
      columns.setAttribute('role', 'img');
      columns.setAttribute('aria-label', `Births by decade from the ${first}s to the ${last}s`);
      for (let decade = first, index = 0; decade <= last; decade += 10, index += 1) {
        const value = stats.decades.get(decade) || 0;
        const column = reportElement('div', 'report-column');
        column.title = `${decade}s: ${value.toLocaleString()} ${value === 1 ? 'birth' : 'births'}`;
        const bar = reportElement('div', `report-column-bar${value ? ' has-value' : ''}`);
        bar.style.height = `calc((100% - 18px) * ${value / peak})`;
        column.append(bar, reportElement('div', 'report-column-label', index % labelEvery === 0 ? `${decade}s` : ''));
        columns.append(column);
      }
      birthsPanel.append(columns);
      const peakDecade = [...stats.decades.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      birthsPanel.append(reportElement('p', 'report-note', `${stats.births.length.toLocaleString()} people with a birth year, from the ${first}s to the ${last}s. Busiest decade: ${peakDecade[0]}s (${peakDecade[1].toLocaleString()}).`));
    } else {
      birthsPanel.append(reportElement('p', 'report-empty', 'No birth years are recorded in this tree.'));
    }

    const countryPanel = reportPanel('People by country', true);
    const countryRows = [...stats.countries.entries()].map(([country, ids]) => [country, ids.size])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (countryRows.length) {
      appendReportBars(countryPanel, countryRows, 'countries', { flags: true });
      countryPanel.append(reportElement('p', 'report-note', `People are counted once per country where any of their life events took place, so totals can exceed the number of people.${stats.unmatchedPlaces.size ? ` ${stats.unmatchedPlaces.size.toLocaleString()} distinct place ${stats.unmatchedPlaces.size === 1 ? 'name does' : 'names do'} not include a recognised country.` : ''}`));
    } else {
      countryPanel.append(reportElement('p', 'report-empty', 'No recognised countries were found in the recorded places.'));
    }

    const surnamePanel = reportPanel('Most popular family surnames');
    const surnameRows = [...stats.surnames.values()].map(({ label, count }) => [label, count])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (surnameRows.length) {
      appendReportBars(surnamePanel, surnameRows, 'surnames');
      const withSurname = surnameRows.reduce((sum, [, count]) => sum + count, 0);
      const withoutSurname = stats.total - withSurname;
      surnamePanel.append(reportElement('p', 'report-note', `Each person is counted once by their recorded surname. ${surnameRows.length.toLocaleString()} distinct ${surnameRows.length === 1 ? 'surname is' : 'surnames are'} recorded${withoutSurname ? `; ${withoutSurname.toLocaleString()} ${withoutSurname === 1 ? 'person has' : 'people have'} no surname and ${withoutSurname === 1 ? 'is' : 'are'} not included` : ''}.`));
    } else {
      surnamePanel.append(reportElement('p', 'report-empty', 'No surnames are recorded in this tree.'));
    }

    const occupationPanel = reportPanel('Most popular occupations', true);
    const occupationRows = [...stats.occupations.values()].map(({ label, count, descriptions }) => [label, count, [...descriptions].sort().join('; ')])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (occupationRows.length) {
      appendReportBars(occupationPanel, occupationRows, 'categories');
      occupationPanel.append(reportElement('p', 'report-note', `${stats.withOccupation.toLocaleString()} people have an occupation entry. Each person is counted once per category using a 27-category report taxonomy; totals can exceed the number of people. Hover over a bar to see original descriptions -> standard occupations. Grouping is inferred from keywords, not a verified fact. Unknown / Miscellaneous includes unmapped entries; Spinster is grouped under Domestic / Unpaid but is a recorded status, not proof of an occupation. Original GEDCOM entries are unchanged.`));
    } else {
      occupationPanel.append(reportElement('p', 'report-empty', 'No occupations are recorded in this tree.'));
    }

    charts.append(sexPanel, mediaPanel, birthCountryPanel, deathCountryPanel, earliestPanel, birthsPanel, countryPanel, surnamePanel, occupationPanel);
    elements.reportsContent.replaceChildren(cards, charts);
  }

  function printReports() {
    if (!state.reportsMode) return;
    if (printCleanup) printCleanup();
    const printedOn = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    elements.printFooter.textContent = `Reports · ${state.fileName} · Printed ${printedOn} from Kinship Atlas · Private family research; may include living people.`;
    document.body.classList.add('print-reports');
    setPrintPageOrientation(null);
    const restoreTheme = forcePrintLightTheme();
    const cleanup = () => {
      printCleanup = null;
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('print-reports');
      elements.printFooter.textContent = '';
      restoreTheme();
    };
    printCleanup = cleanup;
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // Printed pages are always light: a dark theme wastes ink and photos, charts
  // and maps are designed for the light palette. The current theme is restored
  // as soon as the print dialog closes.
  function forcePrintLightTheme() {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    if (previous !== 'dark') return () => { };
    root.dataset.theme = 'light';
    // Any dark-mode stylesheet rules keyed on [data-theme=dark] stop matching;
    // also drop the dark native-widget hint so form controls print light.
    const meta = document.querySelector('meta[name="color-scheme"]');
    const previousMeta = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', 'light');
    return () => {
      root.dataset.theme = previous;
      if (meta && previousMeta) meta.setAttribute('content', previousMeta);
    };
  }
