/* Kinship Atlas runs entirely in this browser tab. It does not upload or persist imported GEDCOM data. */
(() => {
  'use strict';

  const eventNames = {
    BIRT: 'Birth', DEAT: 'Death', BAPM: 'Baptism', CHR: 'Christening', BURI: 'Burial',
    RESI: 'Residence', IMMI: 'Immigration', EMIG: 'Emigration', NATU: 'Naturalization',
    MARR: 'Marriage', DIV: 'Divorce', OCCU: 'Occupation', EDUC: 'Education', EVEN: 'Event'
  };
  const eventTags = new Set(Object.keys(eventNames));
  const countryFlagAliases = [
    ['new england', 'US', 'United States'], ['united states of america', 'US', 'United States'],
    ['northern ireland', 'gb-nir', 'Northern Ireland'], ['united kingdom', 'GB', 'United Kingdom'],
    ['great britain', 'GB', 'United Kingdom'], ['new zealand', 'NZ', 'New Zealand'],
    ['south africa', 'ZA', 'South Africa'], ['czech republic', 'CZ', 'Czech Republic'],
    ['saint helena', 'sh-hl', 'Saint Helena'], ['st helena', 'sh-hl', 'Saint Helena'],
    ['u s a', 'US', 'United States'], ['u k', 'GB', 'United Kingdom'],
    ['australia', 'AU', 'Australia'], ['canada', 'CA', 'Canada'],
    ['germany', 'DE', 'Germany'], ['deutschland', 'DE', 'Germany'],
    ['france', 'FR', 'France'], ['switzerland', 'CH', 'Switzerland'],
    ['ireland', 'IE', 'Ireland'], ['scotland', 'gb-sct', 'Scotland'],
    ['england', 'gb-eng', 'England'], ['wales', 'gb-wls', 'Wales'],
    ['united states', 'US', 'United States'], ['usa', 'US', 'United States'],
    ['britain', 'GB', 'United Kingdom'],
    ['uk', 'GB', 'United Kingdom'], ['denmark', 'DK', 'Denmark'],
    ['poland', 'PL', 'Poland'], ['italy', 'IT', 'Italy'], ['czechia', 'CZ', 'Czechia'],
    ['sweden', 'SE', 'Sweden'], ['egypt', 'EG', 'Egypt'], ['hungary', 'HU', 'Hungary'],
    ['russia', 'RU', 'Russia'], ['el salvador', 'SV', 'El Salvador'], ['brazil', 'BR', 'Brazil'],
    ['norway', 'NO', 'Norway'], ['netherlands', 'NL', 'Netherlands'], ['belgium', 'BE', 'Belgium'],
    ['spain', 'ES', 'Spain'], ['portugal', 'PT', 'Portugal'], ['austria', 'AT', 'Austria'],
    ['finland', 'FI', 'Finland'], ['india', 'IN', 'India'], ['japan', 'JP', 'Japan'],
    ['china', 'CN', 'China'], ['mexico', 'MX', 'Mexico'], ['argentina', 'AR', 'Argentina'],
    ['iceland', 'IS', 'Iceland'], ['greece', 'GR', 'Greece'], ['ukraine', 'UA', 'Ukraine'],
    ['croatia', 'HR', 'Croatia'], ['slovakia', 'SK', 'Slovakia'], ['slovenia', 'SI', 'Slovenia'],
    ['turkiye', 'TR', 'Turkiye'], ['turkey', 'TR', 'Turkey'],
    ['australie', 'AU', 'Australia'], ['new zeland', 'NZ', 'New Zealand'], ['scotlamd', 'gb-sct', 'Scotland'],
    ['papua new guinea', 'PG', 'Papua New Guinea', 'Flag_of_Papua_New_Guinea.svg'], ['cuba', 'CU', 'Cuba', 'Flag_of_Cuba.svg'],
    ['jamaica', 'JM', 'Jamaica', 'Flag_of_Jamaica.svg'], ['sudan', 'SD', 'Sudan', 'Flag_of_Sudan.svg'],
    ['armenia', 'AM', 'Armenia', 'Flag_of_Armenia.svg'], ['samoa', 'WS', 'Samoa', 'Flag_of_Samoa.svg'],
    ['puerto rico', 'PR', 'Puerto Rico', 'Flag_of_Puerto_Rico.svg'],
    ['palestine', 'PS', 'Palestine', 'Flag_of_Palestine.svg'], ['palistine', 'PS', 'Palestine', 'Flag_of_Palestine.svg'],
    ['tonga', 'TO', 'Tonga', 'Flag_of_Tonga.svg'], ['bolivia', 'BO', 'Bolivia', 'Flag_of_Bolivia.svg'],
    ['bermuda', 'BM', 'Bermuda', 'Flag_of_Bermuda.svg'], ['latvia', 'LV', 'Latvia', 'Flag_of_Latvia.svg'],
    // Listed after 'germany' so places naming both keep the German flag (equal-length ties keep array order).
    ['prussia', 'de-prussia', 'Prussia', 'Flag_of_Prussia_(1918–1933).svg'],
    ['preussen', 'de-prussia', 'Prussia', 'Flag_of_Prussia_(1918–1933).svg']
  ].sort((a, b) => b[0].length - a[0].length);
  const state = {
    mapMode: false, mapStats: null, directoryMatches: [], reportsMode: false, mediaLibraryMode: false,
    people: new Map(), families: new Map(), sources: new Map(), selectedId: null,
    fileName: '', searchText: '', history: [], historyIndex: -1, zoom: 1, showSiblings: true,
    mediaIndex: null, mediaUrls: new Map(), mediaRelativePaths: new WeakMap(), mediaDirectoryHandle: null,
    rememberedMediaDirectoryHandle: null, mediaFolderPicked: false, mediaHelper: null,
    pendingUploadPersonId: null, pendingResearchPersonId: null,
    pendingPersonSummaryId: null,
    pendingLifeEvent: null,
    primaryMediaKey: '', primaryMedia: new Map(), additionalMedia: new Map(), mediaTypes: new Map(), primaryPersonId: '',
    birthCountryEdits: new Map(), birthCountrySuggestions: new Map(), geonamesLookup: null,
    gedcomRecords: [], gedcomDirty: false, gedcomText: '', sessionSaveQueue: Promise.resolve(),
    gedcomSource: '', gedcomFileHandle: null, gedcomBaseHash: '', gedcomSaving: false,
    gedcomSaveQueue: Promise.resolve(), gedcomPickerDeclined: false,
    directoryFilters: { birthCountry: '', deathCountry: '', occupationType: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null },
    directoryYearBounds: { birth: null, death: null },
    expandedSurnames: new Set(), surnameFilter: new Set()
  };
  const elements = {
    fileInput: document.querySelector('#gedcomInput'), mediaInput: document.querySelector('#mediaInput'),
    mediaUploadInput: document.querySelector('#mediaUploadInput'), mediaButton: document.querySelector('#mediaButton'),
    updateAppButton: document.querySelector('#updateAppButton'),
    updateDialog: document.querySelector('#updateDialog'),
    updateDialogSummary: document.querySelector('#updateDialogSummary'),
    updateDialogNotes: document.querySelector('#updateDialogNotes'),
    installAppUpdate: document.querySelector('#installAppUpdate'),
    mediaFolderDialog: document.querySelector('#mediaFolderDialog'),
    linkExistingMediaFolder: document.querySelector('#linkExistingMediaFolder'),
    createMediaFolder: document.querySelector('#createMediaFolder'),
    personEditorDialog: document.querySelector('#personEditorDialog'),
    personEditorForm: document.querySelector('#personEditorForm'),
    personFieldsEditor: document.querySelector('#personFieldsEditor'),
    personEditorError: document.querySelector('#personEditorError'),
    addGedcomField: document.querySelector('#addGedcomFieldButton'),
    personSummaryDialog: document.querySelector('#personSummaryDialog'),
    personSummaryForm: document.querySelector('#personSummaryForm'),
    personSummaryGivenName: document.querySelector('#personSummaryGivenName'),
    personSummarySurname: document.querySelector('#personSummarySurname'),
    personSummarySex: document.querySelector('#personSummarySex'),
    personSummaryBirthDate: document.querySelector('#personSummaryBirthDate'),
    personSummaryBirthDatePicker: document.querySelector('#personSummaryBirthDatePicker'),
    personSummaryBirthPlace: document.querySelector('#personSummaryBirthPlace'),
    personSummaryDeathDate: document.querySelector('#personSummaryDeathDate'),
    personSummaryDeathDatePicker: document.querySelector('#personSummaryDeathDatePicker'),
    personSummaryDeathPlace: document.querySelector('#personSummaryDeathPlace'),
    personSummaryError: document.querySelector('#personSummaryError'),
    addRelativeDialog: document.querySelector('#addRelativeDialog'),
    addRelativeForm: document.querySelector('#addRelativeForm'),
    relativeType: document.querySelector('#relativeType'),
    relativeParentRole: document.querySelector('#relativeParentRole'),
    relativeParentRoleField: document.querySelector('#relativeParentRole').closest('.new-gedcom-field'),
    researchDialog: document.querySelector('#researchDialog'),
    wikiTreeQueryPreview: document.querySelector('#wikiTreeQueryPreview'),
    wikiTreeSearchStatus: document.querySelector('#wikiTreeSearchStatus'),
    wikiTreeResults: document.querySelector('#wikiTreeResults'),
    researchConsent: document.querySelector('#researchConsent'),
    confirmWikiTreeSearch: document.querySelector('#confirmWikiTreeSearch'),
    newGedcomDialog: document.querySelector('#newGedcomDialog'),
    createGedcomForm: document.querySelector('#createGedcomForm'),
    clear: document.querySelector('#clearButton'), mapViewButton: document.querySelector('#mapViewButton'),
    reportsButton: document.querySelector('#reportsButton'), reportsView: document.querySelector('#reportsView'),
    mediaLibraryButton: document.querySelector('#mediaLibraryButton'), mediaLibraryView: document.querySelector('#mediaLibraryView'),
    mediaLibraryContent: document.querySelector('#mediaLibraryContent'),
    reportsContent: document.querySelector('#reportsContent'), appShell: document.querySelector('.app-shell'),
    treeLabel: document.querySelector('#treeLabel'), peopleCount: document.querySelector('#peopleCount'),
    visibleCount: document.querySelector('#visibleCount'), clearSurnameFilter: document.querySelector('#clearSurnameFilter'),
    search: document.querySelector('#peopleSearch'), peopleList: document.querySelector('#peopleList'),
    birthCountryFilter: document.querySelector('#birthCountryFilter'),
    deathCountryFilter: document.querySelector('#deathCountryFilter'),
    occupationTypeFilter: document.querySelector('#occupationTypeFilter'),
    birthYearMin: document.querySelector('#birthYearMin'), birthYearMax: document.querySelector('#birthYearMax'),
    deathYearMin: document.querySelector('#deathYearMin'), deathYearMax: document.querySelector('#deathYearMax'),
    birthYearLabel: document.querySelector('#birthYearLabel'), deathYearLabel: document.querySelector('#deathYearLabel'),
    loadStatus: document.querySelector('#loadStatus'), statusPip: document.querySelector('.status-pip'),
    title: document.querySelector('#focusTitle'), subtitle: document.querySelector('#focusSubtitle'),
    generationLabel: document.querySelector('#generationLabel'), graphSummary: document.querySelector('#graphSummary'),
    canvas: document.querySelector('#treeCanvas'), viewport: document.querySelector('#graphViewport'),
    showSiblings: document.querySelector('#showSiblingsInput'),
    details: document.querySelector('#detailsContent'), back: document.querySelector('#backButton'),
    forward: document.querySelector('#forwardButton'), zoomIn: document.querySelector('#zoomInButton'),
    zoomOut: document.querySelector('#zoomOutButton'), zoomLabel: document.querySelector('#zoomLabel'),
    toast: document.querySelector('#toast'),
    primaryPersonBar: document.querySelector('#primaryPersonBar'),
    primaryHomeButton: document.querySelector('#primaryHomeButton'),
    primaryPersonName: document.querySelector('#primaryPersonName'),
    printMapButton: document.querySelector('#printMapButton'),
    printFooter: document.querySelector('#printFooter')
  };
  let toastTimer = 0;

  function splitXref(value) {
    return value ? value.replace(/^@|@$/g, '') : '';
  }

  function normalizeDirectoryName(value) {
    return String(value || '').toLocaleLowerCase();
  }

  function createEvent(type, value = '') {
    return { type, value: cleanEventDisplayText(value), date: '', place: '', detail: '', notes: [], sources: [], mediaPaths: [], ordinal: -1 };
  }

  function cleanGedcomValue(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanEventDisplayText(value) {
    const decodeEntities = (text) => text.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value) => {
      const normalized = value.toLowerCase();
      if (normalized === 'amp') return '&';
      if (normalized === 'lt') return '<';
      if (normalized === 'gt') return '>';
      if (normalized === 'quot') return '"';
      if (normalized === 'apos') return "'";
      if (normalized === 'nbsp') return ' ';
      const codePoint = normalized.startsWith('#x')
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : entity;
    });
    const decoded = decodeEntities(decodeEntities(String(value || '')));
    return decoded
      .replace(/<\?[^>]*\?>|<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatGedcomDate(value) {
    const [year, month, day] = value.split('-');
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return year && monthNames[Number(month) - 1] ? `${Number(day)} ${monthNames[Number(month) - 1]} ${year}` : '';
  }

  function datePickerValue(gedcomDate) {
    const value = String(gedcomDate || '').trim();
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const gedcomDateMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    let year;
    let month;
    let day;
    if (isoDate) {
      [, year, month, day] = isoDate;
    } else if (gedcomDateMatch) {
      const monthIndex = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
        .indexOf(gedcomDateMatch[2].toUpperCase());
      if (monthIndex < 0) return '';
      day = gedcomDateMatch[1].padStart(2, '0');
      month = String(monthIndex + 1).padStart(2, '0');
      year = gedcomDateMatch[3];
    } else {
      return '';
    }

    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 ||
        date.getUTCDate() !== Number(day)) return '';
    return `${year}-${month}-${day}`;
  }

  function enteredGedcomDate(value) {
    const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    return datePickerValue(text) && /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? formatGedcomDate(text) : text;
  }

  function splitGedcomRecords(text) {
    const records = [];
    let active = null;
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const start = line.match(/^0\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (start) {
        if (active) records.push(active);
        active = { xref: splitXref(start[1]), tag: start[2].toUpperCase(), lines: [line] };
      } else if (active) {
        active.lines.push(line);
      }
    }
    if (active) records.push(active);
    return records;
  }

  function parseGedcomField(line) {
    const match = line.match(/^(\d+)\s+([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    return match ? { level: Number(match[1]), tag: match[2].toUpperCase(), value: match[3] || '' } : null;
  }

  function serializeGedcomRecords(records) {
    return `${records.flatMap((record) => record.lines).join('\r\n').replace(/\r?\n*$/, '')}\r\n`;
  }

  // Maps each top-level "0 @X@ OBJE" media record to its FILE paths, so "n OBJE @X@" pointers can be resolved.
  function mediaRecordFiles(records) {
    const files = new Map();
    for (const record of records) {
      if (record.tag !== 'OBJE' || !record.xref) continue;
      const paths = record.lines.slice(1).map(parseGedcomField)
        .filter((field) => field?.tag === 'FILE' && field.value.trim())
        .map((field) => field.value.trim());
      if (paths.length) files.set(record.xref, paths);
    }
    return files;
  }

  function getActiveSessionId() {
    let sessionId = sessionStorage.getItem('kinship-atlas-session-id');
    if (!sessionId) {
      sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('kinship-atlas-session-id', sessionId);
    }
    return sessionId;
  }

  function openSessionDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('kinship-atlas-session', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sessions');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readActiveSession() {
    const database = await openSessionDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction('sessions', 'readonly').objectStore('sessions').get(getActiveSessionId());
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function writeActiveSession(session) {
    const database = await openSessionDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(session, getActiveSessionId());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Session write aborted.'));
    });
  }

  async function persistActiveSession() {
    if (!state.fileName || !state.gedcomText) return;
    const snapshot = {
      fileName: state.fileName,
      gedcomText: state.gedcomText,
      gedcomDirty: state.gedcomDirty,
      gedcomSource: state.gedcomSource,
      gedcomBaseHash: state.gedcomBaseHash,
      gedcomFileHandle: state.gedcomFileHandle,
      primaryMediaKey: state.primaryMediaKey,
      selectedId: state.selectedId,
      mediaDirectoryHandle: state.mediaDirectoryHandle
    };
    state.sessionSaveQueue = state.sessionSaveQueue.catch(() => {}).then(() => writeActiveSession(snapshot));
    try {
      await state.sessionSaveQueue;
    } catch {
      showToast('This browser could not retain the current session. Keep the GEDCOM saved to a file.');
    }
  }

  async function clearActiveSession() {
    const sessionId = sessionStorage.getItem('kinship-atlas-session-id');
    sessionStorage.removeItem('kinship-atlas-session-id');
    if (!sessionId) return;
    await state.sessionSaveQueue.catch(() => {});
    try {
      const database = await openSessionDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('sessions', 'readwrite');
        transaction.objectStore('sessions').delete(sessionId);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      showToast('The saved browser session could not be cleared.');
    }
    state.sessionSaveQueue = Promise.resolve();
  }

  function parseGedcom(text) {
    const people = new Map();
    const families = new Map();
    const sources = new Map();
    const gedcomRecords = splitGedcomRecords(text);
    const individualRecords = new Map(gedcomRecords.filter((entry) => entry.tag === 'INDI').map((entry) => [entry.xref, entry]));
    const mediaFiles = mediaRecordFiles(gedcomRecords);
    let record = null;
    let activeEvent = null;
    let activeName = null;
    // The life event whose level-1 block is being read; media anywhere inside it (including its source citations) is linked to it.
    let mediaEvent = null;

    function addMediaPaths(tag, value) {
      const pointer = tag === 'OBJE' ? splitXref(value) : '';
      const paths = tag === 'FILE' ? [value.trim()] : (pointer && mediaFiles.get(pointer)) || [];
      for (const path of paths) {
        if (!path) continue;
        if (record.mediaPaths) record.mediaPaths.push(path);
        if (mediaEvent) mediaEvent.mediaPaths.push(path);
      }
    }

    function finishRecord() {
      if (!record) return;
      for (const lifeEvent of [...(record.events || []), record.marriage, record.divorce]) {
        if (lifeEvent) lifeEvent.mediaPaths = [...new Set(lifeEvent.mediaPaths)];
      }
      if (record.type === 'INDI') {
        const rawName = record.rawName || '';
        const parsedSurname = (rawName.match(/\/([^/]+)\//) || [])[1] || '';
        const fallbackName = rawName.replaceAll('/', '').replace(/\s+/g, ' ').trim();
        const maidenName = record.nameEntries.find((entry) => ['BIRTH', 'MAIDEN'].includes(entry.type))?.value.replaceAll('/', '').replace(/\s+/g, ' ').trim() || '';
        const surname = record.surname || parsedSurname;
        let fallbackGivenName = (rawName.split('/')[0] || '').trim();
        if (!rawName.includes('/') && surname && fallbackGivenName.toLocaleLowerCase().endsWith(surname.toLocaleLowerCase())) {
          fallbackGivenName = fallbackGivenName.slice(0, -surname.length).trim();
        }
        const givenName = record.givenName || fallbackGivenName;
        const name = [givenName, surname]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || fallbackName || record.id;
        const rawRecord = individualRecords.get(record.id);
        people.set(record.id, {
          id: record.id, name, givenName, surname, sex: record.sex, maidenName,
          parentFamilyIds: record.parentFamilyIds, spouseFamilyIds: record.spouseFamilyIds,
          events: record.events, sourceIds: [...new Set(record.sourceIds)],
          mediaPaths: [...new Set(record.mediaPaths)],
          fields: (rawRecord?.lines.slice(1) || []).map(parseGedcomField).filter(Boolean)
        });
      } else if (record.type === 'FAM') {
        families.set(record.id, {
          id: record.id, husbandId: record.husbandId, wifeId: record.wifeId,
          childIds: [...new Set(record.childIds)],           marriage: record.marriage, divorce: record.divorce,
          sourceIds: [...new Set(record.sourceIds)]
        });
      } else if (record.type === 'SOUR') {
        sources.set(record.id, { id: record.id, title: record.title || '', author: record.author || '' });
      }
      record = null;
      activeEvent = null;
      activeName = null;
      mediaEvent = null;
    }

    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const match = rawLine.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (!match) continue;
      const level = Number(match[1]);
      const xref = splitXref(match[2]);
      const tag = match[3].toUpperCase();
      const value = match[4] || '';

      if (level === 0) {
        finishRecord();
        if (!xref || !['INDI', 'FAM', 'SOUR'].includes(tag)) continue;
        if (tag === 'INDI') {
          record = { id: xref, type: tag, rawName: '', givenName: '', surname: '', sex: '', nameEntries: [], parentFamilyIds: [], spouseFamilyIds: [], events: [], sourceIds: [], mediaPaths: [] };
        } else if (tag === 'FAM') {
          record = { id: xref, type: tag, husbandId: '', wifeId: '', childIds: [], marriage: null, sourceIds: [] };
        } else {
          record = { id: xref, type: tag, title: '', author: '' };
        }
        continue;
      }
      if (!record) continue;

      if (record.type === 'INDI') {
        if (level === 1) mediaEvent = null;
        if (level === 1 && tag !== 'NAME') activeName = null;
        if (level === 1 && eventTags.has(tag)) {
          activeEvent = createEvent(tag, value);
          activeEvent.ordinal = record.events.length;
          record.events.push(activeEvent);
          mediaEvent = activeEvent;
          continue;
        }
        if (level === 1 && tag === 'OCCU') {
          activeEvent = createEvent('OCCU', value);
          activeEvent.ordinal = record.events.length;
          record.events.push(activeEvent);
          mediaEvent = activeEvent;
          continue;
        }
        if (level === 1 && tag === 'NAME') {
          const entry = { value, type: '' };
          record.nameEntries.push(entry);
          if (!record.rawName) record.rawName = value;
          activeName = entry;
          activeEvent = null;
          continue;
        }
        if (level === 1 && tag === 'SEX') { record.sex = value; activeEvent = null; continue; }
        if (level === 1 && tag === 'FAMC') { record.parentFamilyIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag === 'FAMS') { record.spouseFamilyIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag !== 'SOUR' && tag !== 'NOTE') activeEvent = null;
        if (activeName && level === 2 && tag === 'TYPE') { activeName.type = value.trim().toUpperCase(); continue; }
        if (tag === 'GIVN' && level === 2) {
          if (!activeName || activeName === record.nameEntries[0]) record.givenName = value;
          continue;
        }
        if (tag === 'SURN' && level === 2) {
          if (!activeName || activeName === record.nameEntries[0]) record.surname = value;
          continue;
        }
        if (tag === 'FILE' && level >= 2) { addMediaPaths(tag, value); continue; }
        if (tag === 'OBJE' && splitXref(value)) { addMediaPaths(tag, value); continue; }
        if (tag === 'SOUR') {
          const sourceId = splitXref(value);
          if (sourceId) {
            record.sourceIds.push(sourceId);
            if (activeEvent && level >= 2) activeEvent.sources.push(sourceId);
          }
          continue;
        }
        if (activeEvent && level >= 2) {
          if (tag === 'DATE') activeEvent.date = cleanEventDisplayText(value);
          else if (tag === 'PLAC') activeEvent.place = cleanEventDisplayText(value);
          else if (tag === 'LATI' && level >= 3) activeEvent.lat = parseGedcomCoordinate(value) ?? undefined;
          else if (tag === 'LONG' && level >= 3) activeEvent.lon = parseGedcomCoordinate(value) ?? undefined;
          else if (tag === 'TYPE') activeEvent.detail = cleanEventDisplayText(value);
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(cleanEventDisplayText(value));
        }
      } else if (record.type === 'FAM') {
        if (level === 1) mediaEvent = null;
        if (level === 1 && tag === 'MARR') {
          record.marriage = createEvent('MARR');
          activeEvent = record.marriage;
          mediaEvent = activeEvent;
          continue;
        }
        if (level === 1 && tag === 'DIV') {
          record.divorce = createEvent('DIV');
          activeEvent = record.divorce;
          mediaEvent = activeEvent;
          continue;
        }
        // Family-level media is only kept when it belongs to a marriage or divorce event.
        if (mediaEvent && ((tag === 'FILE' && level >= 2) || (tag === 'OBJE' && splitXref(value)))) { addMediaPaths(tag, value); continue; }
        if (level === 1 && tag === 'HUSB') { record.husbandId = splitXref(value); activeEvent = null; continue; }
        if (level === 1 && tag === 'WIFE') { record.wifeId = splitXref(value); activeEvent = null; continue; }
        if (level === 1 && tag === 'CHIL') { record.childIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag !== 'SOUR' && tag !== 'NOTE') activeEvent = null;
        if (tag === 'SOUR') {
          const sourceId = splitXref(value);
          if (sourceId) {
            record.sourceIds.push(sourceId);
            if (activeEvent && level >= 2) activeEvent.sources.push(sourceId);
          }
          continue;
        }
        if (activeEvent && level >= 2) {
          if (tag === 'DATE') activeEvent.date = cleanEventDisplayText(value);
          else if (tag === 'PLAC') activeEvent.place = cleanEventDisplayText(value);
          else if (tag === 'TYPE' && level === 2 && activeEvent === record.marriage) activeEvent.detail = cleanEventDisplayText(value);
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(cleanEventDisplayText(value));
        }
      } else if (record.type === 'SOUR') {
        if (level === 1 && tag === 'TITL') record.title = cleanEventDisplayText(value);
        else if (level === 1 && tag === 'AUTH') record.author = cleanEventDisplayText(value);
      }
    }
    finishRecord();
    if (!people.size) throw new Error('No individual records were found in this file.');
    return { people, families, sources, gedcomRecords };
  }

  function personName(id) {
    return state.people.get(id)?.name || 'Unknown person';
  }

  function parentsOf(personId) {
    const person = state.people.get(personId);
    if (!person) return [];
    const ids = new Set();
    for (const familyId of person.parentFamilyIds) {
      const family = state.families.get(familyId);
      if (!family) continue;
      for (const parentId of [family.husbandId, family.wifeId]) {
        if (parentId && parentId !== personId && state.people.has(parentId)) ids.add(parentId);
      }
    }
    return [...ids];
  }

  function partnersOf(personId) {
    const person = state.people.get(personId);
    if (!person) return [];
    const partners = new Map();
    for (const familyId of person.spouseFamilyIds) {
      const family = state.families.get(familyId);
      if (!family) continue;
      const partnerId = family.husbandId === personId ? family.wifeId : family.husbandId;
      if (partnerId && state.people.has(partnerId)) partners.set(partnerId, family);
    }
    return [...partners.entries()].map(([id, family]) => ({ id, family }));
  }

  function childrenOf(personId) {
    const person = state.people.get(personId);
    if (!person) return [];
    const children = new Set();
    for (const familyId of person.spouseFamilyIds) {
      const family = state.families.get(familyId);
      if (family) family.childIds.forEach((id) => { if (state.people.has(id)) children.add(id); });
    }
    return [...children];
  }

  // Built from FAM records directly so links still count when only one side records them (CHIL without FAMC, etc.).
  function kinshipGraph() {
    const graph = { parents: new Map(), children: new Map(), partners: new Map() };
    const link = (map, from, to) => {
      if (!map.has(from)) map.set(from, new Set());
      map.get(from).add(to);
    };
    for (const family of state.families.values()) {
      const couple = [family.husbandId, family.wifeId].filter((id) => id && state.people.has(id));
      if (couple.length === 2 && couple[0] !== couple[1]) {
        link(graph.partners, couple[0], couple[1]);
        link(graph.partners, couple[1], couple[0]);
      }
      for (const childId of family.childIds) {
        if (!state.people.has(childId)) continue;
        for (const parentId of couple) {
          if (parentId === childId) continue;
          link(graph.parents, childId, parentId);
          link(graph.children, parentId, childId);
        }
      }
    }
    return graph;
  }

  function ancestorDepths(graph, personId) {
    const depths = new Map([[personId, 0]]);
    const queue = [personId];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const parentId of graph.parents.get(current) || []) {
        if (depths.has(parentId)) continue;
        depths.set(parentId, depths.get(current) + 1);
        queue.push(parentId);
      }
    }
    return depths;
  }

  // up = generations from fromId to the closest common ancestor; down = generations from toId to it.
  function bloodRelation(graph, fromId, toId) {
    const fromDepths = ancestorDepths(graph, fromId);
    const toDepths = ancestorDepths(graph, toId);
    let best = null;
    for (const [ancestorId, up] of fromDepths) {
      const down = toDepths.get(ancestorId);
      if (down === undefined) continue;
      if (!best || up + down < best.up + best.down) best = { up, down, ancestors: [ancestorId] };
      else if (up === best.up && down === best.down) best.ancestors.push(ancestorId);
    }
    if (best && best.up === 1 && best.down === 1) {
      // Only call siblings "half" when both have two recorded parents, so missing data is not mistaken for a half relationship.
      best.half = best.ancestors.length === 1 && (graph.parents.get(fromId)?.size || 0) >= 2 && (graph.parents.get(toId)?.size || 0) >= 2;
    }
    return best;
  }

  function genderedTerm(sex, male, female, neutral) {
    return sex === 'M' ? male : sex === 'F' ? female : neutral;
  }

  function ordinalNumber(value) {
    const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[value % 10] || 'th';
    return `${value}${suffix}`;
  }

  function bloodTerm(up, down, sex, half = false) {
    const term = (male, female, neutral) => genderedTerm(sex, male, female, neutral);
    const greats = (count) => count <= 0 ? '' : count <= 2 ? 'great-'.repeat(count) : `${count}× great-`;
    if (!up) return down === 1 ? term('son', 'daughter', 'child') : `${greats(down - 2)}grand${term('son', 'daughter', 'child')}`;
    if (!down) return up === 1 ? term('father', 'mother', 'parent') : `${greats(up - 2)}grand${term('father', 'mother', 'parent')}`;
    if (up === 1 && down === 1) return `${half ? 'half-' : ''}${term('brother', 'sister', 'sibling')}`;
    if (up === 1) return `${greats(down - 2)}${term('nephew', 'niece', 'niece/nephew')}`;
    if (down === 1) return `${greats(up - 2)}${term('uncle', 'aunt', 'aunt/uncle')}`;
    const removed = Math.abs(up - down);
    const removedText = !removed ? '' : removed === 1 ? ' once removed' : removed === 2 ? ' twice removed' : ` ${removed} times removed`;
    return `${ordinalNumber(Math.min(up, down) - 1)} cousin${removedText}`;
  }

  function affinalTerm(match, sex) {
    const { rel, side } = match;
    const term = (male, female, neutral) => genderedTerm(sex, male, female, neutral);
    if (side === 'primary') {
      // The person is a blood relative of the primary person's partner.
      if (rel.up === 1 && rel.down === 0) return term('father-in-law', 'mother-in-law', 'parent-in-law');
      if (rel.up === 1 && rel.down === 1) return term('brother-in-law', 'sister-in-law', 'sibling-in-law');
      if (rel.up === 0 && rel.down === 1) return term('stepson', 'stepdaughter', 'stepchild');
      if (rel.up === 0 && rel.down === 2) return term('step-grandson', 'step-granddaughter', 'step-grandchild');
      return `spouse/partner's ${bloodTerm(rel.up, rel.down, sex, rel.half)}`;
    }
    // The person is the partner of one of the primary person's blood relatives.
    const relativeSex = state.people.get(match.via)?.sex;
    if (rel.up === 1 && rel.down === 0) return term('stepfather', 'stepmother', 'step-parent');
    if (rel.up === 1 && rel.down === 1) return term('brother-in-law', 'sister-in-law', 'sibling-in-law');
    if (rel.up === 0 && rel.down === 1) return term('son-in-law', 'daughter-in-law', 'child-in-law');
    if (rel.up === 0 && rel.down === 2) return term('grandson-in-law', 'granddaughter-in-law', 'grandchild-in-law');
    if (rel.up >= 2 && rel.down === 1) return `${bloodTerm(rel.up, 1, sex)} by marriage`;
    return `${bloodTerm(rel.up, rel.down, relativeSex, rel.half)}'s spouse/partner`;
  }

  function describeKinship(graph, primaryId, personId) {
    const person = state.people.get(personId);
    const blood = bloodRelation(graph, primaryId, personId);
    if (blood) {
      return {
        kind: 'blood', term: bloodTerm(blood.up, blood.down, person.sex, blood.half),
        ancestors: blood.up && blood.down ? blood.ancestors : []
      };
    }
    if (graph.partners.get(primaryId)?.has(personId)) {
      return { kind: 'partner', term: genderedTerm(person.sex, 'husband/partner', 'wife/partner', 'spouse/partner') };
    }
    let best = null;
    const consider = (rel, via, side) => {
      if (rel && (!best || rel.up + rel.down < best.rel.up + best.rel.down)) best = { rel, via, side };
    };
    for (const partnerId of graph.partners.get(primaryId) || []) consider(bloodRelation(graph, partnerId, personId), partnerId, 'primary');
    for (const partnerId of graph.partners.get(personId) || []) consider(bloodRelation(graph, primaryId, partnerId), partnerId, 'person');
    if (best) return { kind: 'affinal', term: affinalTerm(best, person.sex), via: best.via };
    return { kind: 'distant' };
  }

  function kinshipPath(graph, fromId, toId) {
    const previous = new Map([[fromId, null]]);
    const queue = [fromId];
    for (let index = 0; index < queue.length && !previous.has(toId); index += 1) {
      const current = queue[index];
      for (const [type, links] of [['parent', graph.parents], ['child', graph.children], ['partner', graph.partners]]) {
        for (const nextId of links.get(current) || []) {
          if (previous.has(nextId)) continue;
          previous.set(nextId, { from: current, type });
          queue.push(nextId);
        }
      }
    }
    if (!previous.has(toId)) return null;
    const steps = [];
    for (let id = toId; id !== fromId; id = previous.get(id).from) steps.unshift({ id, type: previous.get(id).type });
    return steps;
  }

  function siblingsOf(personId) {
    const person = state.people.get(personId);
    if (!person) return [];
    const siblings = new Set();
    for (const familyId of person.parentFamilyIds) {
      const family = state.families.get(familyId);
      if (family) family.childIds.forEach((id) => { if (id !== personId && state.people.has(id)) siblings.add(id); });
    }
    return [...siblings];
  }

  function generationLevels(startId, direction, depth) {
    const levels = new Map();
    let current = new Set([startId]);
    for (let distance = 1; distance <= depth; distance += 1) {
      const next = new Set();
      for (const id of current) {
        const related = direction === 'up' ? parentsOf(id) : childrenOf(id);
        related.forEach((relatedId) => next.add(relatedId));
      }
      if (!next.size) break;
      levels.set(direction === 'up' ? -distance : distance, next);
      current = next;
    }
    return levels;
  }

  function yearFrom(date) {
    const match = (date || '').match(/(?:^|\s)(\d{4})(?:$|\s)/);
    return match ? match[1] : '';
  }

  function lifespan(person) {
    const birth = person.events.find((event) => event.type === 'BIRT')?.date || '';
    const death = person.events.find((event) => event.type === 'DEAT')?.date || '';
    const start = yearFrom(birth);
    const end = yearFrom(death);
    if (start && end) return `${start} — ${end}`;
    if (start) return `b. ${start}`;
    if (end) return `d. ${end}`;
    return 'Dates not recorded';
  }

  function isRecordedDeceased(person) {
    return Boolean(person?.events.some((event) => event.type === 'DEAT' && (event.date || event.place || event.value)));
  }

  function buildWikiTreeQuery(person) {
    const birth = person.events.find((event) => event.type === 'BIRT');
    const death = person.events.find((event) => event.type === 'DEAT');
    const surname = (person.surname || '').trim();
    const fullName = (person.name || '').trim();
    const firstName = fullName.toLocaleLowerCase().endsWith(` ${surname.toLocaleLowerCase()}`)
      ? fullName.slice(0, -(surname.length + 1)).trim()
      : fullName;
    return {
      firstName: firstName.slice(0, 120),
      lastName: surname.slice(0, 120),
      birthYear: yearFrom(birth?.date),
      deathYear: yearFrom(death?.date),
      birthCountry: countryFlagForPlace(birth?.place)?.country || ''
    };
  }

  function renderWikiTreeQueryPreview(query) {
    const fields = [
      ['First name', query.firstName],
      ['Last name', query.lastName],
      ['Year born', query.birthYear],
      ['Year died', query.deathYear],
      ['Country born', query.birthCountry]
    ];
    elements.wikiTreeQueryPreview.replaceChildren();
    for (const [label, value] of fields) {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value || 'Not recorded';
      if (!value) description.classList.add('is-missing');
      elements.wikiTreeQueryPreview.append(term, description);
    }
  }

  function setWikiTreeSearchStatus(message) {
    elements.wikiTreeSearchStatus.textContent = message;
    elements.wikiTreeSearchStatus.hidden = !message;
  }

  function submitWikiTreeSearch(query) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = 'https://www.wikitree.com/wiki/Special:SearchPerson';
    form.target = '_blank';
    form.rel = 'noopener noreferrer';
    form.referrerPolicy = 'no-referrer';
    form.hidden = true;

    const fields = [
      ['wpSearch', '1'],
      ['wpSearchButton', 'Search'],
      ['date_spread', '2'],
      ['date_include', 'neither'],
      ['last_name_match', 'all'],
      ['skip_variants', '0'],
      ['wpFirst', query.firstName],
      ['wpLast', query.lastName],
      ['wpBirthDate', query.birthYear],
      ['wpDeathDate', query.deathYear],
      ['birth_location', query.birthCountry]
    ];
    for (const [name, value] of fields) {
      if (!value) continue;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }

    document.body.append(form);
    form.submit();
    window.setTimeout(() => form.remove(), 0);
  }

  function renderWikiTreeFallback(query) {
    const link = document.createElement('a');
    link.className = 'wikitree-site-link';
    link.href = 'https://www.wikitree.com/wiki/Special:SearchPerson';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open this search directly on WikiTree';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      submitWikiTreeSearch(query);
    });
    elements.wikiTreeResults.append(link);
  }

  function searchWikiTree() {
    const person = state.people.get(state.pendingResearchPersonId);
    if (!elements.researchConsent.checked || !isRecordedDeceased(person)) return;
    const query = buildWikiTreeQuery(person);
    // WikiTree's API blocks in-page requests from other sites (CORS), so open its search page in a new tab instead.
    submitWikiTreeSearch(query);
    elements.wikiTreeResults.replaceChildren();
    elements.wikiTreeResults.hidden = false;
    renderWikiTreeFallback(query);
    setWikiTreeSearchStatus('Opened the WikiTree search in a new tab. If it did not open, use the link below.');
  }

  function countryFlagForPlace(place) {
    const normalized = ` ${String(place || '').toLocaleLowerCase().replace(/\u00df/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const match = countryFlagAliases.find(([alias]) => normalized.includes(` ${alias} `));
    if (!match) return null;
    const [, code, country, file = `${code.toLocaleLowerCase()}.svg`] = match;
    return { code: code.toLocaleLowerCase(), country, file };
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function sortedPeople(ids) {
    return [...new Set(ids)].map((id) => state.people.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function makeButton(text, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 4200);
  }

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
    ['unclassified', 'Unclassified'], ['portrait', 'Portrait'], ['family-photo', 'Family photo'],
    ['document', 'Document'], ['certificate', 'Certificate'], ['letter', 'Letter'],
    ['newspaper', 'Newspaper'], ['map-plan', 'Map / plan'], ['will-probate', 'Will / Probate'],
    ['building-house', 'Building / house'], ['military-records', 'Military records'],
    ['wedding', 'Wedding'], ['birth', 'Birth'],
    ['death', 'Death'], ['census', 'Census'],
    ['directory', 'Directory'], ['other', 'Other']
  ];
  const mediaTypeStorageKey = (storageKey) => `kinship-atlas:media-types:v1:${storageKey}`;

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
    const person = state.people.get(state.pendingUploadPersonId);
    const directoryHandle = state.mediaDirectoryHandle;
    const mode = mediaSaveMode();
    state.pendingUploadPersonId = null;
    elements.mediaUploadInput.value = '';
    if (!person || mode === 'none' || mode === 'unsupported') return;

    let savedCount = 0;
    let failedCount = 0;
    const addedPaths = new Set();
    for (const file of files) {
      if (!isSupportedMediaFile(file)) {
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
      justAddedMedia = null;
      elements.details.querySelector('.is-just-added')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const linked = saveAdditionalMedia();
      await persistActiveSession();
      const linkStatus = linked ? 'Person links saved in this browser.' : 'Links will last only for this tab because browser storage is unavailable.';
      const destination = mode === 'folder'
        ? 'saved to the selected folder'
        : `saved to the helper's media folder (${state.mediaHelper.folder})`;
      showToast(`${savedCount} media item${savedCount === 1 ? '' : 's'} ${destination}. ${linkStatus}${failedCount ? ` ${failedCount} item${failedCount === 1 ? '' : 's'} could not be saved.` : ''}`);
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
      const start = record ? record.lines.findIndex((line, index) => index > 0 &&
        parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === pending.config.tag) : -1;
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
    document.querySelector('#mediaLibraryMenuButton').disabled = false;
    document.querySelector('#birthCountryMenuButton').disabled = false;
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
    const rowZero = nameOrder(new Set([selected.id, ...partners, ...siblingIds]));
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
    const canvasRect = elements.canvas.getBoundingClientRect();
    const width = Math.max(elements.canvas.scrollWidth, canvasRect.width);
    const height = Math.max(elements.canvas.scrollHeight, canvasRect.height);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();

    const grandchildCards = [...elements.canvas.querySelectorAll('.person-card[data-generation="2"]')];
    const firstGrandchildTop = grandchildCards[0]?.getBoundingClientRect().top;
    const grandchildrenWrap = grandchildCards.some((card) => Math.abs(card.getBoundingClientRect().top - firstGrandchildTop) > 1);

    function cardFor(generation, id) {
      return elements.canvas.querySelector(`.person-card[data-generation="${generation}"][data-person-id="${CSS.escape(id)}"]`);
    }
    function point(card, side) {
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        x: rect.left - canvasRect.left + rect.width / 2,
        y: side === 'top' ? rect.top - canvasRect.top : rect.bottom - canvasRect.top
      };
    }
    function addPath(from, to, spouse = false) {
      if (!from || !to) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (spouse) {
        const left = from.x < to.x ? from : to;
        const right = from.x < to.x ? to : from;
        const y = Math.max(12, Math.min(left.y, right.y) - 18);
        path.setAttribute('d', `M ${left.x} ${left.y} C ${left.x} ${y}, ${right.x} ${y}, ${right.x} ${right.y}`);
        path.setAttribute('class', 'spouse-link');
      } else {
        const middle = (from.y + to.y) / 2;
        path.setAttribute('d', `M ${from.x} ${from.y} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`);
        path.setAttribute('class', 'parent-link');
      }
      svg.append(path);
    }

    for (const [familyId, family] of state.families) {
      for (const generation of [-3, -2, -1, 0, 1]) {
        if (generation === 1 && grandchildrenWrap) continue;
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
          addPath(origin, point(cardFor(generation + 1, childId), 'top'));
        }
      }
    }
    const focusCard = cardFor(0, selectedId);
    for (const partnerId of partners) addPath(point(focusCard, 'bottom'), point(cardFor(0, partnerId), 'bottom'), true);
  }

  function renderRoster() {
    const query = normalizeDirectoryName(state.searchText.trim());
    const matches = [...state.people.values()].filter((person) => {
      if (query && !normalizeDirectoryName(person.name).includes(query)) return false;
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
      const expanded = state.expandedSurnames.has(surnameKey) || Boolean(query);
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
          const unknown = document.createElement('span');
          unknown.className = 'relation-button empty';
          unknown.textContent = item.label;
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
    const siblings = new Map();
    for (const family of parentFamilies) {
      const present = [family.husbandId, family.wifeId].filter(Boolean);
      for (const id of present) if (state.people.has(id)) parents.push({ id, label: personName(id), familyId: family.id });
      if (present.length < 2) parents.push({ id: '', label: 'Parent not identified' });
      family.childIds.forEach((id) => { if (id !== person.id && state.people.has(id) && !siblings.has(id)) siblings.set(id, family.id); });
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
        item.append(marker, body);
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
      const photo = document.createElement('img');
      photo.className = 'detail-monogram-photo';
      photo.src = mediaUrl(cardImage.file);
      photo.alt = `${person.name} card image`;
      const changeImage = document.createElement('button');
      changeImage.type = 'button';
      changeImage.className = 'detail-monogram-edit';
      changeImage.dataset.changeCardImage = person.id;
      changeImage.title = 'Choose a different card image';
      changeImage.setAttribute('aria-label', 'Choose a different card image from attached media');
      setButtonContent(changeImage, 'edit', '');
      monogram.append(photo, changeImage);
    } else {
      monogram.textContent = initials(person.name);
    }
    const kicker = document.createElement('div'); kicker.className = 'eyebrow'; kicker.textContent = person.sex ? `PERSON RECORD · ${person.sex}` : 'PERSON RECORD';
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
    if (state.defaultRecord?.gedcomHandle && state.defaultRecord.gedcomName === state.fileName) {
      const isHome = state.defaultRecord.homePersonId === person.id;
      const homeButton = makeButton(isHome ? '★ Home person' : '☆ Set as home person', 'research-button');
      homeButton.dataset.homePerson = person.id;
      homeButton.title = isHome ? 'Click to stop opening on this person' : 'Select this person when the default GEDCOM opens';
      personActions.append(homeButton);
    }
    if (isRecordedDeceased(person)) {
      const researchButton = iconButton('search', 'Search WikiTree');
      researchButton.dataset.wikitreeSearch = person.id;
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
    elements.details.append(renderEvents(person));
    const relationSection = section('Relationships');
    for (const [label, items] of relationshipGroups(person)) addRelationGroup(relationSection, label, items);
    elements.details.append(relationSection);
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

  function mediaLibraryEntries() {
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
        entry = { key, path: displayPath, file, aliases: new Set(), people: new Map(), events: new Set() };
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
    return [...entries.values()].sort((a, b) => (a.file?.name || a.path).localeCompare(b.file?.name || b.path, undefined, { sensitivity: 'base' }));
  }

  function renderMediaLibrary() {
    if (!state.people.size) {
      elements.mediaLibraryContent.replaceChildren();
      return;
    }
    document.querySelector('#mediaLibraryFileName').textContent = state.fileName;
    const search = document.querySelector('#mediaLibrarySearch').value.trim().toLocaleLowerCase();
    const selectedType = document.querySelector('#mediaLibraryTypeFilter').value;
    const allEntries = mediaLibraryEntries();
    const entries = allEntries.filter((entry) => {
      const type = state.mediaTypes.get(entry.key) || 'unclassified';
      if (selectedType && type !== selectedType) return false;
      const names = [...entry.people.values()].map(({ person }) => person.name).join(' ');
      return !search || `${entry.file?.name || entry.path} ${names}`.toLocaleLowerCase().includes(search);
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
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'media-library-card';
      const preview = document.createElement('div');
      preview.className = 'media-library-preview';
      if (entry.file && isImageFile(entry.file)) {
        const link = document.createElement('a');
        link.href = mediaUrl(entry.file);
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('aria-label', `View ${entry.file.name}`);
        const image = document.createElement('img');
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
        renderMediaLibrary();
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
      elements.mediaLibraryContent.append(card);
    }
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

  function getMapInstance() {
    if (!mapInstance && window.KinshipMap) {
      mapInstance = window.KinshipMap.create({
        container: document.querySelector('#mapView'),
        getPeople: () => state.directoryMatches || [],
        placeEventsFor: (person) => [...person.events, ...marriageEventsFor(person)],
        getSelectedId: () => state.selectedId,
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
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/><path d="M9 8h6"/>'
  };

  function setButtonContent(button, icon, text) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'button-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = buttonIcons[icon];
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
    if (on) {
      renderReports();
      elements.reportsView.scrollTop = 0;
    }
  }

  function setMediaLibraryMode(on) {
    if (on && !state.people.size) return;
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
    if (on) {
      renderMediaLibrary();
      elements.mediaLibraryView.scrollTop = 0;
    }
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
      occupations: new Map(), withOccupation: 0,
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

  function appendReportBars(panel, rows, category) {
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
      row.append(reportElement('span', 'report-bar-label', label), track, reportElement('span', 'report-bar-value', value.toLocaleString()));
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
      appendReportBars(countryPanel, countryRows, 'countries');
      countryPanel.append(reportElement('p', 'report-note', `People are counted once per country where any of their life events took place, so totals can exceed the number of people.${stats.unmatchedPlaces.size ? ` ${stats.unmatchedPlaces.size.toLocaleString()} distinct place ${stats.unmatchedPlaces.size === 1 ? 'name does' : 'names do'} not include a recognised country.` : ''}`));
    } else {
      countryPanel.append(reportElement('p', 'report-empty', 'No recognised countries were found in the recorded places.'));
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

    charts.append(sexPanel, mediaPanel, birthCountryPanel, deathCountryPanel, earliestPanel, birthsPanel, countryPanel, occupationPanel);
    elements.reportsContent.replaceChildren(cards, charts);
  }

  function printReports() {
    if (!state.reportsMode) return;
    if (printCleanup) printCleanup();
    const printedOn = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    elements.printFooter.textContent = `Reports · ${state.fileName} · Printed ${printedOn} from Kinship Atlas · Private family research; may include living people.`;
    document.body.classList.add('print-reports');
    setPrintPageOrientation(null);
    const cleanup = () => {
      printCleanup = null;
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('print-reports');
      elements.printFooter.textContent = '';
    };
    printCleanup = cleanup;
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
  function appendGedcomFieldRow(field = { level: 1, tag: 'NOTE', value: '' }) {
    const row = document.createElement('div');
    row.className = 'gedcom-field-row';
    const level = document.createElement('input');
    level.className = 'gedcom-level-input';
    level.type = 'number';
    level.min = '1';
    level.max = '99';
    level.value = String(field.level);
    level.setAttribute('aria-label', 'GEDCOM level');
    const tag = document.createElement('input');
    tag.className = 'gedcom-tag-input';
    tag.type = 'text';
    tag.maxLength = 32;
    tag.value = field.tag;
    tag.setAttribute('aria-label', 'GEDCOM tag');
    const value = document.createElement('textarea');
    value.className = 'gedcom-value-input';
    value.rows = 1;
    value.value = field.value;
    value.setAttribute('aria-label', 'GEDCOM field value');
    const remove = makeButton('×', 'gedcom-field-remove');
    remove.setAttribute('aria-label', 'Remove GEDCOM field');
    row.append(level, tag, value, remove);
    elements.personFieldsEditor.append(row);
    return row;
  }

  function openPersonEditor(person) {
    state.pendingEditPersonId = person.id;
    elements.personEditorError.hidden = true;
    elements.personFieldsEditor.replaceChildren();
    for (const field of person.fields) appendGedcomFieldRow(field);
    elements.personEditorDialog.showModal();
  }

  function openPersonSummaryEditor(person) {
    state.pendingPersonSummaryId = person.id;
    elements.personSummaryError.hidden = true;
    elements.personSummaryGivenName.value = person.givenName;
    elements.personSummarySurname.value = person.surname;
    elements.personSummarySex.querySelector('[data-custom-sex]')?.remove();
    if (person.sex && !['F', 'M', 'X', 'U'].includes(person.sex)) {
      const option = document.createElement('option');
      option.value = person.sex;
      option.textContent = `Recorded value · ${person.sex}`;
      option.dataset.customSex = 'true';
      elements.personSummarySex.append(option);
    }
    elements.personSummarySex.value = person.sex;
    elements.personSummaryBirthDate.value = person.events.find((event) => event.type === 'BIRT')?.date || '';
    elements.personSummaryBirthDatePicker.value = datePickerValue(elements.personSummaryBirthDate.value);
    elements.personSummaryBirthPlace.value = person.events.find((event) => event.type === 'BIRT')?.place || '';
    elements.personSummaryDeathDate.value = person.events.find((event) => event.type === 'DEAT')?.date || '';
    elements.personSummaryDeathDatePicker.value = datePickerValue(elements.personSummaryDeathDate.value);
    elements.personSummaryDeathPlace.value = person.events.find((event) => event.type === 'DEAT')?.place || '';
    elements.personSummaryDialog.showModal();
  }

  function updatePrimaryName(lines, givenName, surname) {
    const nameIndex = lines.findIndex((line, index) => index > 0 && parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === 'NAME');
    const nameValue = `${givenName}${surname ? `${givenName ? ' ' : ''}/${surname}/` : ''}`;
    if (nameIndex < 0) {
      lines.push(`1 NAME ${nameValue}`);
      if (givenName) lines.push(`2 GIVN ${givenName}`);
      if (surname) lines.push(`2 SURN ${surname}`);
      return;
    }

    lines[nameIndex] = `1 NAME${nameValue ? ` ${nameValue}` : ''}`;
    let end = nameIndex + 1;
    while (end < lines.length) {
      const field = parseGedcomField(lines[end]);
      if (field && field.level <= 1) break;
      end += 1;
    }
    let hasGivenName = false;
    let hasSurname = false;
    for (let index = nameIndex + 1; index < end; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level !== 2) continue;
      if (field.tag === 'GIVN') {
        lines[index] = `2 GIVN${givenName ? ` ${givenName}` : ''}`;
        hasGivenName = true;
      } else if (field.tag === 'SURN') {
        lines[index] = `2 SURN${surname ? ` ${surname}` : ''}`;
        hasSurname = true;
      }
    }
    let insertAt = nameIndex + 1;
    if (givenName && !hasGivenName) {
      lines.splice(insertAt, 0, `2 GIVN ${givenName}`);
      insertAt += 1;
      end += 1;
    }
    if (surname && !hasSurname) lines.splice(Math.min(insertAt, end), 0, `2 SURN ${surname}`);
  }

  function updateEventField(lines, eventTag, fieldTag, value) {
    let eventIndex = lines.findIndex((line, index) => index > 0 &&
      parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === eventTag);
    if (eventIndex < 0) {
      if (!value) return;
      lines.push(`1 ${eventTag}`, `2 ${fieldTag} ${value}`);
      return;
    }

    let eventEnd = eventIndex + 1;
    while (eventEnd < lines.length) {
      const field = parseGedcomField(lines[eventEnd]);
      if (field && field.level <= 1) break;
      eventEnd += 1;
    }
    const fieldIndexes = [];
    for (let index = eventIndex + 1; index < eventEnd; index += 1) {
      const eventField = parseGedcomField(lines[index]);
      if (eventField?.level === 2 && eventField.tag === fieldTag) fieldIndexes.push(index);
    }
    if (fieldIndexes.length) {
      if (value) {
        lines[fieldIndexes[0]] = `2 ${fieldTag} ${value}`;
        for (const index of fieldIndexes.slice(1).reverse()) lines.splice(index, 1);
      } else {
        for (const index of fieldIndexes.reverse()) lines.splice(index, 1);
      }
    } else if (value) {
      lines.splice(eventIndex + 1, 0, `2 ${fieldTag} ${value}`);
    }
  }

  // Marriage is a family event: it is saved as MARR inside the FAM record that links HUSB and WIFE.
  // Military has no individual-level GEDCOM tag, so it is stored as EVEN with a TYPE.
  const lifeEventTypes = [
    { key: 'RESI', label: 'Residence', tag: 'RESI', descLabel: 'Address / notes', mode: 'note' },
    { key: 'MARR', label: 'Marriage', tag: 'MARR', family: true, descLabel: '', mode: 'family' },
    { key: 'DIV', label: 'Divorce', tag: 'DIV', family: true, descLabel: '', mode: 'family' },
    { key: 'BAPM', label: 'Baptism', tag: 'BAPM', descLabel: 'Church / notes', mode: 'note' },
    { key: 'EDUC', label: 'Education', tag: 'EDUC', descLabel: 'School or qualification', mode: 'value' },
    { key: 'OCCU', label: 'Occupation', tag: 'OCCU', descLabel: 'Occupation', mode: 'value' },
    { key: 'MILT', label: 'Military', tag: 'EVEN', type: 'Military Service', descLabel: 'Unit / rank / notes', mode: 'value' },
    { key: 'EMIG', label: 'Departure', tag: 'EMIG', descLabel: 'Notes', mode: 'note' },
    { key: 'IMMI', label: 'Arrival', tag: 'IMMI', descLabel: 'Notes', mode: 'note' },
    { key: 'BURI', label: 'Burial', tag: 'BURI', descLabel: 'Cemetery / notes', mode: 'note' },
    { key: 'OTHER', label: 'Other', tag: 'EVEN', custom: true, descLabel: 'Description / notes', mode: 'value' }
  ];

  function lifeEventConfigFor(event) {
    if (event.familyId) return lifeEventTypes.find((entry) => entry.family && entry.tag === event.type);
    if (event.type === 'EVEN') {
      const detail = (event.detail || '').trim().toLocaleLowerCase();
      return lifeEventTypes.find((entry) => entry.type && entry.type.toLocaleLowerCase() === detail) ||
        lifeEventTypes.find((entry) => entry.custom);
    }
    return lifeEventTypes.find((entry) => entry.tag === event.type && !entry.custom && !entry.type && !entry.family) ||
      { key: event.type, label: eventNames[event.type] || event.type, tag: event.type, descLabel: 'Notes', mode: 'note' };
  }

  const lifeEventFields = () => ({
    dialog: document.querySelector('#lifeEventDialog'),
    title: document.querySelector('#lifeEventTitle'),
    type: document.querySelector('#lifeEventType'),
    customField: document.querySelector('#lifeEventCustomTypeField'),
    custom: document.querySelector('#lifeEventCustomType'),
    date: document.querySelector('#lifeEventDate'),
    picker: document.querySelector('#lifeEventDatePicker'),
    place: document.querySelector('#lifeEventPlace'),
    descLabel: document.querySelector('#lifeEventDescriptionLabel'),
    descField: document.querySelector('#lifeEventDescriptionField'),
    desc: document.querySelector('#lifeEventDescription'),
    spouseField: document.querySelector('#lifeEventSpouseField'),
    spouse: document.querySelector('#lifeEventSpouse'),
    newGivenField: document.querySelector('#lifeEventNewSpouseGivenField'),
    newGiven: document.querySelector('#lifeEventNewSpouseGiven'),
    newSurnameField: document.querySelector('#lifeEventNewSpouseSurnameField'),
    newSurname: document.querySelector('#lifeEventNewSpouseSurname'),
    marriageTypeField: document.querySelector('#lifeEventMarriageTypeField'),
    marriageType: document.querySelector('#lifeEventMarriageType'),
    error: document.querySelector('#lifeEventError'),
    remove: document.querySelector('#lifeEventDelete'),
    submit: document.querySelector('#lifeEventForm button[type="submit"]'),
    mediaHeading: document.querySelector('#lifeEventMediaHeading'),
    mediaAdd: document.querySelector('#lifeEventMediaAdd'),
    mediaInput: document.querySelector('#lifeEventMediaInput'),
    mediaList: document.querySelector('#lifeEventMediaList'),
    mediaHint: document.querySelector('#lifeEventMediaHint'),
    sourceList: document.querySelector('#lifeEventSourceList'),
    sourceAdd: document.querySelector('#lifeEventSourceAdd')
  });

  function eventMediaLines(names) {
    return names.flatMap((name) => {
      const extension = (name.match(/\.([^.\\/]+)$/)?.[1] || '').toLocaleLowerCase();
      return ['2 OBJE', `3 FILE ${name}`, ...(extension ? [`4 FORM ${extension}`] : [])];
    });
  }

  function mediaLinkedText(names) {
    return names.length ? ` ${names.length} media item${names.length === 1 ? '' : 's'} linked to the event.` : '';
  }

  // Each "2 SOUR" citation in an event block, with its deeper lines (PAGE, DATA, _APID, ...).
  function readEventCitations(lines, start) {
    const citations = [];
    const end = lifeEventBlockEnd(lines, start);
    for (let index = start + 1; index < end; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level !== 2 || field.tag !== 'SOUR') continue;
      let stop = index + 1;
      while (stop < end && (parseGedcomField(lines[stop])?.level ?? 3) > 2) stop += 1;
      const block = lines.slice(index, stop);
      const pageIndex = block.findIndex((line, offset) => offset > 0 && parseGedcomField(line)?.level === 3 && parseGedcomField(line)?.tag === 'PAGE');
      let page = '';
      if (pageIndex >= 0) {
        page = parseGedcomField(block[pageIndex]).value;
        for (let offset = pageIndex + 1; offset < block.length; offset += 1) {
          const part = parseGedcomField(block[offset]);
          if (!part || part.level <= 3) break;
          if (part.level === 4 && part.tag === 'CONC') page += part.value;
          else if (part.level === 4 && part.tag === 'CONT') page += ` ${part.value}`;
        }
      }
      citations.push({ index, lines: block, sourceId: gedcomPointer(field.value), text: gedcomPointer(field.value) ? '' : field.value.trim(), page: page.replace(/\s+/g, ' ').trim() });
      index = stop - 1;
    }
    return citations;
  }

  function lifeEventBlockFor(pending) {
    if (pending.familyId) {
      const record = findGedcomRecord('FAM', pending.familyId);
      const lines = record?.lines || [];
      const start = lines.findIndex((line, index) => index > 0 && parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === pending.config.tag);
      return start < 0 ? null : { lines, start };
    }
    if (pending.ordinal === null) return null;
    const lines = findGedcomRecord('INDI', pending.personId)?.lines || [];
    const start = findLifeEventStart(lines, pending.ordinal);
    return start < 0 ? null : { lines, start };
  }

  function sourceOptionLabel(source) {
    const title = cleanEventDisplayText(source.title) || 'Untitled source';
    return `${title.length > 90 ? `${title.slice(0, 87)}…` : title} (${source.id})`;
  }

  function addLifeEventSourceRow(citation = { originalIndex: -1, sourceId: '', page: '', text: '' }) {
    const fields = lifeEventFields();
    const row = document.createElement('div');
    row.className = 'life-event-source-row';
    row.dataset.originalIndex = String(citation.originalIndex);
    const select = document.createElement('select');
    select.className = 'life-event-source-select';
    select.setAttribute('aria-label', 'Source');
    if (citation.text) {
      select.append(new Option(`Text citation: ${citation.text.slice(0, 80)}`, '__text__'));
      select.disabled = true;
    } else {
      select.append(new Option('Choose a source…', ''), new Option('＋ New source…', '__new__'));
      const sources = [...state.sources.values()].sort((a, b) =>
        (cleanEventDisplayText(a.title) || '\uffff').localeCompare(cleanEventDisplayText(b.title) || '\uffff') || a.id.localeCompare(b.id));
      for (const source of sources) select.append(new Option(sourceOptionLabel(source), source.id));
      if (citation.sourceId && !state.sources.has(citation.sourceId)) {
        select.append(new Option(`Missing source record (${citation.sourceId})`, citation.sourceId));
      }
      select.value = citation.sourceId || '';
    }
    const page = document.createElement('input');
    page.type = 'text';
    page.className = 'life-event-source-page';
    page.maxLength = 240;
    page.placeholder = 'Page / citation detail';
    page.setAttribute('aria-label', 'Page or citation detail');
    page.autocomplete = 'off';
    page.value = citation.page || '';
    page.disabled = Boolean(citation.text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'life-event-source-remove';
    remove.textContent = '×';
    remove.title = 'Remove this source from the event (the source record is kept)';
    remove.setAttribute('aria-label', 'Remove this source from the event');
    const newTitle = document.createElement('input');
    newTitle.type = 'text';
    newTitle.className = 'life-event-source-new';
    newTitle.maxLength = 240;
    newTitle.placeholder = 'New source title, e.g. 1881 England Census';
    newTitle.setAttribute('aria-label', 'New source title');
    newTitle.autocomplete = 'off';
    newTitle.hidden = true;
    select.addEventListener('change', () => {
      newTitle.hidden = select.value !== '__new__';
      if (!newTitle.hidden) newTitle.focus();
    });
    remove.addEventListener('click', () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      syncLifeEventSourceEmpty();
      (next?.querySelector('select:not(:disabled), input') || fields.sourceAdd).focus();
    });
    row.append(select, page, remove, newTitle);
    const extraLines = citation.lines ? citation.lines.slice(1).map(parseGedcomField).filter((entry) => entry?.level === 3 && entry.tag !== 'PAGE').length : 0;
    if (extraLines) {
      const extra = document.createElement('span');
      extra.className = 'life-event-source-extra';
      extra.textContent = `${extraLines} other citation detail${extraLines === 1 ? '' : 's'} (e.g. data, quality or record ID) will be kept.`;
      row.append(extra);
    }
    fields.sourceList.querySelector('.life-event-media-empty')?.remove();
    fields.sourceList.append(row);
    return row;
  }

  function syncLifeEventSourceEmpty() {
    const list = lifeEventFields().sourceList;
    if (list.querySelector('.life-event-source-row')) return;
    if (!list.querySelector('.life-event-media-empty')) {
      const empty = document.createElement('span');
      empty.className = 'life-event-media-empty';
      empty.textContent = 'No sources cited for this event.';
      list.append(empty);
    }
  }

  function initLifeEventSources() {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    fields.sourceList.replaceChildren();
    const block = lifeEventBlockFor(pending);
    pending.citations = block ? readEventCitations(block.lines, block.start) : [];
    pending.citations.forEach((citation, originalIndex) => addLifeEventSourceRow({ ...citation, originalIndex }));
    syncLifeEventSourceEmpty();
  }

  // Reads the source rows. New sources get reserved IDs; their records are only added by commitNewSources().
  function collectLifeEventCitations() {
    const pending = state.pendingLifeEvent;
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const reserved = new Set(state.gedcomRecords.filter((record) => record.tag === 'SOUR').map((record) => record.xref));
    const newSources = new Map();
    const lines = [];
    for (const row of lifeEventFields().sourceList.querySelectorAll('.life-event-source-row')) {
      const original = pending.citations?.[Number(row.dataset.originalIndex)] || null;
      const select = row.querySelector('.life-event-source-select');
      const page = clean(row.querySelector('.life-event-source-page').value);
      if (original?.text) { lines.push(...original.lines); continue; }
      let sourceId = select.value;
      if (sourceId === '__new__') {
        const title = clean(row.querySelector('.life-event-source-new').value);
        if (!title) return { error: 'Enter a title for the new source, or choose an existing source.' };
        const key = title.toLocaleLowerCase();
        const existing = [...state.sources.values()].find((source) => cleanEventDisplayText(source.title).toLocaleLowerCase() === key);
        if (existing) sourceId = existing.id;
        else if (newSources.has(key)) sourceId = newSources.get(key).id;
        else {
          let number = 1;
          while (reserved.has(`S${number}`)) number += 1;
          sourceId = `S${number}`;
          reserved.add(sourceId);
          newSources.set(key, { id: sourceId, title });
        }
      }
      if (!sourceId) {
        if (!page) continue;
        return { error: 'Choose a source for each citation detail, or remove the empty source row.' };
      }
      if (original) {
        const block = [...original.lines];
        if (sourceId !== original.sourceId) block[0] = `2 SOUR @${sourceId}@`;
        if (page !== original.page) {
          const pageIndex = block.findIndex((line, index) => index > 0 && parseGedcomField(line)?.level === 3 && parseGedcomField(line)?.tag === 'PAGE');
          if (pageIndex >= 0) {
            let stop = pageIndex + 1;
            while (stop < block.length && (parseGedcomField(block[stop])?.level ?? 4) > 3) stop += 1;
            block.splice(pageIndex, stop - pageIndex, ...(page ? [`3 PAGE ${page}`] : []));
          } else if (page) block.splice(1, 0, `3 PAGE ${page}`);
        }
        lines.push(...block);
      } else {
        lines.push(`2 SOUR @${sourceId}@`, ...(page ? [`3 PAGE ${page}`] : []));
      }
    }
    return {
      lines, newSources: [...newSources.values()],
      changed: lines.join('\n') !== (pending.citations || []).flatMap((citation) => citation.lines).join('\n')
    };
  }

  function commitNewSources(sources) {
    for (const source of sources) {
      addRecordBeforeTrailer({ xref: source.id, tag: 'SOUR', lines: [`0 @${source.id}@ SOUR`, `1 TITL ${source.title}`] });
    }
  }

  // Swaps the event's existing citation blocks for the edited ones, keeping them where they were.
  function replaceEventCitations(lines, start, citationLines) {
    const current = readEventCitations(lines, start);
    const insertAt = current[0]?.index ?? lifeEventBlockEnd(lines, start);
    for (const citation of [...current].reverse()) lines.splice(citation.index, citation.lines.length);
    lines.splice(insertAt, 0, ...citationLines);
  }

  function sourcesChangedText(citations) {
    return citations.newSources.length
      ? ` ${citations.newSources.length} new source record${citations.newSources.length === 1 ? '' : 's'} created.` : '';
  }

  const lifeEventPreviewUrls = [];
  function releaseLifeEventPreviewUrls() {
    lifeEventPreviewUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  }

  function availableLifeEventMedia(pending) {
    const person = state.people.get(pending.personId);
    const paths = [...mediaPathsForPerson(pending.personId),
      ...(person?.events || []).flatMap((event) => event.mediaPaths || [])];
    return [...new Set(paths)].filter((path) =>
      !pending.existingMedia.includes(path) && !(pending.linkedMedia || []).includes(path));
  }

  function renderLifeEventMedia() {
    const fields = lifeEventFields();
    const pending = state.pendingLifeEvent;
    if (!pending) return;
    releaseLifeEventPreviewUrls();
    const existing = [...pending.existingMedia, ...(pending.linkedMedia || [])];
    const selector = document.querySelector('#lifeEventExistingMedia');
    const previous = selector.value;
    selector.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select attached media…';
    selector.append(placeholder);
    for (const path of availableLifeEventMedia(pending)) {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = path;
      selector.append(option);
    }
    selector.value = [...selector.options].some((option) => option.value === previous) ? previous : '';
    selector.disabled = selector.options.length === 1;
    document.querySelector('#lifeEventLinkMedia').disabled = selector.disabled;
    const added = pending.newMedia;
    const makeItem = (name, thumbContent, className = '', href = '') => {
      const item = document.createElement('div');
      item.className = `life-event-media-item${className ? ` ${className}` : ''}`;
      item.title = name;
      const thumb = document.createElement(href ? 'a' : 'span');
      thumb.className = 'life-event-media-thumb';
      if (href) {
        thumb.href = href;
        thumb.target = '_blank';
        thumb.rel = 'noopener';
        thumb.setAttribute('aria-label', `Open ${name}`);
      }
      thumb.append(thumbContent);
      const caption = document.createElement('span');
      caption.className = 'life-event-media-name';
      caption.textContent = name;
      item.append(thumb, caption);
      return item;
    };
    const makeRemoveButton = (dataKey, index, icon, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'life-event-media-remove';
      button.dataset[dataKey] = String(index);
      button.textContent = icon;
      button.title = label;
      button.setAttribute('aria-label', label);
      return button;
    };
    const previewFor = (file, url) => {
      if (!isImageFile(file)) return 'PDF';
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.loading = 'lazy';
      return image;
    };

    const items = [];
    let missing = 0;
    existing.forEach((path, index) => {
      const file = state.mediaIndex ? resolveMediaFile(path) : null;
      const name = file?.name || path.split(/[\\/]/).pop() || path;
      let item;
      if (file) {
        item = makeItem(name, previewFor(file, mediaUrl(file)), '', mediaUrl(file));
      } else {
        missing += 1;
        item = makeItem(name, state.mediaIndex ? 'Not found' : 'Not linked', 'is-missing');
      }
      item.append(index < pending.existingMedia.length
        ? makeRemoveButton('deleteEventMedia', index, '🗑', `Remove or delete ${name}`)
        : makeRemoveButton('removeLinkedMedia', index - pending.existingMedia.length, '×', `Don't link ${name}`));
      items.push(item);
    });
    added.forEach((entry, index) => {
      const url = URL.createObjectURL(entry.file);
      lifeEventPreviewUrls.push(url);
      const item = makeItem(entry.file.name, previewFor(entry.file, url), 'is-new');
      const badge = document.createElement('span');
      badge.className = 'life-event-media-badge';
      badge.textContent = 'New';
      item.append(badge, makeRemoveButton('removeNewMedia', index, '×', `Don't upload ${entry.file.name}`));
      items.push(item);
    });
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'life-event-media-empty';
      empty.textContent = 'No media linked to this event.';
      items.push(empty);
    }
    fields.mediaList.replaceChildren(...items);
    fields.mediaHeading.textContent = `Media (${existing.length + added.length})`;

    const mode = mediaSaveMode();
    fields.mediaAdd.disabled = mode === 'none' || mode === 'unsupported';
    fields.mediaAdd.title = mode === 'folder'
      ? 'Choose photos or PDFs to save to the selected media folder'
      : mode === 'helper'
        ? `Choose photos or PDFs; saved by the local helper to ${state.mediaHelper.folder}`
        : 'Select a media folder before uploading files';
    const hints = [];
    if (pending.mediaNotice) hints.push(pending.mediaNotice);
    if (mode === 'none') hints.push('Select a media folder with the Media button before uploading files.');
    if (mode === 'unsupported') hints.push('This browser cannot save files. Use Chrome or Edge, or run the local helper, to upload media.');
    if (missing && !state.mediaIndex) hints.push('Link the media folder to preview attached files.');
    if (added.length) hints.push('New files are saved to the media folder and linked to this event when you click Save.');
    fields.mediaHint.textContent = hints.join(' ');
    fields.mediaHint.hidden = !hints.length;
  }

  function addLifeEventMediaFiles(files) {
    const pending = state.pendingLifeEvent;
    if (!pending) return;
    const fields = lifeEventFields();
    const rejected = files.filter((file) => !isSupportedMediaFile(file));
    for (const file of files) {
      if (!isSupportedMediaFile(file)) continue;
      if (pending.newMedia.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) continue;
      pending.newMedia.push({ file, savedName: null });
    }
    fields.error.hidden = !rejected.length;
    if (rejected.length) fields.error.textContent = `${rejected.map((file) => file.name).join(', ')} ${rejected.length === 1 ? 'is' : 'are'} not a photo or PDF.`;
    renderLifeEventMedia();
  }

  // Mirrors saveLifeEvent's input checks so files are not uploaded for an event that cannot be saved.
  function lifeEventInputError() {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const config = pending.ordinal === null
      ? lifeEventTypes.find((entry) => entry.key === fields.type.value) || lifeEventTypes[0]
      : pending.config;
    if (config.family) {
      if (pending.familyId) return '';
      const spouseId = fields.spouse.value;
      if (!spouseId && !clean(fields.newGiven.value).replaceAll('/', ' ').trim()) return 'Choose a spouse from the list, or enter the new spouse\'s given name.';
      const familyKey = config.tag === 'DIV' ? 'divorce' : 'marriage';
      const existingFamily = spouseId && [...state.families.values()].find((family) =>
        (family.husbandId === pending.personId && family.wifeId === spouseId) ||
        (family.wifeId === pending.personId && family.husbandId === spouseId));
      if (existingFamily?.[familyKey]) return `A ${config.label.toLocaleLowerCase()} with this person is already recorded. Click it in the Life events list to edit it.`;
      return '';
    }
    if (config.custom && !clean(fields.custom.value)) return 'Enter a name for this event, such as Census or Probate.';
    if (pending.ordinal === null && !clean(fields.date.value) && !clean(fields.place.value) && !clean(fields.desc.value)) {
      return 'Enter a date, place or description for this event.';
    }
    return '';
  }

  // Returns the saved names of all new files, or null when any could not be saved.
  async function uploadLifeEventMedia() {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    const waiting = pending.newMedia.filter((entry) => !entry.savedName);
    if (waiting.length) {
      const mode = mediaSaveMode();
      if (mode !== 'folder' && mode !== 'helper') {
        fields.error.textContent = 'Select a media folder before saving new media, or remove the new files.';
        fields.error.hidden = false;
        return null;
      }
      const directoryHandle = state.mediaDirectoryHandle;
      const submitText = fields.submit.textContent;
      fields.submit.disabled = true;
      fields.submit.textContent = 'Saving media…';
      const failed = [];
      for (const entry of waiting) {
        try {
          entry.savedName = await storeMediaFile(entry.file, mode, directoryHandle);
        } catch {
          failed.push(entry.file.name);
        }
      }
      fields.submit.disabled = false;
      fields.submit.textContent = submitText;
      if (state.pendingLifeEvent !== pending) return null;
      if (failed.length) {
        fields.error.textContent = `${failed.join(', ')} could not be saved to the media folder. Remove ${failed.length === 1 ? 'it' : 'them'} or try again.`;
        fields.error.hidden = false;
        return null;
      }
    }
    return [...new Set([...(pending.linkedMedia || []), ...pending.newMedia.map((entry) => entry.savedName)])];
  }

  let pendingEventMediaDelete = null;
  let pendingMediaLibraryDelete = null;
  let pendingPersonDelete = null;

  function openEventMediaRemoveDialog(path) {
    if (!path || !state.pendingLifeEvent) return;
    const file = state.mediaIndex ? resolveMediaFile(path) : null;
    const name = file?.name || path.split(/[\\/]/).pop() || path;
    pendingEventMediaDelete = { path, name, eventState: state.pendingLifeEvent };
    document.querySelector('#eventMediaRemoveName').textContent = name;
    const deleteButton = document.querySelector('#eventMediaDeleteFile');
    const detail = document.querySelector('#eventMediaDeleteFileDetail');
    const canDelete = canDeleteMediaFile(file);
    deleteButton.disabled = !canDelete;
    detail.textContent = canDelete
      ? 'Deletes the image or PDF from the media folder and removes every link to it in this tree.'
      : !file
        ? 'Unavailable: the file was not found in the linked media folder.'
        : 'Unavailable: select the media folder with write access (Chrome or Edge), or use the local helper, to delete files.';
    document.querySelector('#eventMediaRemoveDialog').showModal();
  }

  function openMediaLibraryDeleteDialog(entry) {
    if (!entry?.file || !canDeleteMediaFile(entry.file)) return;
    const linkedPeople = [...entry.people.values()].map(({ person }) => person.name);
    pendingMediaLibraryDelete = {
      path: entry.path,
      key: entry.key,
      name: entry.file.name,
      personId: entry.people.keys().next().value || state.selectedId || state.people.keys().next().value
    };
    document.querySelector('#mediaLibraryDeleteName').textContent = entry.file.name;
    document.querySelector('#mediaLibraryDeleteText').textContent =
      `This file will be permanently deleted from the media folder and cannot be recovered from Kinship Atlas.${linkedPeople.length ? ` It is linked to ${linkedPeople.join(', ')}; all links to it in this GEDCOM will be removed.` : ' No person links are recorded for this file.'}`;
    document.querySelector('#mediaLibraryDeleteDialog').showModal();
  }

  function setLifeEventMediaNotice(message) {
    if (!state.pendingLifeEvent) return;
    state.pendingLifeEvent.mediaNotice = message;
    renderLifeEventMedia();
  }

  async function submitLifeEvent() {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    if (!pending || pending.saving) return;
    const citations = collectLifeEventCitations();
    if (citations.error) {
      fields.error.textContent = citations.error;
      fields.error.hidden = false;
      return;
    }
    if (pending.newMedia.length) {
      const inputError = lifeEventInputError();
      if (inputError) {
        fields.error.textContent = inputError;
        fields.error.hidden = false;
        return;
      }
    }
    pending.saving = true;
    try {
      const mediaNames = await uploadLifeEventMedia();
      if (mediaNames && state.pendingLifeEvent === pending) saveLifeEvent(false, mediaNames);
    } finally {
      pending.saving = false;
    }
  }

  function syncNewSpouseFields() {
    const fields = lifeEventFields();
    const isNew = !fields.spouseField.hidden && !fields.spouse.disabled && fields.spouse.value === '';
    fields.newGivenField.hidden = !isNew;
    fields.newSurnameField.hidden = !isNew;
  }

  function applyLifeEventConfig(config) {
    const fields = lifeEventFields();
    fields.descLabel.textContent = config.descLabel;
    fields.descField.hidden = Boolean(config.family);
    fields.customField.hidden = !config.custom;
    fields.spouseField.hidden = !config.family;
    fields.marriageTypeField.hidden = config.tag !== 'MARR';
    syncNewSpouseFields();
  }

  function populateSpouseOptions(person) {
    const fields = lifeEventFields();
    fields.spouse.replaceChildren();
    const create = document.createElement('option');
    create.value = '';
    create.textContent = '＋ New person…';
    fields.spouse.append(create);
    const others = [...state.people.values()].filter((entry) => entry.id !== person.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const other of others) {
      const option = document.createElement('option');
      option.value = other.id;
      const birth = yearFrom(other.events.find((entry) => entry.type === 'BIRT')?.date);
      option.textContent = `${other.name}${birth ? ` (b. ${birth})` : ''}`;
      fields.spouse.append(option);
    }
    fields.spouse.disabled = false;
    fields.spouse.value = '';
  }

  function openLifeEventEditor(person, event) {
    const fields = lifeEventFields();
    const editing = Boolean(event);
    state.pendingLifeEvent = {
      personId: person.id, ordinal: editing ? event.ordinal : null, familyId: event?.familyId || null, original: null,
      existingMedia: editing ? [...(event.mediaPaths || [])] : [], newMedia: [], linkedMedia: []
    };
    fields.error.hidden = true;
    fields.remove.hidden = !editing;
    fields.remove.textContent = 'Delete event';
    fields.title.textContent = editing ? 'Edit life event' : 'Add life event';
    fields.type.replaceChildren();
    fields.marriageType.value = '';
    fields.newGiven.value = '';
    fields.newSurname.value = '';
    if (editing) {
      const config = lifeEventConfigFor(event);
      state.pendingLifeEvent.config = config;
      const option = document.createElement('option');
      option.value = config.key;
      option.textContent = config.label;
      fields.type.append(option);
      fields.type.disabled = true;
      const original = {
        date: event.date, place: event.place,
        desc: config.mode === 'value' ? event.value : event.notes.join(' '),
        custom: config.custom ? event.detail : '',
        marriageType: config.tag === 'MARR' ? event.detail : ''
      };
      state.pendingLifeEvent.original = original;
      fields.date.value = original.date;
      fields.place.value = original.place;
      fields.desc.value = original.desc;
      fields.custom.value = original.custom;
      fields.marriageType.value = original.marriageType;
      if (config.family) {
        fields.spouse.replaceChildren();
        const spouseOption = document.createElement('option');
        spouseOption.value = event.spouseId || '';
        spouseOption.textContent = event.spouseId ? personName(event.spouseId) : 'Spouse not identified';
        fields.spouse.append(spouseOption);
        fields.spouse.disabled = true;
      }
      applyLifeEventConfig(config);
    } else {
      for (const config of lifeEventTypes) {
        const option = document.createElement('option');
        option.value = config.key;
        option.textContent = config.label;
        fields.type.append(option);
      }
      fields.type.disabled = false;
      fields.date.value = '';
      fields.place.value = '';
      fields.desc.value = '';
      fields.custom.value = '';
      populateSpouseOptions(person);
      state.pendingLifeEvent.config = lifeEventTypes[0];
      applyLifeEventConfig(lifeEventTypes[0]);
    }
    fields.picker.value = datePickerValue(fields.date.value);
    fields.mediaInput.value = '';
    initLifeEventSources();
    renderLifeEventMedia();
    fields.dialog.showModal();
  }

  function saveMarriage(deleteEvent, config, mediaNames = [], citations = { lines: [], newSources: [], changed: false }) {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    const tag = config.tag;
    const noun = config.label.toLocaleLowerCase();
    const familyKey = tag === 'DIV' ? 'divorce' : 'marriage';
    const showError = (message) => { fields.error.textContent = message; fields.error.hidden = false; return false; };
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const date = clean(fields.date.value);
    const place = clean(fields.place.value);
    const marriageType = tag === 'MARR' ? clean(fields.marriageType.value) : '';
    const findRecord = (recordTag, xref) => state.gedcomRecords.find((record) => record.tag === recordTag && record.xref === xref);
    const marriageLines = () => {
      const lines = [date || place || marriageType ? `1 ${tag}` : `1 ${tag} Y`];
      if (date) lines.push(`2 DATE ${date}`);
      if (place) lines.push(`2 PLAC ${place}`);
      if (marriageType) lines.push(`2 TYPE ${marriageType}`);
      return [...lines, ...citations.lines, ...eventMediaLines(mediaNames)];
    };

    if (pending.familyId) {
      const familyRecord = findRecord('FAM', pending.familyId);
      const lines = familyRecord ? [...familyRecord.lines] : [];
      const start = lines.findIndex((line, index) => index > 0 && parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === tag);
      if (start < 0) return showError(`This ${noun} could not be found in the GEDCOM.`);
      if (deleteEvent) {
        lines.splice(start, lifeEventBlockEnd(lines, start) - start);
      } else {
        const original = pending.original;
        if (date !== original.date) setLifeEventSubfield(lines, start, 'DATE', date);
        if (place !== original.place) setLifeEventSubfield(lines, start, 'PLAC', place);
        if (citations.changed) replaceEventCitations(lines, start, citations.lines);
        if (marriageType !== original.marriageType) setLifeEventSubfield(lines, start, 'TYPE', marriageType);
        lines.splice(lifeEventBlockEnd(lines, start), 0, ...eventMediaLines(mediaNames));
      }
      familyRecord.lines = lines;
    } else {
      const selected = state.people.get(pending.personId);
      const selectedRecord = findRecord('INDI', pending.personId);
      if (!selected || !selectedRecord) return showError('This person record could not be found in the current GEDCOM.');
      let spouseId = fields.spouse.value;
      const newGiven = clean(fields.newGiven.value).replaceAll('/', ' ').trim();
      const newSurname = clean(fields.newSurname.value).replaceAll('/', ' ').trim();
      if (!spouseId && !newGiven) return showError('Choose a spouse from the list, or enter the new spouse\'s given name.');
      const spouseSex = spouseId ? state.people.get(spouseId)?.sex : '';
      const selectedRole = selected.sex === 'F' ? 'WIFE' : selected.sex === 'M' ? 'HUSB' : spouseSex === 'M' ? 'WIFE' : 'HUSB';

      if (spouseId) {
        const existingFamily = [...state.families.values()].find((family) =>
          (family.husbandId === selected.id && family.wifeId === spouseId) ||
          (family.wifeId === selected.id && family.husbandId === spouseId));
        if (existingFamily) {
          if (existingFamily[familyKey]) return showError(`A ${noun} with this person is already recorded. Click it in the Life events list to edit it.`);
          const familyRecord = findRecord('FAM', existingFamily.id);
          if (!familyRecord) return showError('The existing family record could not be found.');
          familyRecord.lines = [...familyRecord.lines, ...marriageLines()];
          commitNewSources(citations.newSources);
          refreshAfterGedcomMutation(pending.personId);
          fields.dialog.close();
          showToast(`${config.label} added to the existing family record.${mediaLinkedText(mediaNames)}${sourcesChangedText(citations)}`);
          return true;
        }
      } else {
        spouseId = nextGedcomXref('I', 'INDI');
        addRecordBeforeTrailer({
          xref: spouseId, tag: 'INDI',
          lines: [`0 @${spouseId}@ INDI`, `1 NAME ${newGiven}${newSurname ? ` /${newSurname}/` : ''}`, `2 GIVN ${newGiven}`, ...(newSurname ? [`2 SURN ${newSurname}`] : [])]
        });
      }
      const spouseRecord = findRecord('INDI', spouseId);
      if (!spouseRecord) return showError('The spouse record could not be found.');
      const familyId = nextGedcomXref('F', 'FAM');
      addRecordBeforeTrailer({
        xref: familyId, tag: 'FAM',
        lines: [`0 @${familyId}@ FAM`, `1 HUSB @${selectedRole === 'HUSB' ? pending.personId : spouseId}@`, `1 WIFE @${selectedRole === 'WIFE' ? pending.personId : spouseId}@`, ...marriageLines()]
      });
      selectedRecord.lines = [...selectedRecord.lines, `1 FAMS @${familyId}@`];
      spouseRecord.lines = [...spouseRecord.lines, `1 FAMS @${familyId}@`];
    }
    commitNewSources(citations.newSources);
    refreshAfterGedcomMutation(pending.personId);
    fields.dialog.close();
    showToast(`${deleteEvent ? `${config.label} removed from the family record.` : pending.familyId ? `${config.label} updated.` : `${config.label} added.`}${mediaLinkedText(mediaNames)}${sourcesChangedText(citations)}`);
    return true;
  }

  function lifeEventBlockEnd(lines, start) {
    let end = start + 1;
    while (end < lines.length) {
      const field = parseGedcomField(lines[end]);
      if (field && field.level <= 1) break;
      end += 1;
    }
    return end;
  }

  function findLifeEventStart(lines, ordinal) {
    let count = 0;
    for (let index = 1; index < lines.length; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level !== 1 || !eventTags.has(field.tag)) continue;
      if (count === ordinal) return index;
      count += 1;
    }
    return -1;
  }

  function setLifeEventSubfield(lines, start, fieldTag, value) {
    const end = lifeEventBlockEnd(lines, start);
    let found = -1;
    for (let index = start + 1; index < end; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level === 2 && field.tag === fieldTag) { found = index; break; }
    }
    if (found >= 0) {
      if (value) lines[found] = `2 ${fieldTag} ${value}`;
      else lines.splice(found, 1);
    } else if (value) {
      lines.splice(start + 1, 0, `2 ${fieldTag} ${value}`);
    }
  }

  function setLifeEventNote(lines, start, value) {
    let index = start + 1;
    let insertAt = -1;
    while (index < lifeEventBlockEnd(lines, start)) {
      const field = parseGedcomField(lines[index]);
      if (field?.level === 2 && field.tag === 'NOTE' && !field.value.startsWith('@')) {
        if (insertAt < 0) insertAt = index;
        let removeTo = index + 1;
        while (removeTo < lines.length && (parseGedcomField(lines[removeTo])?.level || 0) >= 3) removeTo += 1;
        lines.splice(index, removeTo - index);
      } else {
        index += 1;
      }
    }
    if (value) lines.splice(insertAt < 0 ? lifeEventBlockEnd(lines, start) : insertAt, 0, `2 NOTE ${value}`);
  }

  function saveLifeEvent(deleteEvent = false, mediaNames = []) {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    const personRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === pending?.personId);
    const showError = (message) => { fields.error.textContent = message; fields.error.hidden = false; return false; };
    if (!personRecord) return showError('This person record could not be found in the current GEDCOM.');
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const config = pending.ordinal === null
      ? lifeEventTypes.find((entry) => entry.key === fields.type.value) || lifeEventTypes[0]
      : pending.config;
    if (deleteEvent) mediaNames = [];
    const citations = deleteEvent ? { lines: [], newSources: [], changed: false } : collectLifeEventCitations();
    if (citations.error) return showError(citations.error);
    if (config.family) return saveMarriage(deleteEvent, config, mediaNames, citations);
    const date = clean(fields.date.value);
    const place = clean(fields.place.value);
    const description = clean(fields.desc.value);
    const customType = clean(fields.custom.value);
    const lines = [...personRecord.lines];

    if (deleteEvent) {
      const start = findLifeEventStart(lines, pending.ordinal);
      if (start < 0) return showError('This event could not be found in the GEDCOM.');
      lines.splice(start, lifeEventBlockEnd(lines, start) - start);
    } else if (pending.ordinal === null) {
      if (config.custom && !customType) return showError('Enter a name for this event, such as Census or Probate.');
      if (!date && !place && !description) return showError('Enter a date, place or description for this event.');
      const eventLines = [`1 ${config.tag}${config.mode === 'value' && description ? ` ${description}` : ''}`];
      const typeText = config.custom ? customType : config.type;
      if (typeText) eventLines.push(`2 TYPE ${typeText}`);
      if (date) eventLines.push(`2 DATE ${date}`);
      if (place) eventLines.push(`2 PLAC ${place}`);
      if (config.mode === 'note' && description) eventLines.push(`2 NOTE ${description}`);
      lines.push(...eventLines, ...citations.lines, ...eventMediaLines(mediaNames));
    } else {
      if (config.custom && !customType) return showError('Enter a name for this event, such as Census or Probate.');
      const start = findLifeEventStart(lines, pending.ordinal);
      if (start < 0) return showError('This event could not be found in the GEDCOM.');
      const original = pending.original;
      // Only changed fields are written so sources, notes and other sub-records are preserved.
      if (citations.changed) replaceEventCitations(lines, start, citations.lines);
      if (config.mode === 'value' && description !== original.desc) {
        lines[start] = `1 ${parseGedcomField(lines[start]).tag}${description ? ` ${description}` : ''}`;
      }
      if (config.custom && customType !== original.custom) setLifeEventSubfield(lines, start, 'TYPE', customType);
      if (date !== original.date) setLifeEventSubfield(lines, start, 'DATE', date);
      if (place !== original.place) setLifeEventSubfield(lines, start, 'PLAC', place);
      if (config.mode === 'note' && description !== original.desc) setLifeEventNote(lines, start, description);
      lines.splice(lifeEventBlockEnd(lines, start), 0, ...eventMediaLines(mediaNames));
    }
    personRecord.lines = lines;
    commitNewSources(citations.newSources);
    refreshAfterGedcomMutation(pending.personId);
    fields.dialog.close();
    showToast(`${deleteEvent ? 'Life event deleted.' : pending.ordinal === null ? 'Life event added.' : 'Life event updated.'}${mediaLinkedText(mediaNames)}${sourcesChangedText(citations)}`);
    return true;
  }

  function savePersonSummary() {
    const personId = state.pendingPersonSummaryId;
    const personRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === personId);
    if (!personRecord) {
      elements.personSummaryError.textContent = 'This person record could not be found in the current GEDCOM.';
      elements.personSummaryError.hidden = false;
      return false;
    }
    const givenName = elements.personSummaryGivenName.value.replace(/[\/\r\n]+/g, ' ').trim();
    const surname = elements.personSummarySurname.value.replace(/[\/\r\n]+/g, ' ').trim();
    const birthDate = elements.personSummaryBirthDate.value.replace(/[\r\n]+/g, ' ').trim();
    const birthPlace = elements.personSummaryBirthPlace.value.replace(/[\r\n]+/g, ' ').trim();
    const deathDate = elements.personSummaryDeathDate.value.replace(/[\r\n]+/g, ' ').trim();
    const deathPlace = elements.personSummaryDeathPlace.value.replace(/[\r\n]+/g, ' ').trim();
    const sex = elements.personSummarySex.value;
    const lines = [...personRecord.lines];
    updatePrimaryName(lines, givenName, surname);
    const sexIndexes = [];
    for (let index = 1; index < lines.length; index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level === 1 && field.tag === 'SEX') sexIndexes.push(index);
    }
    if (sexIndexes.length) {
      if (sex) lines[sexIndexes[0]] = `1 SEX ${sex}`;
      for (const index of sexIndexes.slice(sex ? 1 : 0).reverse()) lines.splice(index, 1);
    } else if (sex) {
      lines.push(`1 SEX ${sex}`);
    }
    updateEventField(lines, 'BIRT', 'DATE', birthDate);
    updateEventField(lines, 'BIRT', 'PLAC', birthPlace);
    updateEventField(lines, 'DEAT', 'DATE', deathDate);
    updateEventField(lines, 'DEAT', 'PLAC', deathPlace);
    personRecord.lines = lines;
    refreshAfterGedcomMutation(personId);
    state.pendingPersonSummaryId = null;
    elements.personSummaryDialog.close();
    return true;
  }

  function reparseGedcomRecords() {
    const parsed = parseGedcom(serializeGedcomRecords(state.gedcomRecords));
    state.people = parsed.people;
    state.families = parsed.families;
    state.sources = parsed.sources;
    state.gedcomRecords = parsed.gedcomRecords;
    refreshDirectoryFilters(false);
    for (const [id, paths] of state.additionalMedia) {
      const person = state.people.get(id);
      if (person) for (const path of paths) if (!person.mediaPaths.includes(path)) person.mediaPaths.push(path);
    }
    for (const id of state.primaryMedia.keys()) {
      if (!mediaPathsForPerson(id).includes(state.primaryMedia.get(id))) state.primaryMedia.delete(id);
    }
    elements.peopleCount.textContent = state.people.size.toLocaleString();
  }

  function refreshAfterGedcomMutation(personId) {
    reparseGedcomRecords();
    state.history = [];
    state.historyIndex = -1;
    markGedcomDirty();
    setFocus(state.people.has(personId) ? personId : state.people.keys().next().value, true);
  }

  function birthPlaceOf(person) {
    return person.events.find((event) => event.type === 'BIRT')?.place || '';
  }

  function peopleWithoutBirthCountry() {
    return [...state.people.values()]
      .filter((person) => !countryFlagForPlace(birthPlaceOf(person)))
      .sort((a, b) => (a.surname || '').localeCompare(b.surname || '', undefined, { sensitivity: 'base' })
        || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function birthCountryHint(place) {
    if (!place.trim()) return { text: 'No birth place recorded', found: false };
    const country = countryFlagForPlace(place);
    return country ? { text: `Country: ${country.country}`, found: true } : { text: 'Country not recognised', found: false };
  }

  function updateBirthCountryPending() {
    const count = state.birthCountryEdits.size;
    const pending = document.querySelector('#birthCountryPending');
    pending.textContent = count ? `${countLabel(count, 'unsaved change', 'unsaved changes')}` : '';
    document.querySelector('#saveBirthCountries').disabled = !count;
  }

  function renderBirthCountryList() {
    const list = document.querySelector('#birthCountryList');
    const people = peopleWithoutBirthCountry();
    const query = normalizeDirectoryName(document.querySelector('#birthCountrySearch').value.trim());
    const visible = query
      ? people.filter((person) => normalizeDirectoryName(`${person.name} ${birthPlaceOf(person)}`).includes(query))
      : people;
    document.querySelector('#birthCountrySummary').textContent = people.length
      ? `${countLabel(people.length, 'person has', 'people have')} no birth place that identifies a country. Add or correct the birth location (for example "Sydney, New South Wales, Australia"), then save. Edits are written to the GEDCOM file.`
      : 'Everyone in this tree has a birth place that identifies a country.';
    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'birth-country-empty';
      empty.textContent = people.length ? 'No one matches this filter.' : 'Nothing left to fix.';
      list.append(empty);
    }
    for (const person of visible) {
      const original = birthPlaceOf(person);
      const value = state.birthCountryEdits.has(person.id) ? state.birthCountryEdits.get(person.id) : original;
      const row = document.createElement('div');
      row.className = 'birth-country-row';
      row.classList.toggle('is-edited', state.birthCountryEdits.has(person.id));
      const who = document.createElement('div');
      who.className = 'birth-country-person';
      const name = makeButton(person.name, 'birth-country-name');
      name.dataset.birthCountryOpen = person.id;
      name.title = `Close this list and open ${person.name}`;
      const years = document.createElement('span');
      years.className = 'birth-country-years';
      years.textContent = lifespan(person);
      who.append(name, years);
      const field = document.createElement('div');
      field.className = 'birth-country-field';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 200;
      input.autocomplete = 'off';
      input.value = value;
      input.placeholder = 'Add birth location';
      input.dataset.birthCountryPerson = person.id;
      input.dataset.original = original;
      input.setAttribute('aria-label', `Birth location for ${person.name}`);
      const hint = document.createElement('span');
      const status = birthCountryHint(value);
      hint.className = `birth-country-hint${status.found ? ' is-found' : ''}`;
      hint.textContent = status.text;
      const suggestions = document.createElement('div');
      suggestions.className = 'birth-country-suggestions';
      field.append(input, hint, suggestions);
      row.dataset.placeKey = birthPlaceKey(original);
      row.append(who, field);
      renderBirthCountrySuggestionCell(row);
      list.append(row);
    }
    updateBirthCountryPending();
  }

  function openBirthCountryDialog() {
    if (!state.people.size) return;
    if (!state.gedcomRecords.length) {
      showToast('This tree cannot be edited, so birth locations cannot be updated.');
      return;
    }
    state.birthCountryEdits = new Map();
    document.querySelector('#birthCountrySearch').value = '';
    document.querySelector('#birthCountryError').hidden = true;
    document.querySelector('#geonamesConsent').checked = false;
    try { document.querySelector('#geonamesUsername').value = localStorage.getItem(geonamesUsernameKey) || ''; } catch { }
    document.querySelector('#geonamesStatus').textContent = '';
    syncGeonamesControls();
    renderBirthCountryList();
    const dialog = document.querySelector('#birthCountryDialog');
    if (!dialog.open) dialog.showModal();
  }

  function closeBirthCountryDialog() {
    if (state.birthCountryEdits.size && !window.confirm('Discard your unsaved birth location changes?')) return false;
    state.birthCountryEdits = new Map();
    state.geonamesLookup?.abort();
    document.querySelector('#birthCountryDialog').close();
    return true;
  }

  const geonamesUsernameKey = 'kinship-atlas:geonames-username';
  const ukNations = ['England', 'Scotland', 'Wales', 'Northern Ireland'];

  function birthPlaceKey(place) {
    return String(place || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function appendCountryToPlace(place, country) {
    const base = String(place || '').trim().replace(/[\s,]+$/, '');
    return base ? `${base}, ${country}` : country;
  }

  // UK results use the constituent nation, matching the flags the app shows for English, Scottish, Welsh and Northern Irish places.
  function geonamesCountryLabel(result) {
    if (String(result?.countryCode || '').toUpperCase() === 'GB') {
      const region = String(result.adminName1 || '').trim().toLocaleLowerCase();
      return ukNations.find((nation) => nation.toLocaleLowerCase() === region) || 'United Kingdom';
    }
    return String(result?.countryName || '').trim();
  }

  function geonamesCountryOptions(results, limit = 3) {
    const options = [];
    for (const result of Array.isArray(results) ? results : []) {
      const country = geonamesCountryLabel(result);
      if (!country || options.some((option) => option.country === country)) continue;
      const match = [...new Set([result.name, result.adminName1, result.countryName].map((part) => String(part || '').trim()).filter(Boolean))].join(', ');
      options.push({ country, match });
      if (options.length >= limit) break;
    }
    return options;
  }

  async function geonamesSearch(params, username, signal) {
    const url = new URL('https://secure.geonames.org/searchJSON');
    for (const [key, value] of Object.entries({ ...params, maxRows: '10', style: 'MEDIUM', username })) url.searchParams.set(key, value);
    const request = new AbortController();
    const stop = () => request.abort();
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 15000);
    let response;
    let data;
    try {
      response = await fetch(url, { signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      try { data = await response.json(); } catch (error) {
        if (request.signal.aborted) throw error;
        throw new Error(`GeoNames returned HTTP ${response.status}.`);
      }
    } catch (error) {
      if (request.signal.aborted && !signal?.aborted) throw new Error('GeoNames did not respond within 15 seconds.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
    if (data?.status) {
      const hint = data.status.value === 10 ? ' Check the username, and that free web services are enabled for it on the GeoNames "Manage account" page.' : '';
      throw new Error(`${data.status.message}${hint}`);
    }
    if (!response.ok) throw new Error(`GeoNames returned HTTP ${response.status}.`);
    return Array.isArray(data?.geonames) ? data.geonames : [];
  }

  async function suggestCountriesForPlace(place, username, signal) {
    let results = await geonamesSearch({ q: place }, username, signal);
    const firstPart = place.split(',')[0].trim();
    if (!results.length && firstPart && firstPart !== place.trim()) {
      results = await geonamesSearch({ q: firstPart, isNameRequired: 'true' }, username, signal);
    }
    return geonamesCountryOptions(results);
  }

  function renderBirthCountrySuggestionCell(row) {
    const cell = row.querySelector('.birth-country-suggestions');
    const input = row.querySelector('input[data-birth-country-person]');
    const entry = state.birthCountrySuggestions.get(row.dataset.placeKey);
    cell.replaceChildren();
    cell.hidden = !entry;
    if (!entry) return;
    const note = (text) => {
      const span = document.createElement('span');
      span.className = 'birth-country-suggest-note';
      span.textContent = text;
      cell.append(span);
    };
    if (entry.status === 'loading') return note('Looking up on GeoNames…');
    if (entry.status === 'error') return note(`GeoNames lookup failed: ${entry.message}`);
    if (!entry.options.length) return note('No GeoNames match found.');
    note('GeoNames suggests:');
    for (const option of entry.options) {
      const accepted = input.value.trim() === appendCountryToPlace(input.dataset.original, option.country);
      const button = makeButton(accepted ? `✓ ${option.country} appended` : `Append ${option.country}`, `birth-country-accept${accepted ? ' is-accepted' : ''}`);
      button.dataset.acceptCountry = option.country;
      button.title = `GeoNames match: ${option.match}`;
      button.setAttribute('aria-pressed', String(accepted));
      cell.append(button);
    }
  }

  function refreshBirthCountrySuggestionRows(key) {
    for (const row of document.querySelectorAll('#birthCountryList .birth-country-row')) {
      if (key === undefined || row.dataset.placeKey === key) renderBirthCountrySuggestionCell(row);
    }
  }

  function applyBirthCountryInput(input) {
    const personId = input.dataset.birthCountryPerson;
    if (input.value.trim() === input.dataset.original.trim()) state.birthCountryEdits.delete(personId);
    else state.birthCountryEdits.set(personId, input.value);
    const status = birthCountryHint(input.value);
    const hint = input.parentElement.querySelector('.birth-country-hint');
    hint.textContent = status.text;
    hint.classList.toggle('is-found', status.found);
    input.closest('.birth-country-row').classList.toggle('is-edited', state.birthCountryEdits.has(personId));
    updateBirthCountryPending();
  }

  function syncGeonamesControls() {
    const button = document.querySelector('#geonamesLookup');
    const running = Boolean(state.geonamesLookup);
    button.textContent = running ? 'Stop' : 'Suggest countries';
    button.disabled = !running && (!document.querySelector('#geonamesUsername').value.trim() || !document.querySelector('#geonamesConsent').checked);
    document.querySelector('#geonamesUsername').disabled = running;
    document.querySelector('#geonamesConsent').disabled = running;
  }

  async function runGeonamesLookup() {
    if (state.geonamesLookup) {
      state.geonamesLookup.abort();
      return;
    }
    const username = document.querySelector('#geonamesUsername').value.trim();
    const status = document.querySelector('#geonamesStatus');
    if (!username || !document.querySelector('#geonamesConsent').checked) return;
    try { localStorage.setItem(geonamesUsernameKey, username); } catch { }
    const places = new Map();
    for (const input of document.querySelectorAll('#birthCountryList input[data-birth-country-person]')) {
      const place = input.dataset.original.trim();
      const key = birthPlaceKey(place);
      if (place && state.birthCountrySuggestions.get(key)?.status !== 'done') places.set(key, place);
    }
    if (!places.size) {
      status.textContent = 'No listed birth locations need a lookup. Only people with an existing birth location can be looked up.';
      return;
    }
    const controller = new AbortController();
    state.geonamesLookup = controller;
    syncGeonamesControls();
    let done = 0;
    let matched = 0;
    let failure = '';
    for (const [key, place] of places) {
      if (controller.signal.aborted) break;
      status.textContent = `Looking up ${done + 1} of ${places.size} birth locations…`;
      state.birthCountrySuggestions.set(key, { status: 'loading' });
      refreshBirthCountrySuggestionRows(key);
      try {
        const options = await suggestCountriesForPlace(place, username, controller.signal);
        state.birthCountrySuggestions.set(key, { status: 'done', options });
        if (options.length) matched += 1;
        done += 1;
      } catch (error) {
        if (controller.signal.aborted) state.birthCountrySuggestions.delete(key);
        else {
          failure = error?.message || 'The request failed.';
          state.birthCountrySuggestions.set(key, { status: 'error', message: failure });
        }
      }
      refreshBirthCountrySuggestionRows(key);
      if (failure) break;
    }
    state.geonamesLookup = null;
    syncGeonamesControls();
    status.textContent = failure ? `Lookup stopped: ${failure}`
      : controller.signal.aborted ? `Stopped after ${countLabel(done, 'birth location', 'birth locations')}.`
      : `Looked up ${countLabel(done, 'birth location', 'birth locations')}; ${matched.toLocaleString()} with suggestions. Review each suggestion before accepting.`;
  }

  function saveBirthCountries() {
    const error = document.querySelector('#birthCountryError');
    error.hidden = true;
    let changed = 0;
    for (const [personId, place] of state.birthCountryEdits) {
      const record = state.gedcomRecords.find((entry) => entry.tag === 'INDI' && entry.xref === personId);
      if (!record) continue;
      const lines = [...record.lines];
      updateEventField(lines, 'BIRT', 'PLAC', place.replace(/[\r\n]+/g, ' ').trim());
      record.lines = lines;
      changed += 1;
    }
    if (!changed) {
      error.textContent = 'None of the edited people could be found in the current GEDCOM.';
      error.hidden = false;
      return;
    }
    const before = peopleWithoutBirthCountry().length;
    reparseGedcomRecords();
    markGedcomDirty();
    if (state.people.has(state.selectedId)) render();
    else { renderRoster(); if (!state.mapMode) renderTreeWelcome(); }
    state.birthCountryEdits = new Map();
    renderBirthCountryList();
    const fixed = before - peopleWithoutBirthCountry().length;
    document.querySelector('#birthCountryPending').textContent = `Saved ${countLabel(changed, 'birth location', 'birth locations')}; ${countLabel(fixed, 'person', 'people')} now ${fixed === 1 ? 'has' : 'have'} a birth country.`;
  }

  function savePersonFields() {
    const personId = state.pendingEditPersonId;
    const personRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === personId);
    if (!personRecord) return false;
    const fields = [];
    let previousLevel = 0;
    for (const row of elements.personFieldsEditor.querySelectorAll('.gedcom-field-row')) {
      const level = Number(row.querySelector('.gedcom-level-input').value);
      const tag = row.querySelector('.gedcom-tag-input').value.trim().toUpperCase();
      const value = row.querySelector('.gedcom-value-input').value.replace(/[\r\n]+/g, ' ');
      if (!Number.isInteger(level) || level < 1 || level > 99 || level > previousLevel + 1 || !/^[A-Z0-9_]+$/.test(tag)) {
        elements.personEditorError.textContent = 'Check field levels and tags. Levels must start at 1 and cannot skip a nesting level; tags may contain letters, numbers, and underscores.';
        elements.personEditorError.hidden = false;
        return false;
      }
      fields.push({ level, tag, value });
      previousLevel = level;
    }
    personRecord.lines = [personRecord.lines[0], ...fields.map((field) => `${field.level} ${field.tag}${field.value ? ` ${field.value}` : ''}`)];
    refreshAfterGedcomMutation(personId);
    state.pendingEditPersonId = null;
    elements.personEditorDialog.close();
    return true;
  }

  function nextGedcomXref(prefix, tag) {
    const existing = new Set(state.gedcomRecords.filter((record) => record.tag === tag).map((record) => record.xref));
    let number = 1;
    while (existing.has(`${prefix}${number}`)) number += 1;
    return `${prefix}${number}`;
  }

  function addRecordBeforeTrailer(record) {
    const trailerIndex = state.gedcomRecords.findIndex((entry) => entry.tag === 'TRLR');
    state.gedcomRecords.splice(trailerIndex < 0 ? state.gedcomRecords.length : trailerIndex, 0, record);
  }

  // Merging a matched person adds only details the open tree lacks; values that differ are reported and never overwritten.
  const mergeSkippedTags = new Set(['FAMS', 'FAMC', 'CHAN', 'RIN', '_UID', 'UID', 'AFN', 'RFN', 'REFN']);
  const mergeSingletonTags = new Set(['SEX', 'BIRT', 'DEAT', 'BURI', 'CREM']);
  const mergeSingleValueTags = new Set(['DATE', 'PLAC', 'TYPE', 'AGE', 'CAUS', 'PAGE', 'QUAY', 'GIVN', 'SURN', 'NPFX', 'NSFX', 'SPFX', 'NICK']);
  const mergeTagNames = {
    DATE: 'date', PLAC: 'place', TYPE: 'type', AGE: 'age', CAUS: 'cause', PAGE: 'page', QUAY: 'source quality',
    GIVN: 'given names', SURN: 'surname', NICK: 'nickname', NOTE: 'note', SOUR: 'source citation', OBJE: 'media',
    ADDR: 'address', NAME: 'name', SEX: 'sex', CREM: 'Cremation', TITL: 'title', RELI: 'religion', NATI: 'nationality'
  };
  const mergeLinePattern = /^(\d+)\s+(?:@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/;
  const mergeNormalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const mergePointer = (value) => (String(value || '').trim().match(/^@([^@#][^@]*)@$/) || [])[1] || '';

  // Splits lines[start..end) into blocks at one GEDCOM level; each block keeps its line range so sub-blocks can be found.
  function gedcomBlocks(lines, start, end, level) {
    const blocks = [];
    for (let index = start; index < end; index += 1) {
      const match = lines[index].match(mergeLinePattern);
      if (match && Number(match[1]) === level) {
        blocks.push({ lines, level, tag: match[2].toUpperCase(), value: (match[3] || '').trim(), start: index, end: index + 1 });
      } else if (blocks.length && (match || lines[index].trim())) {
        blocks.at(-1).end = index + 1;
      }
    }
    return blocks;
  }
  const mergeChildren = (block) => gedcomBlocks(block.lines, block.start + 1, block.end, block.level + 1);

  function gedcomRecordLabel(records, xref) {
    const record = records.get(xref);
    if (!record) return `@${xref}@`;
    const fields = record.lines.map((line) => line.match(mergeLinePattern)).filter(Boolean)
      .map((match) => ({ level: Number(match[1]), tag: match[2].toUpperCase(), value: (match[3] || '').trim() }));
    const pick = (tag) => fields.filter((field) => field.level === 1 && field.tag === tag && field.value).map((field) => field.value).join('; ');
    if (record.tag === 'OBJE') return pick('FILE') || pick('TITL') || `@${xref}@`;
    if (record.tag === 'SOUR') return pick('TITL') || pick('ABBR') || `@${xref}@`;
    if (record.tag === 'INDI') return pick('NAME').replaceAll('/', '') || `@${xref}@`;
    if (record.tag === 'NOTE') return fields.filter((field) => field.level === 0 || ['CONT', 'CONC'].includes(field.tag)).map((field) => field.value).join(' ');
    return fields.slice(1).map((field) => `${field.tag} ${field.value}`.trim()).join('; ');
  }

  // A block's own value with pointers resolved to what they point at, so records with different xrefs still compare equal.
  function mergeBlockValue(block, records) {
    const pointer = mergePointer(block.value);
    let text = pointer ? `@${gedcomRecordLabel(records, pointer)}` : block.value;
    for (const child of mergeChildren(block)) {
      if (child.tag === 'CONT') text += `\n${child.value}`;
      else if (child.tag === 'CONC') text += child.value;
    }
    const normalized = mergeNormalize(text);
    return normalized === 'y' ? '' : normalized;
  }
  function mergeChildValue(block, tag, records) {
    const child = mergeChildren(block).find((entry) => entry.tag === tag);
    return child ? mergeBlockValue(child, records) : '';
  }

  function mergeBlockLabel(block, records) {
    const children = mergeChildren(block);
    const child = (tag) => children.find((entry) => entry.tag === tag)?.value || '';
    const pointer = mergePointer(block.value);
    const shown = (pointer ? gedcomRecordLabel(records, pointer) : block.value).replace(/^y$/i, '');
    const brief = (text) => text.length > 70 ? `${text.slice(0, 67)}…` : text;
    if (block.tag === 'SOUR') return `Source: ${brief(shown) || 'citation'}${child('PAGE') ? ` (${brief(child('PAGE'))})` : ''}`;
    if (block.tag === 'OBJE') return `Media: ${brief(shown || child('FILE') || 'linked file')}`;
    if (block.tag === 'NOTE') return `Note: ${brief(shown || 'text')}`;
    if (block.tag === 'NAME') return `Name: ${shown.replaceAll('/', '').replace(/\s+/g, ' ').trim()}`;
    if (block.tag === 'SEX') return `Sex: ${shown}`;
    const name = (block.tag === 'EVEN' && child('TYPE')) || eventNames[block.tag] || mergeTagNames[block.tag] || block.tag;
    return [name, brief(shown), child('DATE'), brief(child('PLAC'))].filter(Boolean).join(' · ');
  }
  const mergeIsEvent = (block) => eventTags.has(block.tag) || mergeSingletonTags.has(block.tag) && block.tag !== 'SEX'
    || mergeChildren(block).some((child) => child.tag === 'DATE' || child.tag === 'PLAC');

  // Finds the existing block that describes the same fact: same tag, value and type, with dates and places that agree or are missing on one side.
  function findMergeTarget(block, candidates, sides, claimed) {
    if (mergeSingletonTags.has(block.tag) && block.level === 1) return candidates.find((entry) => entry.tag === block.tag) || null;
    const value = mergeBlockValue(block, sides.incoming);
    const type = mergeChildValue(block, 'TYPE', sides.incoming);
    const date = mergeChildValue(block, 'DATE', sides.incoming);
    const place = mergeChildValue(block, 'PLAC', sides.incoming);
    const same = candidates.filter((entry) => !claimed.has(entry) && entry.tag === block.tag
      && mergeBlockValue(entry, sides.existing) === value && mergeChildValue(entry, 'TYPE', sides.existing) === type);
    const agrees = (a, b) => a === b || !a || !b;
    return same.find((entry) => mergeChildValue(entry, 'DATE', sides.existing) === date && mergeChildValue(entry, 'PLAC', sides.existing) === place)
      || same.find((entry) => agrees(mergeChildValue(entry, 'DATE', sides.existing), date) && agrees(mergeChildValue(entry, 'PLAC', sides.existing), place))
      || null;
  }

  function collectMergeAdditions(incomingBlocks, existingBlocks, parent, sides, additions) {
    const claimed = new Set();
    for (const block of incomingBlocks) {
      if (block.tag === 'CONT' || block.tag === 'CONC' || (block.level === 1 && mergeSkippedTags.has(block.tag))) continue;
      const parentLabel = parent ? mergeBlockLabel(parent, sides.existing) : '';
      if (parent && mergeSingleValueTags.has(block.tag)) {
        const current = existingBlocks.find((entry) => entry.tag === block.tag);
        if (!current) {
          additions.fills.push({ insertAt: parent.end, lines: block.lines.slice(block.start, block.end), label: `${parentLabel}: adds ${mergeTagNames[block.tag] || block.tag} "${block.value}"` });
        } else if (mergeBlockValue(current, sides.existing) !== mergeBlockValue(block, sides.incoming)) {
          additions.conflicts.push({ label: `${parentLabel}: ${mergeTagNames[block.tag] || block.tag}`, existing: current.value, incoming: block.value });
        }
        continue;
      }
      const target = findMergeTarget(block, existingBlocks, sides, claimed);
      if (!target) {
        const lines = block.lines.slice(block.start, block.end);
        if (parent) additions.fills.push({ insertAt: parent.end, lines, label: `${parentLabel}: adds ${mergeBlockLabel(block, sides.incoming)}` });
        else additions.blocks.push({ lines, label: mergeBlockLabel(block, sides.incoming), kind: mergeIsEvent(block) ? 'event' : 'detail' });
        continue;
      }
      claimed.add(target);
      const incomingValue = mergeBlockValue(block, sides.incoming);
      const existingValue = mergeBlockValue(target, sides.existing);
      if (incomingValue && existingValue && incomingValue !== existingValue) {
        additions.conflicts.push({ label: mergeBlockLabel(target, sides.existing), existing: target.value, incoming: block.value });
      }
      collectMergeAdditions(mergeChildren(block), mergeChildren(target), target, sides, additions);
    }
  }

  // Lists what the incoming person record would add to the existing one: whole new blocks, sub-lines for existing blocks, and differences.
  function importMergeAdditions(incomingLines, existingLines, incomingRecords, existingRecords) {
    const additions = { blocks: [], fills: [], conflicts: [] };
    if (!incomingLines?.length || !existingLines?.length) return additions;
    collectMergeAdditions(gedcomBlocks(incomingLines, 1, incomingLines.length, 1), gedcomBlocks(existingLines, 1, existingLines.length, 1),
      null, { incoming: incomingRecords, existing: existingRecords }, additions);
    return additions;
  }

  function buildMergedLines(existingLines, additions, remap = (lines) => lines) {
    const lines = [...existingLines];
    const fills = additions.fills.map((fill, order) => ({ ...fill, order })).sort((a, b) => b.insertAt - a.insertAt || b.order - a.order);
    for (const fill of fills) lines.splice(fill.insertAt, 0, ...remap(fill.lines));
    let index = lines.length;
    while (index > 1 && !lines[index - 1].trim()) index -= 1;
    lines.splice(index, 0, ...additions.blocks.flatMap((block) => remap(block.lines)));
    return lines;
  }

  // People only match when first given name, surname and birth date text are the same (ignoring case and spacing).
  function importMatchKey(person) {
    const birthDate = person.events.find((event) => event.type === 'BIRT' && event.date)?.date || '';
    if (!birthDate) return '';
    const normalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const firstName = String(person.givenName || '').trim().split(/\s+/)[0] || '';
    return [normalize(firstName), normalize(person.surname), normalize(birthDate)].join('|');
  }

  // Works out which people in an import file are new and connected to the open tree, without changing anything.
  function planGedcomImport(text) {
    const incoming = parseGedcom(text);
    const existingByKey = new Map();
    for (const person of state.people.values()) {
      const key = importMatchKey(person);
      if (!key) continue;
      if (!existingByKey.has(key)) existingByKey.set(key, []);
      existingByKey.get(key).push(person.id);
    }
    // anchors: people in the file who match exactly one existing person; links to them become links into the tree.
    const anchors = new Map();
    const candidates = new Set();
    let noBirthDate = 0;
    let alreadyInTree = 0;
    let ambiguous = 0;
    for (const person of incoming.people.values()) {
      const key = importMatchKey(person);
      if (!key) { noBirthDate += 1; continue; }
      const matches = existingByKey.get(key);
      if (matches) {
        alreadyInTree += 1;
        if (matches.length === 1) anchors.set(person.id, matches[0]);
        else ambiguous += 1;
        continue;
      }
      candidates.add(person.id);
    }
    const neighbours = new Map();
    for (const family of incoming.families.values()) {
      const members = [...new Set([family.husbandId, family.wifeId, ...family.childIds])].filter((id) => incoming.people.has(id));
      for (const id of members) {
        if (!neighbours.has(id)) neighbours.set(id, new Set());
        for (const other of members) if (other !== id) neighbours.get(id).add(other);
      }
    }
    const importIds = new Set();
    const queue = [];
    for (const id of candidates) {
      if ([...(neighbours.get(id) || [])].some((other) => anchors.has(other))) { importIds.add(id); queue.push(id); }
    }
    while (queue.length) {
      for (const other of neighbours.get(queue.shift()) || []) {
        if (candidates.has(other) && !importIds.has(other)) { importIds.add(other); queue.push(other); }
      }
    }
    const incomingRecords = new Map(incoming.gedcomRecords.filter((record) => record.xref).map((record) => [record.xref, record]));
    const existingRecords = new Map(state.gedcomRecords.filter((record) => record.xref).map((record) => [record.xref, record]));
    const merges = [];
    for (const [incomingId, existingId] of anchors) {
      const additions = importMergeAdditions(incomingRecords.get(incomingId)?.lines, existingRecords.get(existingId)?.lines, incomingRecords, existingRecords);
      if (additions.blocks.length || additions.fills.length) merges.push({ incomingId, existingId, ...additions });
    }
    return {
      incoming, anchors, importIds, noBirthDate, alreadyInTree, ambiguous, merges,
      total: incoming.people.size, newPeople: candidates.size, unconnected: candidates.size - importIds.size
    };
  }

  function appendRecordLine(record, line) {
    if (record.lines.some((entry) => entry.trim() === line)) return;
    let index = record.lines.length;
    while (index > 1 && !record.lines[index - 1].trim()) index -= 1;
    record.lines.splice(index, 0, line);
  }

  // Appends the planned people with their life events, families and cited records, re-numbering every xref,
  // then adds the missing details of each chosen matched person to their existing record.
  function applyGedcomImport(plan, mergeIds = new Set()) {
    const { incoming, anchors, importIds } = plan;
    const incomingRecords = new Map(incoming.gedcomRecords.filter((record) => record.xref).map((record) => [record.xref, record]));
    const existingRecords = new Map(state.gedcomRecords.filter((record) => record.xref).map((record) => [record.xref, record]));
    const usedXrefs = new Set(existingRecords.keys());
    const prefixes = { INDI: 'I', FAM: 'F', SOUR: 'S', OBJE: 'O', NOTE: 'N', REPO: 'R' };
    const counters = new Map();
    const allocate = (tag) => {
      const prefix = prefixes[tag] || 'X';
      let number = counters.get(prefix) || 1;
      while (usedXrefs.has(`${prefix}${number}`)) number += 1;
      counters.set(prefix, number + 1);
      usedXrefs.add(`${prefix}${number}`);
      return `${prefix}${number}`;
    };
    const lineMatch = (line) => line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    const isPointer = (value) => /^@[^@#][^@]*@$/.test(String(value || '').trim());

    const personMap = new Map([...importIds].map((id) => [id, allocate('INDI')]));
    const mapPerson = (id) => personMap.get(id) || anchors.get(id) || '';
    const familyMap = new Map();
    const mergedFamilies = [];
    for (const family of incoming.families.values()) {
      if (![family.husbandId, family.wifeId, ...family.childIds].some((id) => importIds.has(id))) continue;
      const husband = anchors.get(family.husbandId);
      const wife = anchors.get(family.wifeId);
      const existing = husband && wife ? [...state.families.values()].find((entry) =>
        (entry.husbandId === husband && entry.wifeId === wife) || (entry.husbandId === wife && entry.wifeId === husband)) : null;
      if (existing) {
        familyMap.set(family.id, existing.id);
        mergedFamilies.push({ family, targetId: existing.id });
      } else {
        familyMap.set(family.id, allocate('FAM'));
      }
    }

    const copiedRecords = new Map();
    const newRecords = [];
    const newRecordsByXref = new Map();
    const existingBodies = new Map();
    for (const record of state.gedcomRecords) {
      if (record.xref && !['INDI', 'FAM'].includes(record.tag)) existingBodies.set(`${record.tag}\n${record.lines.slice(1).join('\n').trim()}`, record.xref);
    }
    function copyLinkedRecord(xref) {
      if (copiedRecords.has(xref)) return copiedRecords.get(xref);
      const record = incomingRecords.get(xref);
      if (!record || ['HEAD', 'TRLR', 'INDI', 'FAM'].includes(record.tag)) return '';
      const hasPointers = record.lines.slice(1).some((line) => isPointer(lineMatch(line)?.[4]));
      const reuse = hasPointers ? '' : existingBodies.get(`${record.tag}\n${record.lines.slice(1).join('\n').trim()}`);
      if (reuse) { copiedRecords.set(xref, reuse); return reuse; }
      const newXref = allocate(record.tag);
      copiedRecords.set(xref, newXref);
      const copy = { xref: newXref, tag: record.tag, lines: remapLines(record.lines, newXref) };
      newRecords.push(copy);
      newRecordsByXref.set(newXref, copy);
      return newXref;
    }
    function remapPointer(target) {
      if (incoming.people.has(target)) return mapPerson(target);
      if (incoming.families.has(target)) return familyMap.get(target) || '';
      return copyLinkedRecord(target);
    }
    // Pointers to people, families or records that are not imported are dropped with their sub-lines.
    function remapLines(lines, newXref) {
      const output = [];
      let skipAbove = Infinity;
      for (const line of lines) {
        const match = lineMatch(line);
        if (!match) { if (skipAbove === Infinity && line.trim()) output.push(line); continue; }
        const level = Number(match[1]);
        if (level > skipAbove) continue;
        skipAbove = Infinity;
        if (level === 0) { output.push(`0 @${newXref}@ ${match[3]}${match[4] ? ` ${match[4]}` : ''}`); continue; }
        if (!isPointer(match[4])) { output.push(line); continue; }
        const target = remapPointer(splitXref(match[4].trim()));
        if (!target) { skipAbove = level; continue; }
        output.push(`${level} ${match[3]} @${target}@`);
      }
      return output;
    }

    const personRecords = [];
    for (const id of importIds) {
      const record = incomingRecords.get(id);
      if (record) personRecords.push({ xref: personMap.get(id), tag: 'INDI', lines: remapLines(record.lines, personMap.get(id)) });
    }
    const familyRecords = [];
    const backLinks = [];
    for (const family of incoming.families.values()) {
      const targetId = familyMap.get(family.id);
      if (!targetId || mergedFamilies.some((entry) => entry.family === family)) continue;
      const record = incomingRecords.get(family.id);
      if (!record) continue;
      familyRecords.push({ xref: targetId, tag: 'FAM', lines: remapLines(record.lines, targetId) });
      for (const [role, ids] of [['FAMS', [family.husbandId, family.wifeId]], ['FAMC', family.childIds]]) {
        for (const id of ids) if (anchors.has(id)) backLinks.push({ personId: anchors.get(id), line: `1 ${role} @${targetId}@` });
      }
    }
    for (const { family, targetId } of mergedFamilies) {
      const familyRecord = existingRecords.get(targetId);
      for (const childId of family.childIds) {
        if (importIds.has(childId) && familyRecord) appendRecordLine(familyRecord, `1 CHIL @${personMap.get(childId)}@`);
      }
    }
    for (const { personId, line } of backLinks) {
      const record = existingRecords.get(personId);
      if (record) appendRecordLine(record, line);
    }
    // Recomputed against the current records so a second file person matching the same tree person does not add details twice.
    const labelRecords = { get: (xref) => existingRecords.get(xref) || newRecordsByXref.get(xref) };
    let mergedPeople = 0;
    let mergedRecords = 0;
    for (const merge of plan.merges || []) {
      if (!mergeIds.has(merge.incomingId)) continue;
      const record = existingRecords.get(merge.existingId);
      const source = incomingRecords.get(merge.incomingId);
      if (!record || !source) continue;
      const additions = importMergeAdditions(source.lines, record.lines, incomingRecords, labelRecords);
      const count = additions.blocks.length + additions.fills.length;
      if (!count) continue;
      record.lines = buildMergedLines(record.lines, additions, (lines) => remapLines(lines, ''));
      mergedPeople += 1;
      mergedRecords += count;
    }
    for (const record of [...personRecords, ...familyRecords, ...newRecords]) addRecordBeforeTrailer(record);
    return { people: personRecords.length, families: familyRecords.length, joinedFamilies: mergedFamilies.length, linkedRecords: newRecords.length, mergedPeople, mergedRecords };
  }

  function existingRelativeCandidates(query) {
    const words = normalizeDirectoryName(query).split(/\s+/).filter(Boolean);
    return [...state.people.values()].filter((person) => person.id !== state.selectedId
      && words.every((word) => normalizeDirectoryName(`${person.name} ${person.id}`).includes(word)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function syncExistingRelativeChoices() {
    const select = document.querySelector('#relativeExistingPerson');
    const selectedId = select.value;
    const people = existingRelativeCandidates(document.querySelector('#relativeSearch').value);
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a person…';
    select.append(placeholder);
    for (const person of people.slice(0, 100)) {
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = `${person.name} · ${lifespan(person)} · @${person.id}@`;
      select.append(option);
    }
    select.value = [...select.options].some((option) => option.value === selectedId) ? selectedId : '';
    document.querySelector('#relativeSearchCount').textContent = `${Math.min(100, people.length)} of ${people.length} matches. Refine the search if needed.`;
  }

  function syncRelativeEntryMode() {
    const supportsExisting = ['PARENT', 'PARTNER'].includes(elements.relativeType.value);
    document.querySelector('#relativeModeField').hidden = !supportsExisting;
    const existing = supportsExisting && document.querySelector('#relativeMode').value === 'EXISTING';
    document.querySelector('#relativeExistingFields').hidden = !existing;
    for (const id of ['relativeGivenName', 'relativeSurname', 'relativeSex', 'relativeBirthDate',
      'relativeBirthPlace', 'relativeDeathDate', 'relativeDeathPlace']) {
      const field = document.getElementById(id).closest('label');
      field.hidden = existing;
      for (const input of field.querySelectorAll('input, select')) input.disabled = existing;
    }
    document.querySelector('#relativeExistingPerson').required = existing;
    document.querySelector('#relativeDuplicateWarning').hidden = true;
    document.querySelector('#relativeDuplicateConfirmationLabel').hidden = true;
    document.querySelector('#relativeError').hidden = true;
    document.querySelector('#relativeFamilyField').hidden = elements.relativeType.value !== 'PARENT';
    const familySelect = document.querySelector('#relativeFamily');
    familySelect.replaceChildren();
    const role = elements.relativeParentRole.value;
    const families = [...state.families.values()].filter((family) => family.childIds.includes(state.selectedId)
      && !(role === 'HUSB' ? family.husbandId : family.wifeId));
    for (const family of families) {
      const option = document.createElement('option');
      option.value = family.id;
      const other = state.people.get(role === 'HUSB' ? family.wifeId : family.husbandId);
      option.textContent = `@${family.id}@ · ${other?.name || 'No other parent recorded'}`;
      familySelect.append(option);
    }
    const newFamily = document.createElement('option');
    newFamily.value = '';
    newFamily.textContent = 'Create a separate parent family';
    familySelect.append(newFamily);
    if (families.length !== 1) familySelect.value = '';
    if (existing) syncExistingRelativeChoices();
  }

  function linkExistingRelative(personId, relation, parentRole, parentFamilyId) {
    const selectedId = state.selectedId;
    if (!['PARENT', 'PARTNER'].includes(relation) || !state.people.has(personId) || personId === selectedId) {
      throw new Error('Select a different existing person for this relationship.');
    }
    const selected = state.people.get(selectedId);
    const person = state.people.get(personId);
    const record = (id, tag) => state.gedcomRecords.find((entry) => entry.xref === id && entry.tag === tag);
    const selectedRecord = record(selectedId, 'INDI');
    const personRecord = record(personId, 'INDI');
    if (!selected || !selectedRecord || !personRecord) throw new Error('The selected person record could not be found.');
    const families = [...state.families.values()];
    const ancestorOf = (ancestor, child) => {
      const pending = [child];
      const visited = new Set();
      while (pending.length) {
        const id = pending.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        for (const family of families.filter((entry) => entry.childIds.includes(id))) {
          for (const parent of [family.husbandId, family.wifeId].filter(Boolean)) {
            if (parent === ancestor) return true;
            pending.push(parent);
          }
        }
      }
      return false;
    };
    if (relation === 'PARENT' && ancestorOf(selectedId, personId)) {
      throw new Error('This parent link would create an ancestry cycle.');
    }
    if (relation === 'PARTNER' && (ancestorOf(selectedId, personId) || ancestorOf(personId, selectedId))) {
      throw new Error('An ancestor and descendant cannot be linked as partners here.');
    }
    if (families.some((family) => relation === 'PARENT'
      ? family.childIds.includes(selectedId) && [family.husbandId, family.wifeId].includes(personId)
      : [family.husbandId, family.wifeId].includes(selectedId) && [family.husbandId, family.wifeId].includes(personId))) {
      throw new Error('These people already have this relationship.');
    }
    let familyRecord;
    let familyId;
    const role = relation === 'PARENT' ? parentRole : selected.sex === 'F' ? 'HUSB' : 'WIFE';
    if (!['HUSB', 'WIFE'].includes(role)) throw new Error('Choose a valid parent role.');
    if (relation === 'PARENT' && parentFamilyId) {
      const family = state.families.get(parentFamilyId);
      familyRecord = record(parentFamilyId, 'FAM');
      if (!familyRecord || !family?.childIds.includes(selectedId)
        || (role === 'HUSB' ? family.husbandId : family.wifeId)) {
        throw new Error('That parent family is unavailable or the parent role is already occupied.');
      }
      if (family.childIds.some((childId) => childId === personId || ancestorOf(childId, personId))) {
        throw new Error('This parent link would create an ancestry cycle for a child in this family.');
      }
      familyId = parentFamilyId;
    } else {
      familyId = nextGedcomXref('F', 'FAM');
      familyRecord = { xref: familyId, tag: 'FAM', lines: [`0 @${familyId}@ FAM`] };
    }
    appendRecordLine(familyRecord, `1 ${role} @${personId}@`);
    appendRecordLine(familyRecord, relation === 'PARENT'
      ? `1 CHIL @${selectedId}@` : `1 ${role === 'HUSB' ? 'WIFE' : 'HUSB'} @${selectedId}@`);
    appendRecordLine(selectedRecord, `1 ${relation === 'PARENT' ? 'FAMC' : 'FAMS'} @${familyId}@`);
    appendRecordLine(personRecord, `1 FAMS @${familyId}@`);
    if (!record(familyId, 'FAM')) addRecordBeforeTrailer(familyRecord);
    return personId;
  }

  function createRelativeRecord() {
    const selected = state.people.get(state.selectedId);
    if (!selected) return false;
    if (['PARENT', 'PARTNER'].includes(elements.relativeType.value)
      && document.querySelector('#relativeMode').value === 'EXISTING') {
      const errorBox = document.querySelector('#relativeError');
      try {
        const personId = linkExistingRelative(document.querySelector('#relativeExistingPerson').value,
          elements.relativeType.value, elements.relativeParentRole.value, document.querySelector('#relativeFamily').value);
        refreshAfterGedcomMutation(personId);
        elements.addRelativeDialog.close();
        elements.addRelativeForm.reset();
        return true;
      } catch (error) {
        errorBox.textContent = error instanceof Error ? error.message : 'The existing person could not be linked.';
        errorBox.hidden = false;
        return false;
      }
    }
    const givenName = cleanGedcomValue(document.querySelector('#relativeGivenName').value).replaceAll('/', ' ').trim();
    const surname = cleanGedcomValue(document.querySelector('#relativeSurname').value).replaceAll('/', ' ').trim();
    if (!givenName) {
      document.querySelector('#relativeGivenName').focus();
      return false;
    }
    const fullName = `${givenName} ${surname}`.trim().toLocaleLowerCase();
    const duplicateName = [...state.people.values()].some((person) => person.name.trim().toLocaleLowerCase() === fullName);
    const duplicateWarning = document.querySelector('#relativeDuplicateWarning');
    const duplicateConfirmation = document.querySelector('#relativeDuplicateConfirmationLabel');
    const duplicateConfirmed = document.querySelector('#relativeDuplicateConfirmed');
    if (duplicateName && !duplicateConfirmed.checked) {
      duplicateWarning.hidden = false;
      duplicateConfirmation.hidden = false;
      duplicateConfirmed.focus();
      return false;
    }
    duplicateWarning.hidden = true;
    duplicateConfirmation.hidden = true;
    const sex = document.querySelector('#relativeSex').value;
    const birthDate = enteredGedcomDate(document.querySelector('#relativeBirthDate').value);
    const birthPlace = cleanGedcomValue(document.querySelector('#relativeBirthPlace').value);
    const deathDate = enteredGedcomDate(document.querySelector('#relativeDeathDate').value);
    const deathPlace = cleanGedcomValue(document.querySelector('#relativeDeathPlace').value);
    const relation = elements.relativeType.value;
    const personId = nextGedcomXref('I', 'INDI');
    const familyId = nextGedcomXref('F', 'FAM');
    const newPersonLines = [
      `0 @${personId}@ INDI`, `1 NAME ${givenName}${surname ? ` /${surname}/` : ''}`, `2 GIVN ${givenName}`
    ];
    if (surname) newPersonLines.push(`2 SURN ${surname}`);
    if (sex) newPersonLines.push(`1 SEX ${sex}`);
    if (birthDate || birthPlace) {
      newPersonLines.push('1 BIRT');
      if (birthDate) newPersonLines.push(`2 DATE ${birthDate}`);
      if (birthPlace) newPersonLines.push(`2 PLAC ${birthPlace}`);
    }
    if (deathDate || deathPlace) {
      newPersonLines.push('1 DEAT');
      if (deathDate) newPersonLines.push(`2 DATE ${deathDate}`);
      if (deathPlace) newPersonLines.push(`2 PLAC ${deathPlace}`);
    }

    const familyLines = [`0 @${familyId}@ FAM`];
    let addFamilyRecord = true;
    const selectedRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === selected.id);
    if (!selectedRecord) return false;
    if (relation === 'PARENT') {
      const parentRole = elements.relativeParentRole.value;
      familyLines.push(`1 ${parentRole} @${personId}@`, `1 CHIL @${selected.id}@`);
      newPersonLines.push(`1 FAMS @${familyId}@`);
      selectedRecord.lines.push(`1 FAMC @${familyId}@`);
    } else if (relation === 'CHILD') {
      const selectedRole = selected.sex === 'F' ? 'WIFE' : 'HUSB';
      familyLines.push(`1 ${selectedRole} @${selected.id}@`, `1 CHIL @${personId}@`);
      newPersonLines.push(`1 FAMC @${familyId}@`);
      selectedRecord.lines.push(`1 FAMS @${familyId}@`);
    } else if (relation === 'SIBLING') {
      const existingParentFamilyId = selected.parentFamilyIds.find((id) => state.families.has(id));
      const existingParentFamilyRecord = state.gedcomRecords.find((record) => record.tag === 'FAM' && record.xref === existingParentFamilyId);
      if (existingParentFamilyId && existingParentFamilyRecord) {
        existingParentFamilyRecord.lines.push(`1 CHIL @${personId}@`);
        newPersonLines.push(`1 FAMC @${existingParentFamilyId}@`);
        addFamilyRecord = false;
      } else {
        familyLines.push(`1 CHIL @${selected.id}@`, `1 CHIL @${personId}@`);
        selectedRecord.lines.push(`1 FAMC @${familyId}@`);
        newPersonLines.push(`1 FAMC @${familyId}@`);
      }
    } else {
      const selectedRole = selected.sex === 'F' ? 'WIFE' : 'HUSB';
      const newRole = selectedRole === 'HUSB' ? 'WIFE' : 'HUSB';
      familyLines.push(`1 ${selectedRole} @${selected.id}@`, `1 ${newRole} @${personId}@`);
      newPersonLines.push(`1 FAMS @${familyId}@`);
      selectedRecord.lines.push(`1 FAMS @${familyId}@`);
    }
    addRecordBeforeTrailer({ xref: personId, tag: 'INDI', lines: newPersonLines });
    if (addFamilyRecord) addRecordBeforeTrailer({ xref: familyId, tag: 'FAM', lines: familyLines });
    refreshAfterGedcomMutation(personId);
    elements.addRelativeDialog.close();
    elements.addRelativeForm.reset();
    elements.relativeParentRoleField.hidden = false;
    return true;
  }

  const relationshipSentences = {
    PARENT: (other, me) => `${other} is a parent of ${me}.`,
    CHILD: (other, me) => `${other} is a child of ${me}.`,
    SIBLING: (other, me) => `${other} is a sibling of ${me}.`,
    PARTNER: (other, me) => `${other} is a partner / spouse of ${me}.`
  };

  function relationshipDialogParts() {
    const byId = (id) => document.querySelector(`#${id}`);
    return {
      dialog: byId('relationshipDialog'), summary: byId('relationshipSummary'), error: byId('relationshipError'),
      deleteWarning: byId('relationshipDeleteWarning'), deleteButton: byId('relationshipDelete'),
      role: byId('relationshipRole'), roleField: byId('relationshipRoleField'),
      pedi: byId('relationshipPedi'), pediField: byId('relationshipPediField'),
      date: byId('relationshipDate'), dateField: byId('relationshipDateField'),
      place: byId('relationshipPlace'), placeField: byId('relationshipPlaceField'),
      marriageType: byId('relationshipMarriageType'), marriageTypeField: byId('relationshipMarriageTypeField')
    };
  }

  const findGedcomRecord = (tag, xref) => state.gedcomRecords.find((record) => record.tag === tag && record.xref === xref);

  function findLinkLine(lines, tag, xref) {
    return lines.findIndex((line, index) => {
      if (index === 0) return false;
      const field = parseGedcomField(line);
      return field?.level === 1 && field.tag === tag && splitXref(field.value) === xref;
    });
  }

  function removeLinkLine(record, tag, xref) {
    if (!record) return;
    const lines = [...record.lines];
    const start = findLinkLine(lines, tag, xref);
    if (start < 0) return;
    lines.splice(start, lifeEventBlockEnd(lines, start) - start);
    record.lines = lines;
  }

  function readPedigree(childId, familyId) {
    const lines = findGedcomRecord('INDI', childId)?.lines || [];
    const start = findLinkLine(lines, 'FAMC', familyId);
    if (start < 0) return '';
    for (let index = start + 1; index < lifeEventBlockEnd(lines, start); index += 1) {
      const field = parseGedcomField(lines[index]);
      if (field?.level === 2 && field.tag === 'PEDI') return field.value.trim().toLowerCase();
    }
    return '';
  }

  function openRelationshipEditor(kind, familyId, otherId) {
    const parts = relationshipDialogParts();
    const family = state.families.get(familyId);
    const person = state.people.get(state.selectedId);
    if (!family || !person || !state.people.has(otherId)) return;
    const childId = kind === 'PARENT' ? person.id : kind === 'PARTNER' ? '' : otherId;
    const pending = { kind, familyId, otherId, personId: person.id, childId, original: {} };
    parts.summary.textContent = relationshipSentences[kind](personName(otherId), person.name);
    parts.error.hidden = true;
    parts.deleteWarning.hidden = true;
    parts.deleteButton.textContent = 'Delete relationship';
    pending.deleteArmed = false;
    parts.roleField.hidden = kind !== 'PARENT';
    parts.pediField.hidden = !childId;
    for (const field of [parts.dateField, parts.placeField, parts.marriageTypeField]) field.hidden = kind !== 'PARTNER';
    if (kind === 'PARENT') {
      pending.original.role = family.husbandId === otherId ? 'HUSB' : 'WIFE';
      parts.role.value = pending.original.role;
    }
    if (childId) {
      pending.original.pedi = readPedigree(childId, familyId);
      if (pending.original.pedi && ![...parts.pedi.options].some((option) => option.value === pending.original.pedi)) {
        parts.pedi.append(new Option(pending.original.pedi, pending.original.pedi));
      }
      parts.pedi.value = pending.original.pedi;
    }
    if (kind === 'PARTNER') {
      const marriage = family.marriage;
      pending.original.date = marriage?.date || '';
      pending.original.place = marriage?.place || '';
      pending.original.marriageType = marriage?.detail || '';
      parts.date.value = pending.original.date;
      parts.place.value = pending.original.place;
      parts.marriageType.value = pending.original.marriageType;
    }
    state.pendingRelationship = pending;
    parts.dialog.showModal();
  }

  function saveRelationship() {
    const pending = state.pendingRelationship;
    const parts = relationshipDialogParts();
    const showError = (message) => { parts.error.textContent = message; parts.error.hidden = false; return false; };
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const familyRecord = findGedcomRecord('FAM', pending.familyId);
    if (!familyRecord) return showError('This family record could not be found in the GEDCOM.');
    const lines = [...familyRecord.lines];

    if (pending.kind === 'PARENT') {
      const role = parts.role.value;
      if (role !== pending.original.role) {
        const family = state.families.get(pending.familyId);
        if ((role === 'HUSB' ? family.husbandId : family.wifeId)) {
          return showError(`This family already has a ${role === 'HUSB' ? 'father / HUSB' : 'mother / WIFE'}. Change or remove that parent first.`);
        }
        const index = findLinkLine(lines, pending.original.role, pending.otherId);
        if (index >= 0) lines[index] = `1 ${role} @${pending.otherId}@`;
      }
    }
    if (pending.kind === 'PARTNER') {
      const date = clean(parts.date.value);
      const place = clean(parts.place.value);
      const marriageType = clean(parts.marriageType.value);
      const original = pending.original;
      const start = lines.findIndex((line, index) => index > 0 && parseGedcomField(line)?.level === 1 && parseGedcomField(line)?.tag === 'MARR');
      if (start >= 0) {
        if (date !== original.date) setLifeEventSubfield(lines, start, 'DATE', date);
        if (place !== original.place) setLifeEventSubfield(lines, start, 'PLAC', place);
        if (marriageType !== original.marriageType) setLifeEventSubfield(lines, start, 'TYPE', marriageType);
      } else if (date || place || marriageType) {
        lines.push('1 MARR');
        if (date) lines.push(`2 DATE ${date}`);
        if (place) lines.push(`2 PLAC ${place}`);
        if (marriageType) lines.push(`2 TYPE ${marriageType}`);
      }
    }
    familyRecord.lines = lines;

    if (pending.childId && parts.pedi.value !== pending.original.pedi) {
      const childRecord = findGedcomRecord('INDI', pending.childId);
      const childLines = childRecord ? [...childRecord.lines] : [];
      const start = findLinkLine(childLines, 'FAMC', pending.familyId);
      if (start >= 0) {
        setLifeEventSubfield(childLines, start, 'PEDI', parts.pedi.value);
        childRecord.lines = childLines;
      }
    }
    refreshAfterGedcomMutation(pending.personId);
    parts.dialog.close();
    showToast('Relationship updated.');
    return true;
  }

  function deleteRelationship() {
    const pending = state.pendingRelationship;
    const parts = relationshipDialogParts();
    const { kind, familyId, otherId, personId } = pending;
    const family = state.families.get(familyId);
    const familyRecord = findGedcomRecord('FAM', familyId);
    if (!family || !familyRecord) return false;
    if (kind === 'PARENT' || kind === 'PARTNER') {
      const memberId = otherId;
      const hasChildren = family.childIds.length > 0;
      if (kind === 'PARTNER' && !hasChildren) {
        removeLinkLine(findGedcomRecord('INDI', personId), 'FAMS', familyId);
        removeLinkLine(findGedcomRecord('INDI', otherId), 'FAMS', familyId);
        state.gedcomRecords.splice(state.gedcomRecords.indexOf(familyRecord), 1);
      } else {
        const role = family.husbandId === memberId ? 'HUSB' : 'WIFE';
        removeLinkLine(familyRecord, role, memberId);
        removeLinkLine(findGedcomRecord('INDI', memberId), 'FAMS', familyId);
      }
    } else {
      removeLinkLine(familyRecord, 'CHIL', otherId);
      removeLinkLine(findGedcomRecord('INDI', otherId), 'FAMC', familyId);
    }
    refreshAfterGedcomMutation(personId);
    parts.dialog.close();
    showToast('Relationship deleted. The people records were kept.');
    return true;
  }

  // Works out everything a person deletion touches. Families left with one member or none are removed too,
  // as are NOTE/OBJE records used only by removed records. Sources, repositories and media files are kept.
  function gedcomPointer(value) {
    return /^@[^@\s]+@$/.test(value.trim()) ? value.trim().slice(1, -1) : '';
  }

  function planPersonDeletion(personId) {
    const person = state.people.get(personId);
    const personRecord = findGedcomRecord('INDI', personId);
    if (!person || !personRecord) return null;
    const removedFamilyIds = [];
    const keptFamilies = [];
    for (const family of state.families.values()) {
      const members = [family.husbandId, family.wifeId, ...family.childIds].filter(Boolean);
      if (!members.includes(personId)) continue;
      const remaining = [...new Set(members.filter((id) => id !== personId && state.people.has(id)))];
      if (remaining.length <= 1) removedFamilyIds.push(family.id);
      else keptFamilies.push(family.id);
    }
    const removedRecords = new Set([personRecord, ...removedFamilyIds.map((id) => findGedcomRecord('FAM', id)).filter(Boolean)]);
    const pointersIn = (record) => record.lines.slice(1).map(parseGedcomField)
      .map((field) => field && gedcomPointer(field.value)).filter(Boolean);
    const candidateIds = new Set([...removedRecords].flatMap(pointersIn));
    const ownedRecords = [];
    for (const record of state.gedcomRecords) {
      if (!['NOTE', 'OBJE'].includes(record.tag) || !record.xref || !candidateIds.has(record.xref)) continue;
      const usedElsewhere = state.gedcomRecords.some((other) => other !== record && !removedRecords.has(other) && pointersIn(other).includes(record.xref));
      if (!usedElsewhere) ownedRecords.push(record);
    }
    for (const record of ownedRecords) removedRecords.add(record);
    const removedIds = new Set([...removedRecords].map((record) => record.xref).filter(Boolean));
    const groups = relationshipGroups(person);
    const count = (label) => groups.find(([name]) => name === label)?.[1].filter((item) => item.id).length || 0;
    return {
      personId, name: person.name, removedRecords, removedIds, removedFamilyIds, keptFamilies,
      notes: ownedRecords.filter((record) => record.tag === 'NOTE').length,
      mediaRecords: ownedRecords.filter((record) => record.tag === 'OBJE').length,
      events: person.events.length,
      parents: count('Parents'), partners: count('Partners / spouses'), children: count('Children'),
      fallbackId: [...groups.flatMap(([, items]) => items.map((item) => item.id)), state.primaryPersonId]
        .find((id) => id && id !== personId && state.people.has(id)) || ''
    };
  }

  function deletePersonRecord(plan) {
    const removedIds = plan.removedIds;
    const kept = state.gedcomRecords.filter((record) => !plan.removedRecords.has(record));
    let removedLinks = 0;
    for (const record of kept) {
      const lines = [];
      let skipBelow = Infinity;
      for (const [index, line] of record.lines.entries()) {
        const field = index ? parseGedcomField(line) : null;
        if (field && field.level > skipBelow) continue;
        skipBelow = Infinity;
        if (field && removedIds.has(gedcomPointer(field.value))) {
          skipBelow = field.level;
          removedLinks += 1;
          continue;
        }
        lines.push(line);
      }
      if (lines.length !== record.lines.length) record.lines = lines;
    }
    state.gedcomRecords = kept;
    if (state.additionalMedia.delete(plan.personId)) saveAdditionalMedia();
    if (state.primaryMedia.delete(plan.personId)) savePrimaryMedia();
    if (state.primaryPersonId === plan.personId) {
      state.primaryPersonId = '';
      if (!storeSelection(primaryPersonStorageKey(), null)) showToast('The cleared primary person could not be saved in browser storage.');
    }
    if (state.defaultRecord?.homePersonId === plan.personId && state.defaultRecord.gedcomName === state.fileName) {
      const updated = { ...state.defaultRecord, homePersonId: '', homePersonName: '' };
      state.defaultRecord = updated;
      writeDefaultRecord(updated).catch(() => { });
    }
    refreshAfterGedcomMutation(plan.fallbackId);
    syncPrimaryPersonBar();
    return { removedLinks };
  }

  function openPersonDeleteDialog(personId) {
    if (state.people.size < 2) {
      showToast('The only person in a tree cannot be deleted. Use "Start Again" instead.');
      return;
    }
    const plan = planPersonDeletion(personId);
    if (!plan) {
      showToast('This person could not be found in the GEDCOM file.');
      return;
    }
    const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    const items = [
      `The person record (@${personId}@) and ${plural(plan.events, 'life event')}`,
      plan.parents && `Links to ${plural(plan.parents, 'parent')}`,
      plan.partners && `Links to ${plural(plan.partners, 'partner')}`,
      plan.children && `Links to ${plural(plan.children, 'child', 'children')}`,
      plan.removedFamilyIds.length && `${plural(plan.removedFamilyIds.length, 'family record')} that would be left with only one person (including any marriage details)`,
      plan.notes && `${plural(plan.notes, 'note')} used only by this person`,
      plan.mediaRecords && `${plural(plan.mediaRecords, 'media record')} used only by this person (the files stay in the media folder)`
    ].filter(Boolean);
    document.querySelector('#personDeleteName').textContent = plan.name;
    document.querySelector('#personDeleteSummary').replaceChildren(...items.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    document.querySelector('#personDeleteKept').textContent =
      'Relatives stay in the tree. Sources, repositories and media files are kept.' +
      (plan.keptFamilies.length ? ` ${plural(plan.keptFamilies.length, 'family', 'families')} with other members will keep their remaining people.` : '');
    pendingPersonDelete = plan;
    const dialog = document.querySelector('#personDeleteDialog');
    dialog.showModal();
    dialog.querySelector('.dialog-button-quiet').focus();
  }

  function ensureCreateGedcomWelcomeAction() {
    const welcomeButton = elements.canvas.querySelector('.welcome-button');
    if (!welcomeButton || elements.canvas.querySelector('[data-create-gedcom]')) return;
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    welcomeButton.replaceWith(actions);
    const createButton = makeButton('Create new GEDCOM', 'button button-secondary');
    createButton.dataset.createGedcom = 'true';
    const orLabel = document.createElement('span');
    orLabel.className = 'welcome-or';
    orLabel.textContent = 'or';
    actions.append(welcomeButton, orLabel, createButton);
  }

  async function loadGedcomFile(file, { source = 'file', handle = null } = {}) {
    if (file.size > 100 * 1024 * 1024) {
      showToast('This file is over 100 MB. Choose a smaller GEDCOM export.');
      return false;
    }
    try {
      elements.loadStatus.textContent = 'READING LOCALLY…';
      const text = await file.text();
      const parsed = parseGedcom(text);
      const storageKey = await primaryMediaStorageKey(file, text);
      setLoaded(file.name, parsed, storageKey, text);
      state.gedcomSource = source;
      state.gedcomFileHandle = handle;
      state.gedcomBaseHash = await sha256Hex(text);
      syncGedcomSaveUi();
      await persistActiveSession();
      showToast(`Loaded ${parsed.people.size.toLocaleString()} individuals. Edits are saved back to ${file.name}.`);
      return true;
    } catch (error) {
      elements.loadStatus.textContent = 'IMPORT FAILED';
      showToast(error instanceof Error ? error.message : 'The GEDCOM could not be read.');
      return false;
    }
  }

  elements.fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!await loadGedcomFile(file)) elements.fileInput.value = '';
    else promptForMediaFolder();
  });
  // A file chosen through showOpenFilePicker can be written back to; the plain file input is the fallback.
  document.addEventListener('click', async (event) => {
    if (!event.target.closest?.('label[for="gedcomInput"]') || typeof window.showOpenFilePicker !== 'function') return;
    event.preventDefault();
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({ types: [{ description: 'GEDCOM', accept: { 'text/plain': ['.ged', '.gedcom'] } }] });
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('The GEDCOM file could not be opened.');
      return;
    }
    let file;
    try {
      file = await handle.getFile();
    } catch {
      showToast('The GEDCOM file could not be read.');
      return;
    }
    if (await loadGedcomFile(file, { source: 'handle', handle })) promptForMediaFolder();
  });
  function promptForMediaFolder() {
    if (state.mediaDirectoryHandle || state.mediaHelper || elements.mediaButton.disabled) return;
    window.setTimeout(() => {
      if (!state.mediaDirectoryHandle && !elements.mediaFolderDialog.open) showMediaFolderDialog();
    }, 300);
  }

  elements.createGedcomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileNameInput = document.querySelector('#newGedcomFileName');
    const givenName = cleanGedcomValue(document.querySelector('#newGedcomGivenName').value).replaceAll('/', ' ').trim();
    const surname = cleanGedcomValue(document.querySelector('#newGedcomSurname').value).replaceAll('/', ' ').trim();
    const sex = document.querySelector('#newGedcomSex').value;
    const birthDate = enteredGedcomDate(document.querySelector('#newGedcomBirthDate').value);
    const birthPlace = cleanGedcomValue(document.querySelector('#newGedcomBirthPlace').value);
    if (!givenName) {
      showToast('Enter at least one given name to create the GEDCOM.');
      document.querySelector('#newGedcomGivenName').focus();
      return;
    }

    const requestedBase = cleanGedcomValue(fileNameInput.value).replace(/\.(?:ged|gedcom)$/i, '');
    const safeBase = requestedBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'Family Tree';
    const fileName = `${safeBase}.ged`;
    const lines = [
      '0 HEAD', '1 SOUR KINSHIP ATLAS', '2 VERS 1.0', '1 GEDC', '2 VERS 5.5.1',
      '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', `1 FILE ${fileName}`,
      '0 @I1@ INDI', `1 NAME ${givenName}${surname ? ` /${surname}/` : ''}`,
      `2 GIVN ${givenName}`
    ];
    if (surname) lines.push(`2 SURN ${surname}`);
    if (sex) lines.push(`1 SEX ${sex}`);
    if (birthDate || birthPlace) {
      lines.push('1 BIRT');
      if (birthDate) lines.push(`2 DATE ${birthDate}`);
      if (birthPlace) lines.push(`2 PLAC ${birthPlace}`);
    }
    lines.push('0 TRLR');
    const gedcomText = `${lines.join('\r\n')}\r\n`;
    const file = new File([gedcomText], fileName, { type: 'text/plain' });
    const parsed = parseGedcom(gedcomText);
    let saveAction = 'downloaded';
    let mediaHandle = null;
    let helperFolder = '';
    let mediaProblem = '';
    let createdHandle = null;
    const errorBox = document.querySelector('#newGedcomError');
    const showCreateError = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
    errorBox.hidden = true;
    try {
      if (typeof window.showDirectoryPicker === 'function') {
        let parent;
        try {
          parent = await window.showDirectoryPicker({ id: 'kinship-new-tree', mode: 'readwrite', startIn: 'documents' });
        } catch (error) {
          if (error.name === 'AbortError') return;
          showCreateError(error.name === 'SecurityError'
            ? 'The browser will not allow that folder (protected folders such as Documents, Desktop and Downloads are blocked). Choose or create a sub-folder inside it and try again.'
            : `The folder could not be opened for writing (${error.name}: ${error.message}).`);
          return;
        }
        const exists = await parent.getFileHandle(fileName).then(() => true, () => false);
        if (exists) {
          showCreateError(`${fileName} already exists in that folder. Choose another folder or change the file name.`);
          return;
        }
        const handle = await parent.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(gedcomText);
        await writable.close();
        createdHandle = handle;
        saveAction = 'saved';
        try {
          mediaHandle = await parent.getDirectoryHandle(`${safeBase}_Media`, { create: true });
        } catch (error) {
          mediaProblem = `${error.name}: ${error.message}`;
        }
      } else if (state.mediaHelper) {
        const response = await fetch('/api/new-tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: safeBase, text: gedcomText })
        });
        if (response.status === 409) {
          showCreateError(`${fileName} already exists in the helper's folder. Change the file name.`);
          return;
        }
        if (!response.ok) throw new Error('The helper could not create the files.');
        helperFolder = (await response.json()).folder;
        saveAction = 'saved';
      } else {
        const downloadUrl = URL.createObjectURL(file);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = fileName;
        downloadLink.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    } catch (error) {
      showCreateError(`The GEDCOM file could not be saved (${error.name}: ${error.message}).`);
      return;
    }

    const storageKey = await primaryMediaStorageKey(file, gedcomText);
    setLoaded(fileName, parsed, storageKey, gedcomText);
    if (createdHandle) {
      state.gedcomSource = 'handle';
      state.gedcomFileHandle = createdHandle;
    }
    state.gedcomBaseHash = await sha256Hex(gedcomText);
    if (mediaHandle) {
      state.mediaDirectoryHandle = mediaHandle;
      syncMediaButton();
      await indexMediaDirectory(mediaHandle);
      render();
    } else if (helperFolder) {
      state.mediaHelper = { folder: helperFolder };
      render();
    }
    await persistActiveSession();
    elements.newGedcomDialog.close();
    const mediaNote = mediaHandle || helperFolder
      ? ` and linked an empty media folder (${mediaHandle ? mediaHandle.name : helperFolder}).`
      : mediaProblem
        ? `, but the media folder could not be created (${mediaProblem}).`
        : '. No media folder was made because this browser has folder access turned off. Create a folder named "' + safeBase + '_Media" next to the downloaded file, then use Select Media Folder. (Brave: enable brave://flags/#file-system-access-api and relaunch for automatic creation.)';
    showToast(`Created a new GEDCOM starter with one person and ${saveAction} the file${mediaNote}`);
    promptForMediaFolder();
  });
  ensureCreateGedcomWelcomeAction();

  function showNewGedcomNotice() {
    const notice = document.querySelector('#newGedcomNotice');
    document.querySelector('#newGedcomError').hidden = true;
    if (typeof window.showDirectoryPicker === 'function') {
      notice.hidden = true;
      return;
    }
    const isBrave = Boolean(navigator.brave);
    const helperLine = state.mediaHelper
      ? '<p>The local helper is running, so the files will be created in its media folder\'s parent folder.</p>'
      : '';
    notice.innerHTML = `
      <p><strong>This browser can't create folders on your computer, so the media folder can't be made automatically.</strong></p>
      ${isBrave ? '<p>To fix this in Brave: open <code>brave://flags/#file-system-access-api</code>, set it to <em>Enabled</em>, relaunch Brave, and reopen this page. Edge and Chrome work without changes.</p>' : '<p>Use a Chromium browser such as Edge or Chrome, which supports folder access.</p>'}
      ${helperLine}
      <p>To continue anyway, create the file and then set up the media folder by hand:</p>
      <ol>
        <li>Move the downloaded <code>.ged</code> file to where you want to keep it.</li>
        <li>Next to it, create a folder named the same, with <code>_Media</code> added (for example <code>Family Tree_Media</code>).</li>
        <li>Copy photos and PDFs into that folder yourself.</li>
        <li>Use <em>Select Media Folder</em> in the top bar to view them. Uploading from the app needs folder access.</li>
      </ol>`;
    notice.hidden = false;
  }

  elements.mediaButton.addEventListener('click', showMediaFolderDialog);
  elements.linkExistingMediaFolder.addEventListener('click', () => {
    chooseMediaDirectory(false).finally(() => elements.mediaFolderDialog.close());
  });
  elements.createMediaFolder.addEventListener('click', () => {
    chooseMediaDirectory(true).finally(() => elements.mediaFolderDialog.close());
  });
  document.querySelector('#confirmUnlinkMedia').addEventListener('click', () => {
    document.querySelector('#unlinkMediaDialog').close();
    if (pendingUnlink) unlinkPersonMedia(pendingUnlink.personId, pendingUnlink.path);
    pendingUnlink = null;
  });
  document.querySelectorAll('button[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close());
  });
  elements.mediaInput.addEventListener('change', (event) => {
    const files = [...(event.target.files || [])];
    elements.mediaInput.value = '';
    if (!files.length) return;
    state.mediaDirectoryHandle = null;
    state.rememberedMediaDirectoryHandle = null;
    state.mediaFolderPicked = true;
    syncMediaButton();
    state.mediaRelativePaths = new WeakMap();
    releaseMediaUrls();
    const byName = new Map();
    for (const file of files) {
      const name = normalizeMediaPath(file.name);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(file);
    }
    state.mediaIndex = { byName };
    let references = 0;
    let matched = 0;
    for (const person of state.people.values()) {
      for (const path of person.mediaPaths) {
        references += 1;
        if (resolveMediaFile(path)) matched += 1;
      }
    }
    render();
    showToast(`Matched ${matched.toLocaleString()} of ${references.toLocaleString()} media references. This browser cannot write to folders, so media is view-only here. Use Edge or Chrome to add files.`);
  });

  elements.clear.addEventListener('click', () => {
    if (state.mediaLibraryMode) setMediaLibraryMode(false);
    if (state.mapMode) setMapMode(false);
    if (state.reportsMode) setReportsMode(false);
    elements.mapViewButton.disabled = true;
    elements.reportsButton.disabled = true;
    elements.mediaLibraryButton.disabled = true;
    document.querySelector('#mediaLibraryMenuButton').disabled = true;
    document.querySelector('#birthCountryMenuButton').disabled = true;
    releaseMediaUrls(); state.mediaIndex = null; state.mediaFolderPicked = false;
    state.mediaRelativePaths = new WeakMap(); state.mediaDirectoryHandle = null; state.pendingUploadPersonId = null;
    syncMediaButton();
    state.primaryMediaKey = ''; state.primaryMedia.clear(); state.mediaTypes.clear();
    state.additionalMedia.clear();
    state.gedcomRecords = [];     state.gedcomDirty = false;
    state.gedcomSource = ''; state.gedcomFileHandle = null; state.gedcomBaseHash = ''; state.gedcomPickerDeclined = false;
    state.people.clear(); state.families.clear(); state.sources.clear(); state.selectedId = null;
    state.primaryPersonId = ''; syncPrimaryPersonBar();
    refreshDirectoryFilters(true);
    state.fileName = ''; state.gedcomText = ''; state.history = []; state.historyIndex = -1; state.searchText = '';
    state.rememberedMediaDirectoryHandle = null;
    elements.fileInput.value = ''; elements.mediaInput.value = ''; elements.mediaButton.disabled = true; elements.search.value = ''; elements.search.disabled = true;
    document.querySelector('#openGedcomLabel').hidden = false;
    elements.clear.disabled = true; elements.back.disabled = true; elements.forward.disabled = true;
    document.querySelector('#importGedcomButton').disabled = true;
    elements.printMapButton.disabled = true;
    state.showSiblings = true;
    elements.showSiblings.checked = true;
    elements.showSiblings.disabled = true;
    elements.zoomIn.disabled = true; elements.zoomOut.disabled = true;
    elements.treeLabel.textContent = 'No tree loaded'; elements.treeLabel.disabled = true; elements.peopleCount.textContent = '0';
    elements.loadStatus.textContent = 'WAITING FOR FILE'; elements.statusPip.classList.remove('ready');
    syncGedcomSaveUi();
    elements.canvas.innerHTML = '<div class="welcome-state"><div class="welcome-art" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="welcome-node node-a"></span><span class="welcome-node node-b"></span><span class="welcome-node node-c"></span><span class="welcome-node node-d"></span><span class="welcome-node node-e"></span><span class="welcome-stem stem-a"></span><span class="welcome-stem stem-b"></span><span class="welcome-stem stem-c"></span><span class="welcome-stem stem-d"></span></div><div class="eyebrow">YOUR ARCHIVE, CONNECTED</div><h2>Start with a person.</h2><p>Choose a local GEDCOM file to open its family relationships in this tab.</p><label class="button button-primary welcome-button" for="gedcomInput"><span class="button-plus" aria-hidden="true">+</span> Open GEDCOM</label><span class="welcome-note">Your file is read locally and never uploaded. Saved edits are written back to the file on this device.</span></div>';
    ensureCreateGedcomWelcomeAction();
    ensureDefaultWelcomeAction();
    elements.title.textContent = 'A family, in context.'; elements.subtitle.textContent = 'Open a GEDCOM to explore recorded relationships.';
    elements.graphSummary.textContent = 'NO TREE LOADED'; elements.generationLabel.textContent = 'FIVE GENERATIONS';
    state.zoom = 1; elements.canvas.style.zoom = '1'; elements.zoomLabel.textContent = '100%';
    renderRoster(); renderDetails();
    clearActiveSession();
  });

  elements.search.addEventListener('input', () => { state.searchText = elements.search.value; renderRoster(); });
  elements.showSiblings.addEventListener('change', () => {
    state.showSiblings = elements.showSiblings.checked;
    renderGraph();
  });
  const mediaTypeFilter = document.querySelector('#mediaLibraryTypeFilter');
  for (const [value, label] of mediaTypeOptions) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mediaTypeFilter.append(option);
  }
  elements.mapViewButton.addEventListener('click', () => {
    if (state.mediaLibraryMode) setMediaLibraryMode(false);
    if (state.reportsMode) setReportsMode(false);
    setMapMode(!state.mapMode);
  });
  elements.reportsButton.addEventListener('click', () => setReportsMode(!state.reportsMode));
  elements.mediaLibraryButton.addEventListener('click', () => setMediaLibraryMode(!state.mediaLibraryMode));
  document.querySelector('#mediaLibraryMenuButton').addEventListener('click', () => setMediaLibraryMode(true));
  document.querySelector('#birthCountryMenuButton').addEventListener('click', openBirthCountryDialog);
  document.querySelector('#birthCountrySearch').addEventListener('input', renderBirthCountryList);
  document.querySelector('#birthCountryList').addEventListener('input', (event) => {
    const input = event.target.closest('input[data-birth-country-person]');
    if (input) applyBirthCountryInput(input);
  });
  document.querySelector('#birthCountryList').addEventListener('click', (event) => {
    const accept = event.target.closest('button[data-accept-country]');
    if (accept) {
      const row = accept.closest('.birth-country-row');
      const input = row.querySelector('input[data-birth-country-person]');
      input.value = appendCountryToPlace(input.dataset.original, accept.dataset.acceptCountry);
      applyBirthCountryInput(input);
      renderBirthCountrySuggestionCell(row);
      return;
    }
    const button = event.target.closest('button[data-birth-country-open]');
    if (!button || !closeBirthCountryDialog()) return;
    if (state.mediaLibraryMode) setMediaLibraryMode(false);
    if (state.reportsMode) setReportsMode(false);
    if (state.mapMode) setMapMode(false);
    setFocus(button.dataset.birthCountryOpen);
  });
  document.querySelector('#birthCountryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    saveBirthCountries();
  });
  document.querySelector('#closeBirthCountries').addEventListener('click', closeBirthCountryDialog);
  document.querySelector('#geonamesLookup').addEventListener('click', runGeonamesLookup);
  document.querySelector('#geonamesUsername').addEventListener('input', syncGeonamesControls);
  document.querySelector('#geonamesConsent').addEventListener('change', syncGeonamesControls);
  document.querySelector('#geonamesUsername').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!document.querySelector('#geonamesLookup').disabled) runGeonamesLookup();
  });
  document.querySelector('#birthCountryDialog').addEventListener('close', () => state.geonamesLookup?.abort());
  document.querySelector('#birthCountryDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeBirthCountryDialog();
  });
  document.querySelector('#mediaLibraryBackButton').addEventListener('click', () => setMediaLibraryMode(false));
  document.querySelector('#mediaLibrarySearch').addEventListener('input', renderMediaLibrary);
  document.querySelector('#mediaLibraryTypeFilter').addEventListener('change', renderMediaLibrary);
  document.querySelector('#printReportsButton').addEventListener('click', printReports);
  elements.reportsContent.addEventListener('click', (event) => {
    const more = event.target.closest('[data-report-more]');
    if (more) {
      const rows = [...more.parentElement.querySelectorAll('.report-bar-row.is-extra')];
      const expand = rows.some((row) => row.hidden);
      rows.forEach((row) => { row.hidden = !expand; });
      more.textContent = expand ? 'Show fewer' : more.dataset.reportMore;
      return;
    }
    const link = event.target.closest('[data-report-person]');
    if (!link || !state.people.has(link.dataset.reportPerson)) return;
    setReportsMode(false);
    setFocus(link.dataset.reportPerson);
  });
  elements.birthCountryFilter.addEventListener('change', () => {
    state.directoryFilters.birthCountry = elements.birthCountryFilter.value;
    renderRoster();
  });
  elements.deathCountryFilter.addEventListener('change', () => {
    state.directoryFilters.deathCountry = elements.deathCountryFilter.value;
    renderRoster();
  });
  elements.occupationTypeFilter.addEventListener('change', () => {
    state.directoryFilters.occupationType = elements.occupationTypeFilter.value;
    renderRoster();
  });
  elements.birthYearMin.addEventListener('input', () => handleYearFilterInput('birth', 'min'));
  elements.birthYearMax.addEventListener('input', () => handleYearFilterInput('birth', 'max'));
  elements.deathYearMin.addEventListener('input', () => handleYearFilterInput('death', 'min'));
  elements.deathYearMax.addEventListener('input', () => handleYearFilterInput('death', 'max'));
  elements.peopleList.addEventListener('change', (event) => {
    const check = event.target.closest('input[data-surname-filter]');
    if (!check) return;
    if (check.checked) state.surnameFilter.add(check.dataset.surnameFilter);
    else state.surnameFilter.delete(check.dataset.surnameFilter);
    renderRoster();
  });
  elements.clearSurnameFilter.addEventListener('click', () => {
    state.surnameFilter.clear();
    renderRoster();
  });
  elements.peopleList.addEventListener('click', (event) => {
    const groupToggle = event.target.closest('button[data-surname-toggle]');
    if (groupToggle) {
      const surname = groupToggle.dataset.surnameToggle;
      if (state.expandedSurnames.has(surname)) state.expandedSurnames.delete(surname);
      else state.expandedSurnames.add(surname);
      renderRoster();
      return;
    }
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.canvas.addEventListener('click', (event) => {
    if (event.target.closest('button[data-open-default]')) {
      openDefaultTree(true);
      return;
    }
    if (event.target.closest('button[data-create-gedcom]')) {
      showNewGedcomNotice();
      elements.newGedcomDialog.showModal();
      return;
    }
    const shiftButton = event.target.closest('button[data-tree-shift]');
    if (shiftButton) {
      setFocus(shiftButton.dataset.personId);
      return;
    }
    const personButton = event.target.closest('.person-card[data-person-id]');
    if (personButton) setFocus(personButton.dataset.personId);
  });
  elements.details.addEventListener('click', (event) => {
    const summaryEditButton = event.target.closest('button[data-edit-person-summary]');
    if (summaryEditButton) {
      const person = state.people.get(summaryEditButton.dataset.editPersonSummary);
      if (person) openPersonSummaryEditor(person);
      return;
    }
    const homeButton = event.target.closest('button[data-home-person]');
    if (homeButton) {
      toggleHomePerson(homeButton.dataset.homePerson);
      return;
    }
    const primaryPersonButton = event.target.closest('button[data-primary-person]');
    if (primaryPersonButton) {
      togglePrimaryPerson(primaryPersonButton.dataset.primaryPerson);
      return;
    }
    if (event.target.closest('button[data-print-person]')) {
      printSection('person');
      return;
    }
    if (event.target.closest('button[data-save-gedcom]')) {
      saveGedcomFile({ interactive: true });
      return;
    }
    const deletePersonButton = event.target.closest('button[data-delete-person]');
    if (deletePersonButton) {
      openPersonDeleteDialog(deletePersonButton.dataset.deletePerson);
      return;
    }
    if (event.target.closest('button[data-change-card-image]')) {
      showCardImageChoices();
      return;
    }
    const editButton = event.target.closest('button[data-add-life-event]');
    if (editButton) {
      const person = state.people.get(editButton.dataset.addLifeEvent);
      if (person) openLifeEventEditor(person, null);
      return;
    }
    if (event.target.closest('.event-media a, .event-media button')) return;
    const eventItem = event.target.closest('.event-item[data-event-ordinal], .event-item[data-family-id]');
    if (eventItem) {
      const person = state.people.get(state.selectedId);
      const lifeEvent = eventItem.dataset.familyId
        ? marriageEventsFor(person).find((entry) => entry.familyId === eventItem.dataset.familyId && entry.type === eventItem.dataset.familyEvent)
        : person?.events.find((entry) => entry.ordinal === Number(eventItem.dataset.eventOrdinal));
      if (lifeEvent) openLifeEventEditor(person, lifeEvent);
      return;
    }
    const addRelationButton = event.target.closest('button[data-add-relation]');
    if (addRelationButton && state.people.has(state.selectedId)) {
      elements.addRelativeForm.reset();
      elements.relativeType.value = addRelationButton.dataset.addRelation;
      document.querySelector('#relativeDuplicateWarning').hidden = true;
      document.querySelector('#relativeDuplicateConfirmationLabel').hidden = true;
      elements.relativeParentRoleField.hidden = elements.relativeType.value !== 'PARENT';
      syncRelativeEntryMode();
      elements.addRelativeDialog.showModal();
      return;
    }
    const editRelationButton = event.target.closest('button[data-edit-relationship]');
    if (editRelationButton) {
      openRelationshipEditor(editRelationButton.dataset.editRelationship, editRelationButton.dataset.familyId, editRelationButton.dataset.otherId);
      return;
    }
    const relativeButton = event.target.closest('button[data-add-relative]');
    if (relativeButton) {
      state.selectedId = relativeButton.dataset.addRelative;
      elements.addRelativeForm.reset();
      document.querySelector('#relativeDuplicateWarning').hidden = true;
      document.querySelector('#relativeDuplicateConfirmationLabel').hidden = true;
      elements.relativeParentRoleField.hidden = elements.relativeType.value !== 'PARENT';
      syncRelativeEntryMode();
      elements.addRelativeDialog.showModal();
      return;
    }
    const addButton = event.target.closest('button[data-add-media-for]');
    if (addButton) {
      state.pendingUploadPersonId = addButton.dataset.addMediaFor;
      elements.mediaUploadInput.click();
      return;
    }
    const researchButton = event.target.closest('button[data-wikitree-search]');
    if (researchButton) {
      const person = state.people.get(researchButton.dataset.wikitreeSearch);
      if (!isRecordedDeceased(person)) return;
      state.pendingResearchPersonId = person.id;
      renderWikiTreeQueryPreview(buildWikiTreeQuery(person));
      elements.wikiTreeSearchStatus.hidden = true;
      elements.wikiTreeSearchStatus.textContent = '';
      elements.wikiTreeResults.replaceChildren();
      elements.wikiTreeResults.hidden = true;
      elements.researchConsent.checked = false;
      elements.confirmWikiTreeSearch.disabled = true;
      elements.researchDialog.showModal();
      return;
    }
    const primaryButton = event.target.closest('button[data-primary-media]');
    if (primaryButton) {
      state.primaryMedia.set(primaryButton.dataset.personId, primaryButton.dataset.primaryMedia);
      render();
      const saved = savePrimaryMedia();
      showToast(saved ? 'Primary card image saved for this tree.' : 'Primary image selected for this tab; browser storage is unavailable.');
      return;
    }
    const unlinkButton = event.target.closest('button[data-unlink-media]');
    if (unlinkButton) {
      pendingUnlink = { personId: unlinkButton.dataset.personId, path: unlinkButton.dataset.unlinkMedia };
      document.querySelector('#unlinkMediaDialog').showModal();
      return;
    }
    const revealButton = event.target.closest('button[data-reveal-media]');
    if (revealButton) {
      revealMediaInExplorer(revealButton.dataset.revealMedia, event.shiftKey);
      return;
    }
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.mediaUploadInput.addEventListener('change', (event) => {
    saveUploadedMedia([...(event.target.files || [])]);
  });
  elements.primaryHomeButton.addEventListener('click', () => {
    showPrimaryPersonRelationshipMap();
  });
  elements.addGedcomField.addEventListener('click', () => appendGedcomFieldRow());
  elements.personFieldsEditor.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.gedcom-field-remove');
    if (removeButton) removeButton.closest('.gedcom-field-row').remove();
  });
  elements.personEditorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    savePersonFields();
  });
  elements.personSummaryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    savePersonSummary();
  });
  elements.personSummaryBirthDate.addEventListener('input', () => {
    elements.personSummaryBirthDatePicker.value = datePickerValue(elements.personSummaryBirthDate.value);
  });
  for (const id of ['newGedcomBirthDate', 'relativeBirthDate', 'relativeDeathDate']) {
    const input = document.getElementById(id);
    const picker = document.getElementById(`${id}Picker`);
    input.addEventListener('input', () => { picker.value = datePickerValue(input.value); });
    picker.addEventListener('change', () => {
      if (picker.value) input.value = formatGedcomDate(picker.value);
    });
    input.form.addEventListener('reset', () => { picker.value = ''; });
  }
  elements.personSummaryBirthDatePicker.addEventListener('change', () => {
    if (elements.personSummaryBirthDatePicker.value) {
      elements.personSummaryBirthDate.value = formatGedcomDate(elements.personSummaryBirthDatePicker.value);
    }
  });
  elements.personSummaryDeathDate.addEventListener('input', () => {
    elements.personSummaryDeathDatePicker.value = datePickerValue(elements.personSummaryDeathDate.value);
  });
  elements.personSummaryDeathDatePicker.addEventListener('change', () => {
    if (elements.personSummaryDeathDatePicker.value) {
      elements.personSummaryDeathDate.value = formatGedcomDate(elements.personSummaryDeathDatePicker.value);
    }
  });
  elements.personSummaryDialog.addEventListener('close', () => {
    state.pendingPersonSummaryId = null;
  });
  const lifeEvent = lifeEventFields();
  lifeEvent.type.addEventListener('change', () => {
    const config = lifeEventTypes.find((entry) => entry.key === lifeEvent.type.value) || lifeEventTypes[0];
    state.pendingLifeEvent.config = config;
    applyLifeEventConfig(config);
  });
  lifeEvent.spouse.addEventListener('change', syncNewSpouseFields);
  lifeEvent.date.addEventListener('input', () => { lifeEvent.picker.value = datePickerValue(lifeEvent.date.value); });
  lifeEvent.picker.addEventListener('change', () => {
    if (lifeEvent.picker.value) lifeEvent.date.value = formatGedcomDate(lifeEvent.picker.value);
  });
  document.querySelector('#lifeEventForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitLifeEvent();
  });
  lifeEvent.mediaAdd.addEventListener('click', () => lifeEvent.mediaInput.click());
  document.querySelector('#lifeEventLinkMedia').addEventListener('click', () => {
    const pending = state.pendingLifeEvent;
    const path = document.querySelector('#lifeEventExistingMedia').value;
    if (!pending || !availableLifeEventMedia(pending).includes(path)) {
      lifeEvent.error.textContent = 'Select media already attached to this person.';
      lifeEvent.error.hidden = false;
      return;
    }
    pending.linkedMedia.push(path);
    renderLifeEventMedia();
  });
  lifeEvent.mediaList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-remove-linked-media]');
    if (!button || !state.pendingLifeEvent) return;
    state.pendingLifeEvent.linkedMedia.splice(Number(button.dataset.removeLinkedMedia), 1);
    renderLifeEventMedia();
  });
  lifeEvent.sourceAdd.addEventListener('click', () => addLifeEventSourceRow().querySelector('select').focus());
  document.querySelector('#personDeleteContinue').addEventListener('click', () => {
    const plan = pendingPersonDelete;
    document.querySelector('#personDeleteDialog').close();
    if (!plan) return;
    pendingPersonDelete = plan;
    document.querySelector('#personDeleteConfirmName').textContent = plan.name;
    const saveNote = gedcomSaveTarget() === 'primary'
      ? 'The change is saved to the GEDCOM file straight away; the previous version is kept in Primary GEDCOM\\Backups.'
      : 'The change is saved to the GEDCOM file straight away.';
    document.querySelector('#personDeleteConfirmText').textContent =
      `${plan.name} and all of their links will be permanently removed from ${state.fileName}. This cannot be undone in Kinship Atlas. ${saveNote}`;
    const dialog = document.querySelector('#personDeleteConfirmDialog');
    dialog.showModal();
    dialog.querySelector('.dialog-button-quiet').focus();
  });
  document.querySelector('#confirmPersonDelete').addEventListener('click', () => {
    const plan = pendingPersonDelete;
    pendingPersonDelete = null;
    document.querySelector('#personDeleteConfirmDialog').close();
    if (!plan || !state.people.has(plan.personId)) return;
    // Re-plan in case the tree changed while the prompts were open.
    const current = planPersonDeletion(plan.personId);
    if (!current) return;
    const { removedLinks } = deletePersonRecord(current);
    const familyNote = current.removedFamilyIds.length
      ? ` ${current.removedFamilyIds.length} family record${current.removedFamilyIds.length === 1 ? ' was' : 's were'} removed.` : '';
    showToast(`${current.name} was deleted and ${removedLinks} link${removedLinks === 1 ? '' : 's'} to them removed.${familyNote}`);
  });
  document.querySelector('#personDeleteConfirmDialog').addEventListener('close', () => { pendingPersonDelete = null; });
  document.querySelector('#personDeleteDialog').addEventListener('close', () => {
    if (!document.querySelector('#personDeleteConfirmDialog').open) pendingPersonDelete = null;
  });
  document.querySelector('#eventMediaUnlink').addEventListener('click', () => {
    const pending = pendingEventMediaDelete;
    document.querySelector('#eventMediaRemoveDialog').close();
    if (!pending || pending.eventState !== state.pendingLifeEvent) return;
    const message = unlinkEventMedia(pending.path)
      ? `"${pending.name}" was delinked from this event. The file is still in the media folder.`
      : `"${pending.name}" could not be delinked. The event may have changed; close and reopen it.`;
    setLifeEventMediaNotice(message);
    showToast(message);
    lifeEvent.mediaAdd.focus();
  });
  document.querySelector('#eventMediaDeleteFile').addEventListener('click', () => {
    const pending = pendingEventMediaDelete;
    document.querySelector('#eventMediaRemoveDialog').close();
    if (!pending || pending.eventState !== state.pendingLifeEvent) return;
    const file = resolveMediaFile(pending.path);
    const usage = file ? mediaFileUsage(file) : { people: 0, familyEvents: 0 };
    const linkedTo = [
      usage.people && `${usage.people} ${usage.people === 1 ? 'person' : 'people'}`,
      usage.familyEvents && `${usage.familyEvents} family event${usage.familyEvents === 1 ? '' : 's'}`
    ].filter(Boolean).join(' and ');
    document.querySelector('#eventMediaDeleteConfirmName').textContent = pending.name;
    document.querySelector('#eventMediaDeleteConfirmText').textContent =
      `This file will be deleted from the media folder and cannot be recovered from Kinship Atlas.${linkedTo ? ` It is linked to ${linkedTo} in this tree; all of those links will be removed.` : ''}`;
    document.querySelector('#eventMediaDeleteConfirmDialog').showModal();
    document.querySelector('#eventMediaDeleteConfirmDialog .dialog-button-quiet').focus();
  });
  document.querySelector('#confirmEventMediaDelete').addEventListener('click', async () => {
    const pending = pendingEventMediaDelete;
    const confirmButton = document.querySelector('#confirmEventMediaDelete');
    if (!pending || pending.eventState !== state.pendingLifeEvent || confirmButton.disabled) return;
    confirmButton.disabled = true;
    try {
      const result = await deleteMediaFileEverywhere(pending.path, pending.eventState.personId);
      if (state.pendingLifeEvent === pending.eventState) pending.eventState.existingMedia = currentPendingEventMedia(pending.eventState);
      const message = `"${result.name}" was deleted from the media folder and ${result.removedLinks} link${result.removedLinks === 1 ? ' was' : 's were'} removed.`;
      setLifeEventMediaNotice(message);
      showToast(message);
    } catch (error) {
      const message = `"${pending.name}" could not be deleted. ${error?.message || ''}`.trim();
      setLifeEventMediaNotice(message);
      showToast(message);
    } finally {
      confirmButton.disabled = false;
      pendingEventMediaDelete = null;
      document.querySelector('#eventMediaDeleteConfirmDialog').close();
      if (lifeEvent.dialog.open) lifeEvent.mediaAdd.focus();
    }
  });
  document.querySelector('#confirmMediaLibraryDelete').addEventListener('click', async () => {
    const pending = pendingMediaLibraryDelete;
    const button = document.querySelector('#confirmMediaLibraryDelete');
    if (!pending || button.disabled) return;
    button.disabled = true;
    try {
      const result = await deleteMediaFileEverywhere(pending.path, pending.personId);
      state.mediaTypes.delete(pending.key);
      saveMediaTypes();
      if (state.mediaLibraryMode) renderMediaLibrary();
      showToast(`"${result.name}" was deleted and ${result.removedLinks} link${result.removedLinks === 1 ? ' was' : 's were'} removed.`);
    } catch (error) {
      showToast(`"${pending.name}" could not be deleted. ${error?.message || ''}`.trim());
    } finally {
      button.disabled = false;
      pendingMediaLibraryDelete = null;
      document.querySelector('#mediaLibraryDeleteDialog').close();
    }
  });
  document.querySelector('#mediaLibraryDeleteDialog').addEventListener('close', () => {
    if (!document.querySelector('#confirmMediaLibraryDelete').disabled) pendingMediaLibraryDelete = null;
  });
  // The close event is queued, so when "Delete the file permanently" was chosen the confirm prompt is already open.
  for (const id of ['eventMediaRemoveDialog', 'eventMediaDeleteConfirmDialog']) {
    const promptDialog = document.querySelector(`#${id}`);
    // Handled here because Chrome can otherwise close the life event dialog underneath, or neither.
    promptDialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!document.querySelector('#confirmEventMediaDelete').disabled) promptDialog.close();
    });
  }
  document.querySelector('#eventMediaRemoveDialog').addEventListener('close', () => {
    if (!document.querySelector('#eventMediaDeleteConfirmDialog').open) pendingEventMediaDelete = null;
  });
  document.querySelector('#eventMediaDeleteConfirmDialog').addEventListener('close', () => {
    if (!document.querySelector('#confirmEventMediaDelete').disabled) pendingEventMediaDelete = null;
  });
  lifeEvent.mediaInput.addEventListener('change', () => {
    addLifeEventMediaFiles([...(lifeEvent.mediaInput.files || [])]);
    lifeEvent.mediaInput.value = '';
  });
  lifeEvent.mediaList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('button[data-delete-event-media]');
    if (deleteButton && state.pendingLifeEvent) {
      openEventMediaRemoveDialog(state.pendingLifeEvent.existingMedia[Number(deleteButton.dataset.deleteEventMedia)]);
      return;
    }
    const removeButton = event.target.closest('button[data-remove-new-media]');
    if (!removeButton || !state.pendingLifeEvent) return;
    state.pendingLifeEvent.newMedia.splice(Number(removeButton.dataset.removeNewMedia), 1);
    renderLifeEventMedia();
    lifeEvent.mediaAdd.focus();
  });
  lifeEvent.remove.addEventListener('click', () => {
    if (lifeEvent.remove.dataset.confirm !== 'true') {
      lifeEvent.remove.dataset.confirm = 'true';
      lifeEvent.remove.textContent = 'Click again to confirm delete';
      return;
    }
    saveLifeEvent(true);
  });
  lifeEvent.dialog.addEventListener('close', () => {
    state.pendingLifeEvent = null;
    pendingEventMediaDelete = null;
    releaseLifeEventPreviewUrls();
    lifeEvent.mediaList.replaceChildren();
    delete lifeEvent.remove.dataset.confirm;
  });
  elements.details.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest?.('.event-media a, .event-media button')) return;
    const eventItem = event.target.closest?.('.event-item[data-event-ordinal], .event-item[data-family-id]');
    if (!eventItem) return;
    event.preventDefault();
    eventItem.click();
  });
  elements.personEditorDialog.addEventListener('close', () => {
    state.pendingEditPersonId = null;
  });
  elements.addRelativeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!createRelativeRecord() && document.querySelector('#relativeDuplicateWarning').hidden
      && document.querySelector('#relativeError').hidden) {
      showToast('Enter a given name and ensure a person record is selected.');
    }
  });
  elements.relativeType.addEventListener('change', () => {
    elements.relativeParentRoleField.hidden = elements.relativeType.value !== 'PARENT';
    syncRelativeEntryMode();
  });
  document.querySelector('#relativeMode').addEventListener('change', syncRelativeEntryMode);
  elements.relativeParentRole.addEventListener('change', syncRelativeEntryMode);
  document.querySelector('#relativeSearch').addEventListener('input', syncExistingRelativeChoices);
  document.querySelector('#relationshipForm').addEventListener('submit', (event) => {
    event.preventDefault();
    saveRelationship();
  });
  document.querySelector('#relationshipDelete').addEventListener('click', () => {
    const pending = state.pendingRelationship;
    if (!pending) return;
    const parts = relationshipDialogParts();
    if (!pending.deleteArmed) {
      pending.deleteArmed = true;
      parts.deleteButton.textContent = 'Confirm delete';
      parts.deleteWarning.textContent = pending.kind === 'PARTNER'
        ? 'This removes the partnership link. If the couple have children, they stay linked to their other parent. No people or media are deleted.'
        : 'This removes only the link between these two people. No people or media are deleted.';
      parts.deleteWarning.hidden = false;
      return;
    }
    deleteRelationship();
  });
  document.querySelector('#relationshipDialog').addEventListener('close', () => {
    state.pendingRelationship = null;
  });
  elements.researchConsent.addEventListener('change', () => {
    elements.confirmWikiTreeSearch.disabled = !elements.researchConsent.checked;
  });
  elements.confirmWikiTreeSearch.addEventListener('click', searchWikiTree);
  elements.researchDialog.addEventListener('close', () => {
    state.pendingResearchPersonId = null;
  });
  elements.back.addEventListener('click', () => {
    if (state.historyIndex > 0) { state.historyIndex -= 1; state.selectedId = state.history[state.historyIndex]; render(); }
    elements.back.disabled = state.historyIndex <= 0; elements.forward.disabled = false;
  });
  elements.forward.addEventListener('click', () => {
    if (state.historyIndex < state.history.length - 1) { state.historyIndex += 1; state.selectedId = state.history[state.historyIndex]; render(); }
    elements.forward.disabled = state.historyIndex >= state.history.length - 1; elements.back.disabled = false;
  });
  elements.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.1));
  elements.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.1));
  elements.printMapButton.addEventListener('click', () => printSection('map'));

  // A4 landscape with 12 mm margins leaves about 273 x 186 mm, i.e. roughly 1030 x 700 CSS px.
  const printPageWidth = 1030;
  const printPageHeight = 700;
  const mmToPx = 96 / 25.4;
  let printCleanup = null;

  // Measure the map heading, summary line and print footer at print width so the map gets only the height left on one page.
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
    elements.printFooter.textContent = `${kind === 'map' ? 'Relationship map' : 'Person record'} · ${person.name} · ${state.fileName} · Printed ${printedOn} from Kinship Atlas · Private family research; may include living people.`;
    document.body.classList.add(kind === 'map' ? 'print-map' : 'print-person');
    setPrintPageOrientation(kind === 'map' ? 'landscape' : null);
    const restoreMap = kind === 'map' ? preparePrintMap() : null;
    printCleanup = () => {
      printCleanup = null;
      window.removeEventListener('afterprint', printCleanup);
      document.body.classList.remove('print-map', 'print-person');
      setPrintPageOrientation(null);
      elements.printFooter.textContent = '';
      if (restoreMap) restoreMap();
    };
    window.addEventListener('afterprint', printCleanup);
    window.print();
  }

  function setZoom(value) {
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

  new ResizeObserver(() => requestAnimationFrame(redrawGraphConnectors)).observe(elements.viewport);
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

  async function toggleHomePerson(personId) {
    const record = state.defaultRecord;
    const person = state.people.get(personId);
    if (!record || !person) return;
    const clearing = record.homePersonId === personId;
    const updated = { ...record, homePersonId: clearing ? '' : personId, homePersonName: clearing ? '' : person.name };
    state.defaultsDraft = { configHandle: record.configHandle || null };
    try {
      await writeDefaultRecord(updated);
    } catch {
      showToast('This browser could not remember the home person.');
      return;
    }
    state.defaultRecord = updated;
    try {
      const wrote = await writeDefaultsFile(updated, false);
      if (!wrote) showToast(clearing ? 'Home person cleared (saved in this browser only).' : `${person.name} is now the home person (saved in this browser only; use Update defaults to also update kinship-defaults.json).`);
      else showToast(clearing ? 'Home person cleared.' : `${person.name} will be selected when the default GEDCOM opens.`);
    } catch {
      showToast('Home person saved in this browser; kinship-defaults.json could not be updated.');
    }
    renderDetails();
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
    if (!await syncSelectionsToHelper()) {
      exitButton.disabled = false;
      setButtonContent(exitButton, 'exit', 'Exit Kinship Atlas');
      return;
    }
    window.clearInterval(mediaHeartbeat);
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
  // Keeps Kinship Atlas.exe's local server alive while this tab is open.
  const mediaHeartbeat = window.setInterval(() => { if (state.mediaHelper) fetch('/api/media-info', { cache: 'no-store' }).catch(() => {}); }, 30000);
  // Syncing once at startup captures selections made before this feature (or while the helper was down).
  probeMediaHelper().then(loadHelperSelections).then(restoreActiveSession).then(applyDefaultOnStartup).then(syncSelectionsToHelper).then(loadHelperMedia);
})();
