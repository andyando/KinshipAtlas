  // ---------------------------------------------------------------------------
  // 14. Map, print, defaults, about/help and startup wiring
  // ---------------------------------------------------------------------------

  function printMapHeightBudget() {
    const measure = (element, extraStyles = {}) => {
      if (!element) return 0;
      const clone = element.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      Object.assign(clone.style, { position: 'absolute', left: '-10000px', top: '0', visibility: 'hidden', width: `${printPageWidth}px`, ...extraStyles });
      [clone, ...clone.querySelectorAll('*')].forEach((node) => Object.assign(node.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }));
      element.parentNode.appendChild(clone);
      const height = clone.getBoundingClientRect().height;
      clone.remove();
      return height;
    };
    const heading = measure(document.querySelector('.main-heading .heading-copy')) + 9 * mmToPx;
    const summary = measure(elements.graphSummary || document.querySelector('#graphSummary'), { display: 'block' }) + 4 * mmToPx;
    const footer = measure(elements.printFooter, { display: 'block', fontSize: '7.5pt', lineHeight: '1.4' }) + 8 * mmToPx;
    const safety = 36;
    return Math.max(200, printPageHeight - heading - summary - footer - safety);
  }

  function setPrintPageOrientation(orientation) {
    let style = document.getElementById('printPageStyle');
    if (!orientation) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = 'printPageStyle';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: A4 ${orientation}; margin: 12mm; }`;
  }

  function preparePrintMap() {
    const canvas = elements.canvas;
    const svg = canvas.querySelector('.connector-layer');
    const heightBudget = printMapHeightBudget();
    canvas.style.zoom = '1';
    canvas.style.minWidth = '0';
    canvas.style.minHeight = '0';
    if (svg) {
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
    }
    // Try each cards-per-row wrap width and keep the layout that can be printed largest on the landscape page.
    const widestCount = Math.max(1, ...[...canvas.querySelectorAll('.generation-nodes')].map((row) => row.children.length));
    const cardWidth = canvas.querySelector('.person-node')?.offsetWidth || 240;
    const rowWidth = (count) => count * cardWidth + Math.max(0, count - 1) * 11 + 8;
    const fitScale = (width) => {
      canvas.style.width = `${width}px`;
      return Math.min(1, printPageWidth / Math.max(width, canvas.scrollWidth), heightBudget / Math.max(1, canvas.scrollHeight));
    };
    let best = { width: printPageWidth, scale: fitScale(printPageWidth) };
    for (let count = widestCount; count >= 1; count -= 1) {
      const width = rowWidth(count);
      if (width <= printPageWidth) break;
      const scale = fitScale(width);
      if (scale > best.scale) best = { width, scale };
    }
    const scale = fitScale(best.width);
    if (svg) drawConnectors(svg, new Set([...canvas.querySelectorAll('.person-card')].map((card) => `${card.dataset.generation}|${card.dataset.personId}`)), state.selectedId, partnersOf(state.selectedId).map((item) => item.id));
    canvas.style.zoom = String(scale);
    return () => {
      canvas.style.width = '';
      canvas.style.minWidth = '';
      canvas.style.minHeight = '';
      if (svg) {
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
      }
      setZoom(state.zoom);
    };
  }

  function printSection(kind) {
    const person = state.people.get(state.selectedId);
    if (!person || (kind === 'map' && state.mapMode)) return;
    if (printCleanup) printCleanup();
    const printedOn = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const heading = kind === 'map' ? 'Relationship map' : kind === 'pedigree' ? 'Pedigree chart' : 'Person record';
    elements.printFooter.textContent = `${heading} · ${person.name} · ${state.fileName} · Printed ${printedOn} from Kinship Atlas · Private family research; may include living people.`;
    document.body.classList.add(kind === 'map' ? 'print-map' : kind === 'pedigree' ? 'print-pedigree' : 'print-person');
    setPrintPageOrientation(kind === 'person' ? null : 'landscape');
    // Print the light palette even when dark mode is on. Applied before the
    // print layout is measured so the scaling maths sees light-mode sizes.
    const restoreTheme = forcePrintLightTheme();
    const restore = kind === 'map' ? preparePrintMap() : kind === 'pedigree' ? preparePrintPedigree() : null;
    printCleanup = () => {
      printCleanup = null;
      window.removeEventListener('afterprint', printCleanup);
      document.body.classList.remove('print-map', 'print-person', 'print-pedigree');
      setPrintPageOrientation(null);
      elements.printFooter.textContent = '';
      if (restore) restore();
      restoreTheme();
    };
    window.addEventListener('afterprint', printCleanup);
    window.print();
  }

  // Fits the whole pedigree chart onto one landscape page: the on-screen fit
  // scaling is dropped and the flow is scaled to the printable width instead.
  function preparePrintPedigree() {
    const flow = document.querySelector('.pedigree-flow');
    const chart = document.querySelector('#pedigreeChart');
    if (!flow || !chart) return null;
    const view = document.querySelector('#pedigreeView');
    const heading = document.querySelector('.pedigree-heading');
    const mainHeading = document.querySelector('.main-heading');
    const previous = {
      flowZoom: flow.style.zoom,
      chartOverflow: chart.style.overflow,
      chartHeight: chart.style.height,
      viewOverflow: view ? view.style.overflow : '',
      viewHeight: view ? view.style.height : '',
      headingDisplay: heading ? heading.style.display : '',
      mainHeadingDisplay: mainHeading ? mainHeading.style.display : ''
    };
    // The on-screen headings duplicate the printed page title, so drop them and
    // give the chart the whole sheet. That is what keeps it to a single page.
    if (heading) heading.style.display = 'none';
    if (mainHeading) mainHeading.style.display = 'none';
    // Measure at natural size, then scale to fit both the printable width and
    // the height left on the page so the chart never spills onto a second sheet.
    flow.style.zoom = '1';
    const naturalWidth = flow.offsetWidth;
    const naturalHeight = flow.offsetHeight;
    // A4 landscape at 96dpi is ~1122 x 793 px; margins and the printed footer
    // leave less than that, so size against the real usable area.
    const usableWidth = 1030;
    const usableHeight = 600;
    const widthScale = naturalWidth > 0 ? usableWidth / naturalWidth : 1;
    const heightScale = naturalHeight > 0 ? usableHeight / naturalHeight : 1;
    const scale = Math.min(1, widthScale, heightScale);
    flow.style.zoom = String(scale);
    if (view) { view.style.overflow = 'visible'; view.style.height = 'auto'; }
    chart.style.overflow = 'visible';
    chart.style.height = 'auto';
    return () => {
      flow.style.zoom = previous.flowZoom;
      chart.style.overflow = previous.chartOverflow;
      chart.style.height = previous.chartHeight;
      if (view) { view.style.overflow = previous.viewOverflow; view.style.height = previous.viewHeight; }
      if (heading) heading.style.display = previous.headingDisplay;
      if (mainHeading) mainHeading.style.display = previous.mainHeadingDisplay;
    };
  }

  function setZoom(value) {
    // In pedigree view the same buttons scale the pedigree chart instead.
    if (state.pedigreeMode) {
      state.pedigreeZoom = Math.max(0.4, Math.min(1.6, Math.round(value * 10) / 10));
      elements.zoomLabel.textContent = `${Math.round(state.pedigreeZoom * 100)}%`;
      elements.zoomOut.disabled = state.pedigreeZoom <= 0.4;
      elements.zoomIn.disabled = state.pedigreeZoom >= 1.6;
      fitPedigreeFlow(document.querySelector('.pedigree-flow'), document.querySelector('#pedigreeChart'));
      return;
    }
    state.zoom = Math.max(0.65, Math.min(1.35, Math.round(value * 10) / 10));
    elements.canvas.style.zoom = String(state.zoom);
    elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    elements.zoomOut.disabled = state.zoom <= 0.65;
    elements.zoomIn.disabled = state.zoom >= 1.35;
    requestAnimationFrame(redrawGraphConnectors);
  }

  function redrawGraphConnectors() {
    if (state.mapMode || state.reportsMode || state.mediaLibraryMode) return;
    const svg = elements.canvas.querySelector('.connector-layer');
    if (svg) drawConnectors(svg, new Set([...elements.canvas.querySelectorAll('.person-card')].map((card) => `${card.dataset.generation}|${card.dataset.personId}`)), state.selectedId, partnersOf(state.selectedId).map((item) => item.id));
  }

  new ResizeObserver(() => requestAnimationFrame(() => {
    redrawGraphConnectors();
    // Keep the pedigree fitted to the centre panel as the window is resized.
    if (state.pedigreeMode) renderPedigreeView();
  })).observe(elements.viewport);
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.target.matches('input, textarea')) {
      event.preventDefault();
      if (!elements.search.disabled) elements.search.focus();
    }
  });
  // Default tree: the file/folder handles live in IndexedDB (the only way a page can reopen them);
  // a readable copy of the names and paths is written to kinship-defaults.json.
  function openDefaultsDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('kinship-atlas-defaults', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function defaultsStoreRequest(mode, action) {
    const database = await openDefaultsDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('handles', mode);
      const request = action(transaction.objectStore('handles'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const readDefaultRecord = () => defaultsStoreRequest('readonly', (store) => store.get('default')).then((record) => record || null, () => null);
  const writeDefaultRecord = (record) => defaultsStoreRequest('readwrite', (store) => store.put(record, 'default'));
  const deleteDefaultRecord = () => defaultsStoreRequest('readwrite', (store) => store.delete('default'));

  const defaultsParts = () => ({
    dialog: document.querySelector('#defaultsDialog'),
    gedcomName: document.querySelector('#defaultsGedcomName'),
    gedcomPath: document.querySelector('#defaultsGedcomPath'),
    mediaName: document.querySelector('#defaultsMediaName'),
    mediaPath: document.querySelector('#defaultsMediaPath'),
    removeMedia: document.querySelector('#defaultsRemoveMedia'),
    error: document.querySelector('#defaultsError'),
    clear: document.querySelector('#defaultsClear')
  });

  function updateDefaultsButton() {
    setButtonContent(document.querySelector('#defaultsButton'), 'sliders', 'Update defaults');
  }

  function syncDefaultsDialog() {
    const parts = defaultsParts();
    const draft = state.defaultsDraft;
    parts.gedcomName.textContent = draft.gedcomName || 'None selected';
    parts.mediaName.textContent = draft.mediaName || 'None selected';
    parts.removeMedia.hidden = !draft.mediaHandle;
  }

  function openDefaultsDialog() {
    const parts = defaultsParts();
    const record = state.defaultRecord;
    state.defaultsDraft = {
      gedcomHandle: record?.gedcomHandle || null, gedcomName: record?.gedcomName || '',
      mediaHandle: record?.mediaHandle || null, mediaName: record?.mediaName || '',
      configHandle: record?.configHandle || null
    };
    parts.gedcomPath.value = record?.gedcomPath || '';
    parts.mediaPath.value = record?.mediaPath || '';
    parts.error.hidden = true;
    parts.clear.hidden = !record;
    syncDefaultsDialog();
    parts.dialog.showModal();
  }

  async function checkApplicationUpdates() {
    if (state.gedcomDirty || state.gedcomSaving) {
      showToast('Save your GEDCOM changes before updating the application.');
      return;
    }
    if (!window.KINSHIP_RELEASES) {
      showToast('The release checker could not be loaded. Restart Kinship Atlas and try again.');
      return;
    }
    const releases = window.KINSHIP_VERSION?.releases;
    const currentVersion = releases?.[0]?.version;
    elements.updateAppButton.disabled = true;
    setButtonContent(elements.updateAppButton, 'update', 'Checking for updates…');
    try {
      const update = await window.KINSHIP_RELEASES.checkForUpdate(currentVersion, releases);
      if (!update.available) {
        showToast(`Kinship Atlas ${currentVersion} is up to date.`);
        return;
      }
      elements.installAppUpdate.href = update.releaseUrl;
      elements.updateDialog.querySelector('[data-close-dialog]').textContent = 'Cancel';
      elements.updateDialogSummary.textContent = `Kinship Atlas ${update.latestVersion} is available. Download the portable-folder Windows installer to update version ${currentVersion}.`;
      elements.updateDialogNotes.textContent = update.releaseNotes.slice(0, 3000);
      elements.updateDialogNotes.hidden = !update.releaseNotes;
      elements.updateDialog.showModal();
    } catch (error) {
      elements.updateDialogSummary.textContent = 'The update check did not complete. No update was applied by this check. If an update is available, download it from GitHub and manually apply it to your installation folder containing index.html.';
      elements.updateDialogNotes.textContent = error instanceof Error ? error.message : 'The application update could not be checked.';
      elements.updateDialogNotes.hidden = false;
      elements.installAppUpdate.href = 'https://github.com/andyando/KinshipAtlas/releases/latest';
      elements.updateDialog.querySelector('[data-close-dialog]').textContent = 'Close';
      elements.updateDialog.showModal();
    } finally {
      elements.updateAppButton.disabled = false;
      setButtonContent(elements.updateAppButton, 'update', 'Check for application updates');
    }
  }

  async function writeDefaultsFile(record, allowPicker = true) {
    const payload = JSON.stringify({
      app: 'Kinship Atlas', version: 1, savedAt: new Date().toISOString(),
      gedcom: record ? { name: record.gedcomName, path: record.gedcomPath || '' } : null,
      mediaFolder: record?.mediaHandle ? { name: record.mediaName, path: record.mediaPath || '' } : null,
      homePerson: record?.homePersonId ? { id: record.homePersonId, name: record.homePersonName || '' } : null
    }, null, 2);
    const write = async (handle) => {
      const writable = await handle.createWritable();
      await writable.write(`${payload}\n`);
      await writable.close();
    };
    if (state.defaultsDraft.configHandle) {
      try {
        await write(state.defaultsDraft.configHandle);
        return state.defaultsDraft.configHandle;
      } catch {
        state.defaultsDraft.configHandle = null;
      }
    }
    if (!allowPicker || typeof window.showSaveFilePicker !== 'function') return null;
    const handle = await window.showSaveFilePicker({
      suggestedName: 'kinship-defaults.json',
      types: [{ description: 'Kinship Atlas defaults', accept: { 'application/json': ['.json'] } }]
    });
    await write(handle);
    return handle;
  }

  async function saveDefaults() {
    const parts = defaultsParts();
    const draft = state.defaultsDraft;
    if (!draft.gedcomHandle) {
      parts.error.textContent = 'Choose a GEDCOM file first.';
      parts.error.hidden = false;
      return;
    }
    const record = {
      gedcomHandle: draft.gedcomHandle, gedcomName: draft.gedcomName, gedcomPath: parts.gedcomPath.value.trim(),
      mediaHandle: draft.mediaHandle, mediaName: draft.mediaName, mediaPath: parts.mediaPath.value.trim(),
      configHandle: null,
      homePersonId: state.defaultRecord?.gedcomName === draft.gedcomName ? state.defaultRecord.homePersonId || '' : '',
      homePersonName: state.defaultRecord?.gedcomName === draft.gedcomName ? state.defaultRecord.homePersonName || '' : ''
    };
    let configSaved = false;
    try {
      record.configHandle = await writeDefaultsFile(record);
      configSaved = Boolean(record.configHandle);
    } catch (error) {
      if (error.name !== 'AbortError') showToast('kinship-defaults.json could not be written.');
    }
    try {
      await writeDefaultRecord(record);
    } catch {
      parts.error.textContent = 'This browser could not remember the default. Check that site storage is allowed.';
      parts.error.hidden = false;
      return;
    }
    state.defaultRecord = record;
    updateDefaultsButton();
    if (!state.fileName) ensureDefaultWelcomeAction();
    parts.dialog.close();
    showToast(configSaved ? 'Default saved and written to kinship-defaults.json.' : 'Default saved in this browser (kinship-defaults.json was not written).');
  }

  async function clearDefaults() {
    const parts = defaultsParts();
    try {
      state.defaultsDraft.configHandle = state.defaultRecord?.configHandle || null;
      if (state.defaultsDraft.configHandle) await writeDefaultsFile(null).catch(() => {});
      await deleteDefaultRecord();
    } catch {
      showToast('The default could not be cleared.');
      return;
    }
    state.defaultRecord = null;
    updateDefaultsButton();
    elements.canvas.querySelector('[data-open-default]')?.remove();
    parts.dialog.close();
    showToast('Default cleared. The app will open on the home page.');
  }

  function ensureDefaultWelcomeAction() {
    const welcome = elements.canvas.querySelector('.welcome-state');
    if (!welcome || !state.defaultRecord?.gedcomHandle || welcome.querySelector('[data-open-default]')) return;
    const button = makeButton(`Open default: ${state.defaultRecord.gedcomName}`, 'button button-primary welcome-default');
    button.dataset.openDefault = 'true';
    welcome.append(button);
  }

  async function openDefaultTree(interactive) {
    const record = state.defaultRecord;
    if (!record?.gedcomHandle) return;
    try {
      if (interactive) {
        // Permission prompts need this click as the user gesture.
        const read = await record.gedcomHandle.requestPermission({ mode: 'read' });
        if (record.mediaHandle) await record.mediaHandle.requestPermission({ mode: 'readwrite' }).catch(() => {});
        if (read !== 'granted') {
          showToast('Access to the default GEDCOM was not allowed.');
          return;
        }
      }
      let file;
      try {
        file = await record.gedcomHandle.getFile();
      } catch {
        showToast('The default GEDCOM could not be found. Use Update defaults to choose it again.');
        return;
      }
      if (!await loadGedcomFile(file, { source: 'handle', handle: record.gedcomHandle })) return;
      if (record.homePersonId && state.people.has(record.homePersonId)) setFocus(record.homePersonId, true);
      else showTreeWelcome();
      if (record.mediaHandle) {
        await restoreMediaDirectoryHandle(record.mediaHandle);
        await persistActiveSession();
      }
    } catch {
      showToast('The default tree could not be opened. Use Update defaults to choose it again.');
    }
  }

  // primary-data.js is written by Kinship Atlas.exe from the "Primary GEDCOM" and "Primary Media Library" folders.
  function attachPrimaryMedia(bundle) {
    if (state.mediaDirectoryHandle || !Array.isArray(bundle.media)) return;
    let added = false;
    for (const item of bundle.media) {
      if (!item?.name || !item.url || resolveMediaFile(item.name)) continue;
      const file = new File([], item.name, { type: item.type || '' });
      file.kinshipUrl = item.url;
      addFileToMediaIndex(file, item.path || item.name);
      added = true;
    }
    if (added) render();
  }

  async function openPrimaryFolderTree() {
    const bundle = window.KINSHIP_PRIMARY;
    if (!bundle || typeof bundle.gedcomText !== 'string' || !bundle.gedcomName) return false;
    if (state.fileName && state.fileName !== bundle.gedcomName) return true;
    if (!state.fileName) {
      const file = new File([bundle.gedcomText], bundle.gedcomName, { type: 'text/plain' });
      if (!await loadGedcomFile(file, { source: 'primary' })) return false;
      const record = state.defaultRecord;
      if (record?.homePersonId && record.gedcomName === bundle.gedcomName && state.people.has(record.homePersonId)) setFocus(record.homePersonId, true);
      else showTreeWelcome();
    }
    attachPrimaryMedia(bundle);
    return true;
  }

  async function applyDefaultOnStartup() {
    state.defaultRecord = await readDefaultRecord();
    updateDefaultsButton();
    if (await openPrimaryFolderTree()) return;
    if (state.fileName || !state.defaultRecord?.gedcomHandle) return;
    ensureDefaultWelcomeAction();
    try {
      if (await state.defaultRecord.gedcomHandle.queryPermission({ mode: 'read' }) === 'granted') await openDefaultTree(false);
    } catch {
      // The home page button stays available.
    }
  }

  const topMenus = [
    { menu: document.querySelector('#settingsMenu'), panel: document.querySelector('#settingsPanel'), button: document.querySelector('#settingsButton') },
    { menu: document.querySelector('#helpMenu'), panel: document.querySelector('#helpPanel'), button: document.querySelector('#helpButton') }
  ];
  function setMenuOpen(target, open) {
    for (const item of topMenus) {
      const isOpen = item === target && open;
      item.panel.hidden = !isOpen;
      item.button.setAttribute('aria-expanded', String(isOpen));
    }
  }
  function setSettingsOpen(open) {
    setMenuOpen(topMenus[0], open);
  }

  function currentAppVersion() {
    const releases = window.KINSHIP_VERSION?.releases;
    return Array.isArray(releases) && releases.length ? releases[0] : null;
  }
  function formatReleaseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return String(value || '');
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      .toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function openAboutDialog() {
    const current = currentAppVersion();
    document.querySelector('#aboutVersion').textContent = current
      ? `Version ${current.version}${current.date ? ` · released ${formatReleaseDate(current.date)}` : ''}`
      : 'Version information is unavailable (version.js was not found next to the app).';
    const history = document.querySelector('#aboutHistory');
    history.replaceChildren();
    for (const release of current ? window.KINSHIP_VERSION.releases : []) {
      const section = document.createElement('section');
      section.className = 'about-release';
      const heading = document.createElement('h4');
      heading.textContent = `Version ${release.version}`;
      if (release.date) {
        const date = document.createElement('span');
        date.className = 'about-release-date';
        date.textContent = formatReleaseDate(release.date);
        heading.append(' ', date);
      }
      const list = document.createElement('ul');
      for (const change of release.changes || []) {
        const item = document.createElement('li');
        item.textContent = change;
        list.append(item);
      }
      section.append(heading, list);
      history.append(section);
    }
    history.hidden = !current;
    document.querySelector('.about-history-title').hidden = !current;
    document.querySelector('#aboutDialog').showModal();
  }
  function showExitScreen() {
    const main = document.createElement('main');
    main.className = 'exit-screen';
    const panel = document.createElement('section');
    panel.className = 'exit-screen-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Kinship Atlas has exited';
    const message = document.createElement('p');
    message.textContent = 'The local helper has stopped. Your browser may block this app from closing a tab it did not open itself; close this tab to finish.';
    const closeButton = document.createElement('button');
    closeButton.className = 'dialog-button dialog-button-primary';
    closeButton.type = 'button';
    closeButton.textContent = 'Close tab';
    closeButton.addEventListener('click', () => window.close());
    panel.append(heading, message, closeButton);
    main.append(panel);
    document.body.replaceChildren(main);
  }
  async function exitKinshipAtlas() {
    if ((state.gedcomDirty || state.gedcomSaving) && !window.confirm('There are unsaved GEDCOM changes. Exit without saving them?')) return;
    const exitButton = document.querySelector('#exitButton');
    exitButton.disabled = true;
    setButtonContent(exitButton, 'exit', 'Exiting…');
    setSettingsOpen(false);
    await persistActiveSession();
    if (!await syncSelectionsToHelper() &&
      !window.confirm('Card images and media preferences could not be saved to the local selections file. Exit anyway? Browser preferences may still be available the next time this app is opened.')) {
      exitButton.disabled = false;
      setButtonContent(exitButton, 'exit', 'Exit Kinship Atlas');
      return;
    }
    try {
      await fetch('/api/exit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch { }
    window.close();
    window.setTimeout(showExitScreen, 250);
  }
  for (const item of topMenus) {
    item.button.addEventListener('click', () => setMenuOpen(item, item.panel.hidden));
    item.panel.addEventListener('click', () => window.setTimeout(() => setMenuOpen(item, false), 0));
  }
  document.addEventListener('click', (event) => {
    if (!topMenus.some((item) => item.menu.contains(event.target))) setMenuOpen(null, false);
  });
  document.addEventListener('keydown', (event) => {
    const open = topMenus.find((item) => !item.panel.hidden);
    if (event.key === 'Escape' && open) { setMenuOpen(open, false); open.button.focus(); }
  });
  document.querySelector('#aboutMenuButton').addEventListener('click', openAboutDialog);

  const helpDialog = document.querySelector('#helpDialog');
  const helpMenuIcons = { 'getting-started': 'book', gedcom: 'import', exploring: 'tree', editing: 'edit', media: 'media', 'maps-reports': 'chart', defaults: 'sliders' };
  function showHelpTopic(topic) {
    const articles = [...helpDialog.querySelectorAll('[data-help-article]')];
    const target = articles.find((article) => article.dataset.helpArticle === topic) || articles[0];
    for (const article of articles) article.hidden = article !== target;
    for (const button of helpDialog.querySelectorAll('[data-help-nav]')) {
      const current = button.dataset.helpNav === target.dataset.helpArticle;
      button.classList.toggle('is-current', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    document.querySelector('#helpBody').scrollTop = 0;
  }
  function openHelpDialog(topic) {
    showHelpTopic(topic);
    if (!helpDialog.open) helpDialog.showModal();
    helpDialog.querySelector('.help-nav .is-current')?.focus();
  }
  for (const button of document.querySelectorAll('#helpPanel [data-help-topic]')) {
    setButtonContent(button, helpMenuIcons[button.dataset.helpTopic] || 'book', button.textContent.trim());
    button.addEventListener('click', () => openHelpDialog(button.dataset.helpTopic));
  }
  helpDialog.querySelector('.help-nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-help-nav]');
    if (button) showHelpTopic(button.dataset.helpNav);
  });

  document.querySelector('#defaultsButton').addEventListener('click', openDefaultsDialog);
  elements.updateAppButton.addEventListener('click', checkApplicationUpdates);
  elements.treeLabel.addEventListener('click', openDefaultsDialog);

  const gedcomImport = {
    button: document.querySelector('#importGedcomButton'), input: document.querySelector('#importGedcomInput'),
    dialog: document.querySelector('#importGedcomDialog'), title: document.querySelector('#importGedcomTitle'),
    file: document.querySelector('#importGedcomFile'), message: document.querySelector('#importGedcomMessage'),
    stats: document.querySelector('#importGedcomStats'), peopleSection: document.querySelector('#importGedcomPeopleSection'),
    people: document.querySelector('#importGedcomPeople'), hint: document.querySelector('#importGedcomHint'),
    confirm: document.querySelector('#confirmGedcomImport'), cancel: document.querySelector('#cancelGedcomImport'),
    mergeSection: document.querySelector('#importGedcomMergeSection'), merges: document.querySelector('#importGedcomMerges'),
    mergeAll: document.querySelector('#importGedcomMergeAll'), mergeTotal: document.querySelector('#importGedcomMergeTotal')
  };
  let pendingGedcomImport = null;
  const countLabel = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
  const birthDateOf = (person) => person?.events.find((event) => event.type === 'BIRT' && event.date)?.date || '';

  function mergeCountText(merge) {
    const events = merge.blocks.filter((block) => block.kind === 'event').length;
    const details = merge.blocks.length + merge.fills.length - events;
    const parts = [events ? countLabel(events, 'life event', 'life events') : '', details ? countLabel(details, 'other detail', 'other details') : ''].filter(Boolean);
    return `${countLabel(merge.blocks.length + merge.fills.length, 'additional record', 'additional records')} to add: ${parts.join(', ')}`;
  }

  function renderGedcomImportMerges(plan) {
    gedcomImport.merges.replaceChildren(...plan.merges.map((merge) => {
      const incomingPerson = plan.incoming.people.get(merge.incomingId);
      const existingPerson = state.people.get(merge.existingId);
      const item = document.createElement('li');
      item.className = 'import-merge-row';
      const choice = document.createElement('label');
      choice.className = 'import-merge-choice';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.mergeId = merge.incomingId;
      const name = document.createElement('strong');
      name.textContent = incomingPerson?.name || merge.incomingId;
      const birth = birthDateOf(incomingPerson);
      choice.append(box, name, birth ? ` · b. ${birth}` : '');
      const match = document.createElement('div');
      match.className = 'import-merge-match';
      const birthPlace = existingPerson?.events.find((event) => event.type === 'BIRT')?.place || '';
      match.append('Matches ');
      const matchName = document.createElement('strong');
      matchName.textContent = existingPerson?.name || merge.existingId;
      match.append(matchName, ` in your tree${birthPlace ? ` (born ${birthPlace})` : ''} · GEDCOM @${merge.existingId}@`);
      const count = document.createElement('div');
      count.className = 'import-merge-count';
      count.textContent = mergeCountText(merge);
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Show what will be added';
      const list = document.createElement('ul');
      for (const label of [...merge.blocks.map((block) => block.label), ...merge.fills.map((fill) => fill.label)]) {
        const entry = document.createElement('li');
        entry.textContent = label;
        list.append(entry);
      }
      details.append(summary, list);
      if (merge.conflicts.length) {
        const heading = document.createElement('p');
        heading.className = 'import-merge-conflicts-title';
        heading.textContent = 'Different in the file — your tree\'s value is kept:';
        const conflicts = document.createElement('ul');
        conflicts.className = 'import-merge-conflicts';
        for (const conflict of merge.conflicts) {
          const entry = document.createElement('li');
          entry.textContent = `${conflict.label}: tree "${conflict.existing}", file "${conflict.incoming}"`;
          conflicts.append(entry);
        }
        details.append(heading, conflicts);
      }
      item.append(choice, match, count, details);
      return item;
    }));
  }

  function selectedGedcomMerges() {
    const plan = pendingGedcomImport;
    if (!plan) return [];
    const ids = new Set([...gedcomImport.merges.querySelectorAll('input[data-merge-id]:checked')].map((box) => box.dataset.mergeId));
    return plan.merges.filter((merge) => ids.has(merge.incomingId));
  }

  function syncGedcomImportConfirm() {
    const plan = pendingGedcomImport;
    if (!plan) return;
    const chosen = selectedGedcomMerges();
    const records = chosen.reduce((sum, merge) => sum + merge.blocks.length + merge.fills.length, 0);
    const parts = [];
    if (plan.importIds.size) parts.push(`Import ${countLabel(plan.importIds.size, 'person', 'people')}`);
    if (chosen.length) parts.push(`${parts.length ? 'merge' : 'Merge'} ${countLabel(chosen.length, 'person', 'people')}`);
    gedcomImport.confirm.textContent = parts.length ? `${parts.join(', ')} & save` : 'Choose people to merge';
    gedcomImport.confirm.disabled = !parts.length;
    gedcomImport.mergeAll.checked = plan.merges.length > 0 && chosen.length === plan.merges.length;
    gedcomImport.mergeAll.indeterminate = chosen.length > 0 && chosen.length < plan.merges.length;
    gedcomImport.mergeTotal.textContent = chosen.length
      ? `${countLabel(records, 'additional record', 'additional records')} will be added to ${countLabel(chosen.length, 'matching person', 'matching people')}.`
      : 'No matching people selected; their records will not be changed.';
  }

  function showGedcomImportPreview(fileName, plan) {
    const canImport = plan.importIds.size > 0 || plan.merges.length > 0;
    pendingGedcomImport = canImport ? plan : null;
    gedcomImport.file.textContent = fileName;
    const mergeText = plan.merges.length
      ? `${countLabel(plan.merges.length, 'person', 'people')} already in your tree ${plan.merges.length === 1 ? 'has' : 'have'} extra details in this file that you can merge.`
      : '';
    if (plan.importIds.size) {
      gedcomImport.title.textContent = 'Import new GEDCOM records';
      gedcomImport.message.textContent = `${countLabel(plan.importIds.size, 'new person', 'new people')} related to your current family tree will be added.${mergeText ? ` ${mergeText}` : ''}`;
    } else if (plan.merges.length) {
      gedcomImport.title.textContent = 'Merge matching records';
      gedcomImport.message.textContent = `There is nobody new to add, but ${mergeText.charAt(0).toLocaleLowerCase()}${mergeText.slice(1)}`;
    } else if (!plan.newPeople && plan.anchors.size) {
      gedcomImport.title.textContent = 'Nothing new to import';
      gedcomImport.message.textContent = 'Everyone in this file who has a birth date is already in your current family tree, and the file has no extra details for them, so there is nothing to add.';
    } else {
      gedcomImport.title.textContent = 'No related people found';
      gedcomImport.message.textContent = 'The imported file does not have any people related to your current family tree, so nothing was imported. To open this file on its own, use the "Start Again" menu option instead.';
    }
    const rows = [
      ['People in the file', plan.total, true],
      ['New and related to this tree (will be added)', plan.importIds.size, plan.importIds.size > 0],
      ['Already in this tree (same first name, last name and birth date)', plan.alreadyInTree, false],
      ['Already in this tree, with extra details that can be merged', plan.merges.length, false],
      ['Match more than one person in this tree (cannot be merged)', plan.ambiguous || 0, false],
      ['New but not related to this tree (not imported)', plan.unconnected, false],
      ['No birth date recorded (not imported)', plan.noBirthDate, false]
    ];
    gedcomImport.stats.replaceChildren(...rows.filter(([, value, always]) => always || value).map(([label, value]) => {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = label;
      const number = document.createElement('strong');
      number.textContent = value.toLocaleString();
      item.append(text, number);
      return item;
    }));
    const people = [...plan.importIds].map((id) => plan.incoming.people.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = people.slice(0, 30).map((person) => {
      const item = document.createElement('li');
      const birthDate = person.events.find((event) => event.type === 'BIRT' && event.date)?.date || '';
      item.textContent = `${person.name}${birthDate ? ` · b. ${birthDate}` : ''}`;
      return item;
    });
    if (people.length > shown.length) {
      const more = document.createElement('li');
      more.className = 'import-people-more';
      more.textContent = `…and ${(people.length - shown.length).toLocaleString()} more`;
      shown.push(more);
    }
    gedcomImport.people.replaceChildren(...shown);
    gedcomImport.peopleSection.hidden = !plan.importIds.size;
    gedcomImport.hint.hidden = !plan.importIds.size;
    gedcomImport.mergeSection.hidden = !plan.merges.length;
    if (plan.merges.length) renderGedcomImportMerges(plan);
    else gedcomImport.merges.replaceChildren();
    gedcomImport.confirm.hidden = !canImport;
    syncGedcomImportConfirm();
    gedcomImport.cancel.textContent = canImport ? 'Cancel' : 'OK';
    gedcomImport.dialog.showModal();
    (!canImport ? gedcomImport.cancel : gedcomImport.confirm.disabled ? gedcomImport.mergeAll : gedcomImport.confirm).focus();
  }
  gedcomImport.merges.addEventListener('change', syncGedcomImportConfirm);
  gedcomImport.mergeAll.addEventListener('change', () => {
    for (const box of gedcomImport.merges.querySelectorAll('input[data-merge-id]')) box.checked = gedcomImport.mergeAll.checked;
    syncGedcomImportConfirm();
  });

  setButtonContent(gedcomImport.button, 'import', 'Import new GEDCOM records');
  gedcomImport.button.addEventListener('click', () => { if (state.people.size) gedcomImport.input.click(); });
  gedcomImport.input.addEventListener('change', async () => {
    const file = gedcomImport.input.files?.[0];
    gedcomImport.input.value = '';
    if (!file || !state.people.size) return;
    if (file.size > 100 * 1024 * 1024) {
      showToast('This file is over 100 MB. Choose a smaller GEDCOM export.');
      return;
    }
    let plan;
    try {
      plan = planGedcomImport(await file.text());
    } catch (error) {
      showToast(`"${file.name}" could not be read as a GEDCOM file. ${error instanceof Error ? error.message : ''}`.trim());
      return;
    }
    showGedcomImportPreview(file.name, plan);
  });
  gedcomImport.confirm.addEventListener('click', () => {
    const plan = pendingGedcomImport;
    const mergeIds = new Set(selectedGedcomMerges().map((merge) => merge.incomingId));
    pendingGedcomImport = null;
    gedcomImport.dialog.close();
    if (!plan || (!plan.importIds.size && !mergeIds.size)) return;
    const snapshot = state.gedcomRecords.map((record) => ({ ...record, lines: [...record.lines] }));
    let result;
    try {
      result = applyGedcomImport(plan, mergeIds);
      refreshAfterGedcomMutation(state.selectedId);
    } catch {
      state.gedcomRecords = snapshot;
      refreshAfterGedcomMutation(state.selectedId);
      showToast('The import could not be completed, so no changes were made.');
      return;
    }
    const families = result.families + result.joinedFamilies;
    const messages = [];
    if (result.people) messages.push(`Imported ${countLabel(result.people, 'new person', 'new people')}${families ? ` with ${countLabel(families, 'family link', 'family links')}` : ''}.`);
    if (result.mergedPeople) messages.push(`Merged ${countLabel(result.mergedRecords, 'additional record', 'additional records')} into ${countLabel(result.mergedPeople, 'matching person', 'matching people')}.`);
    showToast(messages.join(' ') || 'Nothing was added; the tree already has these details.');
  });
  gedcomImport.dialog.addEventListener('close', () => { pendingGedcomImport = null; });
  document.querySelector('#saveGedcomButton').addEventListener('click', () => { saveGedcomFile({ interactive: true }); });
  window.addEventListener('beforeunload', (event) => {
    if (!state.gedcomDirty && !state.gedcomSaving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  setButtonContent(elements.mapViewButton, 'map', 'Map View');
  setButtonContent(elements.reportsButton, 'chart', 'Reports');
  setButtonContent(elements.mediaLibraryButton, 'media', 'Media');
  setButtonContent(document.querySelector('#mediaLibraryMenuButton'), 'media', 'Media library');
  setButtonContent(document.querySelector('#birthCountryMenuButton'), 'map', 'People without a birth country');
  setButtonContent(document.querySelector('#duplicateFinderMenuButton'), 'search', 'Find duplicate people');
  setButtonContent(document.querySelector('#exitButton'), 'exit', 'Exit Kinship Atlas');
  setButtonContent(document.querySelector('#aboutMenuButton'), 'info', 'About Kinship Atlas');
  setButtonContent(document.querySelector('#defaultsButton'), 'sliders', 'Update defaults');
  setButtonContent(elements.updateAppButton, 'update', 'Check for application updates');
  syncMediaButton();
  setButtonContent(elements.clear, 'restart', 'Start Again');
  document.querySelector('#defaultsPickGedcom').addEventListener('click', async () => {
    if (typeof window.showOpenFilePicker !== 'function') {
      defaultsParts().error.textContent = 'Setting a default needs a browser with local file access, such as Edge or Chrome.';
      defaultsParts().error.hidden = false;
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: 'GEDCOM', accept: { 'text/plain': ['.ged', '.gedcom'] } }] });
      state.defaultsDraft.gedcomHandle = handle;
      state.defaultsDraft.gedcomName = handle.name;
      defaultsParts().error.hidden = true;
      syncDefaultsDialog();
    } catch (error) {
      if (error.name !== 'AbortError') showToast('The GEDCOM file could not be selected.');
    }
  });
  document.querySelector('#defaultsPickMedia').addEventListener('click', async () => {
    if (typeof window.showDirectoryPicker !== 'function') {
      defaultsParts().error.textContent = 'Choosing a media folder needs a browser with local directory access, such as Edge or Chrome.';
      defaultsParts().error.hidden = false;
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.defaultsDraft.mediaHandle = handle;
      state.defaultsDraft.mediaName = handle.name;
      syncDefaultsDialog();
    } catch (error) {
      if (error.name !== 'AbortError') showToast('The media folder could not be selected.');
    }
  });
  document.querySelector('#defaultsRemoveMedia').addEventListener('click', () => {
    state.defaultsDraft.mediaHandle = null;
    state.defaultsDraft.mediaName = '';
    defaultsParts().mediaPath.value = '';
    syncDefaultsDialog();
  });
  document.querySelector('#defaultsSave').addEventListener('click', saveDefaults);
  document.querySelector('#defaultsClear').addEventListener('click', clearDefaults);
  document.querySelector('#exitButton').addEventListener('click', exitKinshipAtlas);

  window.addEventListener('pagehide', () => { persistActiveSession(); });
  // Apply the remembered colour theme before the first paint work below.
  applyTheme(preferredTheme(), { remember: false });

  // Syncing once at startup captures selections made before this feature (or while the helper was down).
  probeMediaHelper().then(loadHelperSelections).then(restoreActiveSession).then(applyDefaultOnStartup).then(syncSelectionsToHelper).then(loadHelperMedia);
})();
