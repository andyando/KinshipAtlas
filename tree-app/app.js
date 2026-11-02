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
    ['turkiye', 'TR', 'Turkiye'], ['turkey', 'TR', 'Turkey']
  ].sort((a, b) => b[0].length - a[0].length);
  const state = {
    mapMode: false, mapStats: null, directoryMatches: [],
    people: new Map(), families: new Map(), sources: new Map(), selectedId: null,
    fileName: '', searchText: '', history: [], historyIndex: -1, zoom: 1,
    mediaIndex: null, mediaUrls: new Map(), mediaRelativePaths: new WeakMap(), mediaDirectoryHandle: null,
    rememberedMediaDirectoryHandle: null, mediaFolderPicked: false, mediaHelper: null,
    pendingUploadPersonId: null, pendingResearchPersonId: null,
    pendingPersonSummaryId: null,
    pendingLifeEvent: null,
    primaryMediaKey: '', primaryMedia: new Map(), additionalMedia: new Map(), primaryPersonId: '',
    gedcomRecords: [], gedcomDirty: false, gedcomText: '', sessionSaveQueue: Promise.resolve(),
    directoryFilters: { birthCountry: '', deathCountry: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null },
    directoryYearBounds: { birth: null, death: null },
    expandedSurnames: new Set(), surnameFilter: new Set()
  };
  const elements = {
    fileInput: document.querySelector('#gedcomInput'), mediaInput: document.querySelector('#mediaInput'),
    mediaUploadInput: document.querySelector('#mediaUploadInput'), mediaButton: document.querySelector('#mediaButton'),
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
    treeLabel: document.querySelector('#treeLabel'), peopleCount: document.querySelector('#peopleCount'),
    visibleCount: document.querySelector('#visibleCount'), clearSurnameFilter: document.querySelector('#clearSurnameFilter'),
    search: document.querySelector('#peopleSearch'), peopleList: document.querySelector('#peopleList'),
    birthCountryFilter: document.querySelector('#birthCountryFilter'),
    deathCountryFilter: document.querySelector('#deathCountryFilter'),
    birthYearMin: document.querySelector('#birthYearMin'), birthYearMax: document.querySelector('#birthYearMax'),
    deathYearMin: document.querySelector('#deathYearMin'), deathYearMax: document.querySelector('#deathYearMax'),
    birthYearLabel: document.querySelector('#birthYearLabel'), deathYearLabel: document.querySelector('#deathYearLabel'),
    loadStatus: document.querySelector('#loadStatus'), statusPip: document.querySelector('.status-pip'),
    title: document.querySelector('#focusTitle'), subtitle: document.querySelector('#focusSubtitle'),
    generationLabel: document.querySelector('#generationLabel'), graphSummary: document.querySelector('#graphSummary'),
    canvas: document.querySelector('#treeCanvas'), viewport: document.querySelector('#graphViewport'),
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
  let wikiTreeSearchAbort = null;

  function splitXref(value) {
    return value ? value.replace(/^@|@$/g, '') : '';
  }

  function normalizeDirectoryName(value) {
    return String(value || '').toLocaleLowerCase();
  }

  function createEvent(type, value = '') {
    return { type, value: cleanEventDisplayText(value), date: '', place: '', detail: '', notes: [], sources: [], ordinal: -1 };
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
    let record = null;
    let activeEvent = null;
    let activeName = null;

    function finishRecord() {
      if (!record) return;
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
        if (level === 1 && tag !== 'NAME') activeName = null;
        if (level === 1 && eventTags.has(tag)) {
          activeEvent = createEvent(tag, value);
          activeEvent.ordinal = record.events.length;
          record.events.push(activeEvent);
          continue;
        }
        if (level === 1 && tag === 'OCCU') {
          activeEvent = createEvent('OCCU', value);
          activeEvent.ordinal = record.events.length;
          record.events.push(activeEvent);
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
        if (tag === 'FILE' && level >= 2) { record.mediaPaths.push(value.trim()); continue; }
        if (tag === 'SOUR') {
          const sourceId = splitXref(value);
          if (sourceId) {
            record.sourceIds.push(sourceId);
            if (activeEvent) activeEvent.sources.push(sourceId);
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
        if (level === 1 && tag === 'MARR') {
          record.marriage = createEvent('MARR');
          activeEvent = record.marriage;
          continue;
        }
        if (level === 1 && tag === 'DIV') {
          record.divorce = createEvent('DIV');
          activeEvent = record.divorce;
          continue;
        }
        if (level === 1 && tag === 'HUSB') { record.husbandId = splitXref(value); activeEvent = null; continue; }
        if (level === 1 && tag === 'WIFE') { record.wifeId = splitXref(value); activeEvent = null; continue; }
        if (level === 1 && tag === 'CHIL') { record.childIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag !== 'SOUR' && tag !== 'NOTE') activeEvent = null;
        if (tag === 'SOUR') { const sourceId = splitXref(value); if (sourceId) record.sourceIds.push(sourceId); continue; }
        if (activeEvent && level >= 2) {
          if (tag === 'DATE') activeEvent.date = cleanEventDisplayText(value);
          else if (tag === 'PLAC') activeEvent.place = cleanEventDisplayText(value);
          else if (tag === 'TYPE' && level === 2 && activeEvent === record.marriage) activeEvent.detail = cleanEventDisplayText(value);
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(cleanEventDisplayText(value));
          else if (tag === 'SOUR') activeEvent.sources.push(splitXref(value));
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
    const parents = parentsOf(person.id).map((id) => state.people.get(id));
    const father = parents.find((parent) => parent.sex === 'M');
    const mother = parents.find((parent) => parent.sex === 'F');
    return {
      firstName: firstName.slice(0, 120),
      lastName: surname.slice(0, 120),
      birthYear: yearFrom(birth?.date),
      deathYear: yearFrom(death?.date),
      birthCountry: countryFlagForPlace(birth?.place)?.country || '',
      deathCountry: countryFlagForPlace(death?.place)?.country || '',
      sex: person.sex === 'M' ? 'Male' : person.sex === 'F' ? 'Female' : '',
      fatherFirstName: (father?.givenName || '').trim().slice(0, 120),
      fatherLastName: (father?.surname || '').trim().slice(0, 120),
      motherFirstName: (mother?.givenName || '').trim().slice(0, 120),
      motherLastName: (mother?.maidenName || mother?.surname || '').trim().slice(0, 120)
    };
  }

  function renderWikiTreeQueryPreview(query) {
    const fields = [
      ['First name', query.firstName],
      ['Last name', query.lastName],
      ['Year born', query.birthYear],
      ['Year died', query.deathYear],
      ['Country born', query.birthCountry],
      ['Country died', query.deathCountry],
      ['Sex at birth', query.sex],
      ['Father first name', query.fatherFirstName],
      ['Father last name', query.fatherLastName],
      ['Mother first name', query.motherFirstName],
      ['Mother last name', query.motherLastName]
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

  function wikiTreeSearchParameters(query) {
    const parameters = new URLSearchParams();
    if (query.firstName) parameters.set('FirstName', query.firstName);
    if (query.lastName) parameters.set('LastName', query.lastName);
    if (query.birthYear) parameters.set('BirthDate', query.birthYear);
    if (query.deathYear) parameters.set('DeathDate', query.deathYear);
    if (query.birthCountry) parameters.set('BirthLocation', query.birthCountry);
    if (query.deathCountry) parameters.set('DeathLocation', query.deathCountry);
    if (query.sex) parameters.set('Gender', query.sex);
    if (query.fatherFirstName) parameters.set('FatherFirstName', query.fatherFirstName);
    if (query.fatherLastName) parameters.set('FatherLastName', query.fatherLastName);
    if (query.motherFirstName) parameters.set('MotherFirstName', query.motherFirstName);
    if (query.motherLastName) parameters.set('MotherLastName', query.motherLastName);
    return parameters;
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
      ['birth_location', query.birthCountry],
      ['death_location', query.deathCountry],
      ['father_first_name', query.fatherFirstName],
      ['father_last_name', query.fatherLastName],
      ['mother_first_name', query.motherFirstName],
      ['mother_last_name', query.motherLastName],
      ['gender', query.sex]
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

  async function readWikiTreeResponse(response) {
    const maximumResponseLength = 256 * 1024;
    if (!response.body?.getReader) {
      const text = await response.text();
      if (text.length > maximumResponseLength) throw new Error('WikiTree returned an unexpectedly large response.');
      return JSON.parse(text);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > maximumResponseLength) {
        await reader.cancel();
        throw new Error('WikiTree returned an unexpectedly large response.');
      }
    }
    text += decoder.decode();
    return JSON.parse(text);
  }

  function extractWikiTreePeople(payload) {
    const entries = Array.isArray(payload) ? payload : [payload];
    const failures = entries.filter((entry) => entry?.status && entry.status !== 'OK');
    if (failures.length) throw new Error('WikiTree reported that the search could not be completed.');
    const hasPeopleList = entries.some((entry) => Array.isArray(entry?.people));
    if (!hasPeopleList) throw new Error('WikiTree returned an unexpected response.');
    return entries.flatMap((entry) => Array.isArray(entry.people) ? entry.people : []);
  }

  function renderWikiTreeResults(people, query) {
    const deceasedMatches = people
      .filter((person) => typeof person?.Name === 'string' && person.Name.trim() && (person.DeathDate || person.DeathYear))
      .slice(0, 20);
    elements.wikiTreeResults.replaceChildren();
    elements.wikiTreeResults.hidden = false;
    const heading = document.createElement('p');
    heading.className = 'wikitree-results-heading';
    heading.textContent = deceasedMatches.length
      ? `${deceasedMatches.length} deceased ${deceasedMatches.length === 1 ? 'match' : 'matches'}`
      : 'No deceased matches were returned.';
    elements.wikiTreeResults.append(heading);

    if (deceasedMatches.length) {
      const list = document.createElement('ul');
      list.className = 'wikitree-match-list';
      for (const person of deceasedMatches) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'wikitree-match';
        link.href = `https://www.wikitree.com/wiki/${encodeURIComponent(person.Name)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const name = document.createElement('strong');
        name.textContent = person.FirstName && person.LastName
          ? `${person.FirstName} ${person.LastName}`
          : person.Name;
        const profileId = document.createElement('span');
        profileId.className = 'wikitree-match-id';
        profileId.textContent = person.Name;
        const life = document.createElement('span');
        life.className = 'wikitree-match-life';
        life.textContent = [
          person.BirthDate || person.BirthYear ? `b. ${person.BirthDate || person.BirthYear}` : '',
          person.DeathDate || person.DeathYear ? `d. ${person.DeathDate || person.DeathYear}` : ''
        ].filter(Boolean).join(' · ');
        link.append(name, profileId, life);
        item.append(link);
        list.append(item);
      }
      elements.wikiTreeResults.append(list);
    }
    renderWikiTreeFallback(query);
  }

  async function searchWikiTree() {
    const person = state.people.get(state.pendingResearchPersonId);
    if (!elements.researchConsent.checked || !isRecordedDeceased(person) || wikiTreeSearchAbort) return;

    const query = buildWikiTreeQuery(person);
    if (window.location.protocol === 'file:') {
      elements.wikiTreeResults.replaceChildren();
      elements.wikiTreeResults.hidden = false;
      renderWikiTreeFallback(query);
      setWikiTreeSearchStatus('Opening WikiTree in a new tab. If it does not open, use the link below.');
      submitWikiTreeSearch(query);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    wikiTreeSearchAbort = controller;
    elements.confirmWikiTreeSearch.disabled = true;
    elements.wikiTreeResults.replaceChildren();
    elements.wikiTreeResults.hidden = true;
    setWikiTreeSearchStatus('Searching WikiTree…');
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);

    try {
      const parameters = new URLSearchParams({
        action: 'searchPerson',
        Query: wikiTreeSearchParameters(query).toString(),
        Fields: 'Id,Name,FirstName,LastName,BirthDate,DeathDate',
        Limit: '20'
      });
      const response = await fetch('https://api.wikitree.com/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: parameters,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`WikiTree returned HTTP ${response.status}.`);
      const payload = await readWikiTreeResponse(response);
      if (wikiTreeSearchAbort !== controller) return;
      renderWikiTreeResults(extractWikiTreePeople(payload), query);
      setWikiTreeSearchStatus('');
    } catch (error) {
      if (wikiTreeSearchAbort !== controller || (controller.signal.aborted && !timedOut)) return;
      setWikiTreeSearchStatus(timedOut
        ? 'WikiTree did not respond in time. You can open the same search directly on WikiTree.'
        : `The WikiTree API could not complete this search${error instanceof Error ? `: ${error.message}` : '.'}`);
      elements.wikiTreeResults.replaceChildren();
      elements.wikiTreeResults.hidden = false;
      renderWikiTreeFallback(query);
    } finally {
      clearTimeout(timeout);
      if (wikiTreeSearchAbort === controller) {
        wikiTreeSearchAbort = null;
        elements.confirmWikiTreeSearch.disabled = !elements.researchConsent.checked;
      }
    }
  }

  function countryFlagForPlace(place) {
    const normalized = ` ${String(place || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const match = countryFlagAliases.find(([alias]) => normalized.includes(` ${alias} `));
    if (!match) return null;
    const [, code, country] = match;
    return { code: code.toLocaleLowerCase(), country };
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

  function loadPrimaryMedia(storageKey, people) {
    const primaryMedia = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const [personId, path] of Object.entries(saved)) {
        if (typeof path === 'string' && people.get(personId)?.mediaPaths.includes(path)) primaryMedia.set(personId, path);
      }
    } catch { }
    return primaryMedia;
  }

  function savePrimaryMedia() {
    if (!state.primaryMediaKey) return false;
    try {
      localStorage.setItem(state.primaryMediaKey, JSON.stringify(Object.fromEntries(state.primaryMedia)));
      return true;
    } catch {
      return false;
    }
  }

  function loadAdditionalMedia(storageKey, people) {
    const additionalMedia = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}:additional-media:v1`) || '{}');
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
    try {
      localStorage.setItem(`${state.primaryMediaKey}:additional-media:v1`, JSON.stringify(Object.fromEntries(state.additionalMedia)));
      return true;
    } catch {
      return false;
    }
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
    elements.mediaButton.textContent = helperDefault ? `Default media: ${state.mediaHelper.folder}` : hasFolder ? 'Update Media Folder' : 'Select Media Folder';
    elements.mediaButton.title = helperDefault ? 'Photos and PDFs are saved to this folder inside Primary Media Library. Click to choose a different folder.' : '';
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
      state.mediaHelper = info?.available ? { folder: info.folder } : null;
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
        addFileToMediaIndex(new File([blob], name, { type: blob.type }), name);
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

  async function saveUploadedMedia(files) {
    const person = state.people.get(state.pendingUploadPersonId);
    const directoryHandle = state.mediaDirectoryHandle;
    const mode = mediaSaveMode();
    state.pendingUploadPersonId = null;
    elements.mediaUploadInput.value = '';
    if (!person || mode === 'none' || mode === 'unsupported') return;

    let savedCount = 0;
    let failedCount = 0;
    for (const file of files) {
      if (!isImageFile(file) && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        failedCount += 1;
        continue;
      }
      try {
        let fileName;
        if (mode === 'folder') {
          fileName = await uniqueMediaFileName(directoryHandle, file.name);
          const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(file);
          await writable.close();
          addFileToMediaIndex(await fileHandle.getFile(), fileName);
        } else {
          fileName = await uploadToMediaHelper(file);
          addFileToMediaIndex(new File([file], fileName, { type: file.type }), fileName);
        }
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
      render();
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
    for (const path of person.mediaPaths) {
      const file = resolveMediaFile(path);
      if (file && isImageFile(file)) return { path, file };
    }
    return null;
  }

  let pendingUnlink = null;

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
      const entered = window.prompt(`The full location of "${folderName}" isn't recorded in this GEDCOM and browsers can't read it. Enter the folder path once (for example G:\\Family\\${folderName}); it is remembered. Shift+click the folder button to change it.`, saved);
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
      for (let index = 1; index < personRecord.lines.length; index += 1) {
        const field = parseGedcomField(personRecord.lines[index]);
        if (field?.tag !== 'FILE' || normalizeMediaPath(field.value) !== normalizeMediaPath(path)) continue;
        let end = index + 1;
        while (end < personRecord.lines.length) {
          const descendant = parseGedcomField(personRecord.lines[end]);
          if (descendant && descendant.level <= field.level) break;
          end += 1;
        }
        personRecord.lines.splice(index, end - index);
        index -= 1;
        recordChanged = true;
      }
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
    state.primaryMediaKey = storageKey;
    state.additionalMedia = loadAdditionalMedia(storageKey, state.people);
    state.primaryMedia = loadPrimaryMedia(storageKey, state.people);
    state.fileName = fileName;
    loadPrimaryPerson();
    state.searchText = '';
    state.history = [];
    state.historyIndex = -1;
    elements.search.value = '';
    elements.search.disabled = false;
    elements.clear.disabled = false;
    elements.mapViewButton.disabled = false;
    elements.printMapButton.disabled = false;
    document.querySelector('#openGedcomLabel').hidden = true;
    state.zoom = 1;
    elements.zoomIn.disabled = false;
    elements.zoomOut.disabled = false;
    elements.zoomLabel.textContent = '100%';
    elements.treeLabel.textContent = fileName;
    elements.peopleCount.textContent = state.people.size.toLocaleString();
    elements.loadStatus.textContent = 'TREE LOADED LOCALLY';
    elements.statusPip.classList.add('ready');
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
      const file = new File([session.gedcomText], session.fileName, { type: 'text/plain' });
      const parsed = parseGedcom(session.gedcomText);
      const storageKey = await primaryMediaStorageKey(file, session.gedcomText);
      setLoaded(session.fileName, parsed, storageKey, session.gedcomText);
      state.gedcomDirty = Boolean(session.gedcomDirty);
      if (state.gedcomDirty) elements.loadStatus.textContent = 'UNSAVED CHANGES';
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
      image.src = `flags/4x3/${birthCountry.code}.svg`;
      image.alt = `Birth country: ${birthCountry.country}`;
      flag.title = birthCountry.country;
      flag.append(image);
      nameLine.append(flag);
    }
    const years = document.createElement('span');
    years.className = 'card-years';
    years.textContent = [lifespan(person), birthPlace].filter(Boolean).join(' · ');
    button.append(relationLabel, nameLine, years);
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

  function appendGeneration(canvas, label, generation, people, relation = '', navigation = {}) {
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
    for (const person of people) addPersonControl(nodes, person.id, relation || '', navigation);
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
    const ancestors = generationLevels(selected.id, 'up', 2);
    const descendants = generationLevels(selected.id, 'down', 2);
    const partners = partnersOf(selected.id).map((item) => item.id);
    const allIds = new Set([selected.id, ...partners]);
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
    const rowZero = nameOrder(new Set([selected.id, ...partners]));
    const parentsRow = orderByRelatives(ancestorIds(-1), [selected], parentsOf);
    const grandparentsRow = orderByRelatives(ancestorIds(-2), parentsRow, parentsOf);
    const childrenRow = orderByRelatives(descendantIds(1), rowZero, childrenOf);
    const grandchildrenRow = orderByRelatives(descendantIds(2), childrenRow, childrenOf);
    const rows = [
      { generation: -2, label: 'Grandparents', people: grandparentsRow },
      { generation: -1, label: 'Parents', people: parentsRow },
      { generation: 0, label: 'Selected person & partners', people: rowZero },
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
      appendGeneration(elements.canvas, row.label, row.generation, row.people, '', {
        up: row.generation === topGeneration,
        down: row.generation === bottomGeneration
      });
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

    for (const family of state.families.values()) {
      for (const generation of [-2, -1, 0, 1]) {
        const parentPoints = [family.husbandId, family.wifeId].filter(Boolean)
          .filter((parentId) => nodeKeys.has(`${generation}|${parentId}`))
          .map((parentId) => point(cardFor(generation, parentId), 'bottom'))
          .filter(Boolean);
        if (!parentPoints.length) continue;
        // One line from the couple's midpoint when both parents are shown.
        const origin = {
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
      state.directoryFilters = { birthCountry: '', deathCountry: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null };
      state.expandedSurnames.clear();
      state.surnameFilter.clear();
      elements.birthCountryFilter.value = '';
      elements.deathCountryFilter.value = '';
    }
    populateCountryFilter(elements.birthCountryFilter, 'BIRT');
    populateCountryFilter(elements.deathCountryFilter, 'DEAT');
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
      const saved = JSON.parse(localStorage.getItem(primaryPersonStorageKey()) || 'null');
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

  function togglePrimaryPerson(personId) {
    const person = state.people.get(personId);
    if (!person) return;
    const clearing = state.primaryPersonId === personId;
    state.primaryPersonId = clearing ? '' : personId;
    let saved = true;
    try {
      const key = primaryPersonStorageKey();
      if (clearing) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ id: person.id, name: person.name }));
    } catch {
      saved = false;
    }
    syncPrimaryPersonBar();
    renderDetails();
    const suffix = saved ? '' : ' This browser could not remember it after closing.';
    showToast(clearing ? `Primary person cleared.${suffix}` : `${person.name} is now the primary person.${suffix}`);
  }

  let lastDetailsPersonId = null;

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
    const monogram = document.createElement('div'); monogram.className = 'detail-monogram'; monogram.textContent = initials(person.name);
    const kicker = document.createElement('div'); kicker.className = 'eyebrow'; kicker.textContent = person.sex ? `PERSON RECORD · ${person.sex}` : 'PERSON RECORD';
    const title = document.createElement('h2'); title.textContent = person.name;
    const life = document.createElement('p'); life.className = 'detail-life'; life.textContent = lifespan(person);
    const id = document.createElement('span'); id.className = 'detail-id'; id.textContent = `GEDCOM @${person.id}@`;
    hero.append(monogram, kicker, title, life, id);
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
      : state.primaryPersonId ? `Replace ${personName(state.primaryPersonId)} as the primary person` : 'Show relationships to this person and add a Home button';
    personActions.append(primaryPersonButton);
    const printButton = iconButton('print', 'Print record');
    printButton.dataset.printPerson = person.id;
    printButton.title = 'Print this person record on A4 (attached media is left out)';
    personActions.append(printButton);
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
    let missing = 0;
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
        const unlinkButton = makeButton('🗑', 'media-remove-button');
        unlinkButton.dataset.personId = person.id;
        unlinkButton.dataset.unlinkMedia = path;
        unlinkButton.setAttribute('aria-label', 'Unlink media from this person; file will remain in the media folder');
        unlinkButton.title = 'Unlink from person (file remains in folder)';
        item.append(link, unlinkButton);
        item.hidden = mediaItems.length >= 4;
        mediaItems.push(item);
        grid.append(item);
      }
    }
    if (mediaItems.length > 4) {
      const showMoreButton = makeButton('Show more', 'media-show-more');
      showMoreButton.setAttribute('aria-expanded', 'false');
      showMoreButton.addEventListener('click', () => {
        const expanded = showMoreButton.getAttribute('aria-expanded') !== 'true';
        mediaItems.slice(4).forEach((item) => { item.hidden = !expanded; });
        showMoreButton.setAttribute('aria-expanded', String(expanded));
        showMoreButton.textContent = expanded ? 'Show less' : 'Show more';
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

  function render() {
    const person = state.people.get(state.selectedId);
    if (!person) return;
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
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6M16 11h6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    targetClear: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
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
    remove: document.querySelector('#lifeEventDelete')
  });

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
    state.pendingLifeEvent = { personId: person.id, ordinal: editing ? event.ordinal : null, familyId: event?.familyId || null, original: null };
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
    fields.dialog.showModal();
  }

  function saveMarriage(deleteEvent, config) {
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
      return lines;
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
        if (marriageType !== original.marriageType) setLifeEventSubfield(lines, start, 'TYPE', marriageType);
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
          refreshAfterGedcomMutation(pending.personId);
          fields.dialog.close();
          showToast(`${config.label} added to the existing family record.`);
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
    refreshAfterGedcomMutation(pending.personId);
    fields.dialog.close();
    showToast(deleteEvent ? `${config.label} removed from the family record.` : pending.familyId ? `${config.label} updated.` : `${config.label} added.`);
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

  function saveLifeEvent(deleteEvent = false) {
    const pending = state.pendingLifeEvent;
    const fields = lifeEventFields();
    const personRecord = state.gedcomRecords.find((record) => record.tag === 'INDI' && record.xref === pending?.personId);
    const showError = (message) => { fields.error.textContent = message; fields.error.hidden = false; return false; };
    if (!personRecord) return showError('This person record could not be found in the current GEDCOM.');
    const clean = (text) => text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const config = pending.ordinal === null
      ? lifeEventTypes.find((entry) => entry.key === fields.type.value) || lifeEventTypes[0]
      : pending.config;
    if (config.family) return saveMarriage(deleteEvent, config);
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
      lines.push(...eventLines);
    } else {
      if (config.custom && !customType) return showError('Enter a name for this event, such as Census or Probate.');
      const start = findLifeEventStart(lines, pending.ordinal);
      if (start < 0) return showError('This event could not be found in the GEDCOM.');
      const original = pending.original;
      // Only changed fields are written so sources, notes and other sub-records are preserved.
      if (config.mode === 'value' && description !== original.desc) {
        lines[start] = `1 ${parseGedcomField(lines[start]).tag}${description ? ` ${description}` : ''}`;
      }
      if (config.custom && customType !== original.custom) setLifeEventSubfield(lines, start, 'TYPE', customType);
      if (date !== original.date) setLifeEventSubfield(lines, start, 'DATE', date);
      if (place !== original.place) setLifeEventSubfield(lines, start, 'PLAC', place);
      if (config.mode === 'note' && description !== original.desc) setLifeEventNote(lines, start, description);
    }
    personRecord.lines = lines;
    refreshAfterGedcomMutation(pending.personId);
    fields.dialog.close();
    showToast(deleteEvent ? 'Life event deleted.' : pending.ordinal === null ? 'Life event added.' : 'Life event updated.');
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

  function refreshAfterGedcomMutation(personId) {
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
      if (!state.people.get(id)?.mediaPaths.includes(state.primaryMedia.get(id))) state.primaryMedia.delete(id);
    }
    elements.peopleCount.textContent = state.people.size.toLocaleString();
    state.history = [];
    state.historyIndex = -1;
    markGedcomDirty();
    setFocus(state.people.has(personId) ? personId : state.people.keys().next().value, true);
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

  function createRelativeRecord() {
    const selected = state.people.get(state.selectedId);
    if (!selected) return false;
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
    const birthDate = formatGedcomDate(document.querySelector('#relativeBirthDate').value);
    const birthPlace = cleanGedcomValue(document.querySelector('#relativeBirthPlace').value);
    const deathDate = formatGedcomDate(document.querySelector('#relativeDeathDate').value);
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

  async function loadGedcomFile(file) {
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
      await persistActiveSession();
      showToast(`Loaded ${parsed.people.size.toLocaleString()} individuals. The data remains in this tab.`);
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
    const birthDate = formatGedcomDate(document.querySelector('#newGedcomBirthDate').value);
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
    if (state.mapMode) setMapMode(false);
    elements.mapViewButton.disabled = true;
    releaseMediaUrls(); state.mediaIndex = null; state.mediaFolderPicked = false;
    state.mediaRelativePaths = new WeakMap(); state.mediaDirectoryHandle = null; state.pendingUploadPersonId = null;
    syncMediaButton();
    state.primaryMediaKey = ''; state.primaryMedia.clear();
    state.additionalMedia.clear();
    state.gedcomRecords = [];     state.gedcomDirty = false;
    state.people.clear(); state.families.clear(); state.sources.clear(); state.selectedId = null;
    state.primaryPersonId = ''; syncPrimaryPersonBar();
    refreshDirectoryFilters(true);
    state.fileName = ''; state.gedcomText = ''; state.history = []; state.historyIndex = -1; state.searchText = '';
    state.rememberedMediaDirectoryHandle = null;
    elements.fileInput.value = ''; elements.mediaInput.value = ''; elements.mediaButton.disabled = true; elements.search.value = ''; elements.search.disabled = true;
    document.querySelector('#openGedcomLabel').hidden = false;
    elements.clear.disabled = true; elements.back.disabled = true; elements.forward.disabled = true;
    elements.printMapButton.disabled = true;
    elements.zoomIn.disabled = true; elements.zoomOut.disabled = true;
    elements.treeLabel.textContent = 'No tree loaded'; elements.peopleCount.textContent = '0';
    elements.loadStatus.textContent = 'WAITING FOR FILE'; elements.statusPip.classList.remove('ready');
    elements.canvas.innerHTML = '<div class="welcome-state"><div class="welcome-art" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="welcome-node node-a"></span><span class="welcome-node node-b"></span><span class="welcome-node node-c"></span><span class="welcome-node node-d"></span><span class="welcome-node node-e"></span><span class="welcome-stem stem-a"></span><span class="welcome-stem stem-b"></span><span class="welcome-stem stem-c"></span><span class="welcome-stem stem-d"></span></div><div class="eyebrow">YOUR ARCHIVE, CONNECTED</div><h2>Start with a person.</h2><p>Choose a local GEDCOM file to open its family relationships in this tab.</p><label class="button button-primary welcome-button" for="gedcomInput"><span class="button-plus" aria-hidden="true">+</span> Open GEDCOM</label><span class="welcome-note">Your file is read locally and is not uploaded or saved by this app.</span></div>';
    ensureCreateGedcomWelcomeAction();
    ensureDefaultWelcomeAction();
    elements.title.textContent = 'A family, in context.'; elements.subtitle.textContent = 'Open a GEDCOM to explore recorded relationships.';
    elements.graphSummary.textContent = 'NO TREE LOADED'; elements.generationLabel.textContent = 'FIVE GENERATIONS';
    state.zoom = 1; elements.canvas.style.zoom = '1'; elements.zoomLabel.textContent = '100%';
    renderRoster(); renderDetails();
    clearActiveSession();
  });

  elements.search.addEventListener('input', () => { state.searchText = elements.search.value; renderRoster(); });
  elements.mapViewButton.addEventListener('click', () => setMapMode(!state.mapMode));
  elements.birthCountryFilter.addEventListener('change', () => {
    state.directoryFilters.birthCountry = elements.birthCountryFilter.value;
    renderRoster();
  });
  elements.deathCountryFilter.addEventListener('change', () => {
    state.directoryFilters.deathCountry = elements.deathCountryFilter.value;
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
    const editButton = event.target.closest('button[data-add-life-event]');
    if (editButton) {
      const person = state.people.get(editButton.dataset.addLifeEvent);
      if (person) openLifeEventEditor(person, null);
      return;
    }
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
      wikiTreeSearchAbort?.abort();
      wikiTreeSearchAbort = null;
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
    if (state.people.has(state.primaryPersonId)) setFocus(state.primaryPersonId);
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
    saveLifeEvent(false);
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
    delete lifeEvent.remove.dataset.confirm;
  });
  elements.details.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
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
    if (!createRelativeRecord() && document.querySelector('#relativeDuplicateWarning').hidden) {
      showToast('Enter a given name and ensure a person record is selected.');
    }
  });
  elements.relativeType.addEventListener('change', () => {
    elements.relativeParentRoleField.hidden = elements.relativeType.value !== 'PARENT';
  });
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
    elements.confirmWikiTreeSearch.disabled = !elements.researchConsent.checked || Boolean(wikiTreeSearchAbort);
  });
  elements.confirmWikiTreeSearch.addEventListener('click', searchWikiTree);
  elements.researchDialog.addEventListener('close', () => {
    wikiTreeSearchAbort?.abort();
    wikiTreeSearchAbort = null;
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
  // The height budget leaves room for the map heading and print footer on the same page.
  const printPageWidth = 1030;
  const printMapHeightBudget = 520;
  let printCleanup = null;

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
    canvas.style.zoom = '1';
    canvas.style.minWidth = '0';
    canvas.style.minHeight = '0';
    if (svg) {
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
    }
    // Try each cards-per-row wrap width and keep the layout that can be printed largest on the landscape page.
    const widestCount = Math.max(1, ...[...canvas.querySelectorAll('.generation-nodes')].map((row) => row.querySelectorAll('.person-node').length));
    const rowWidth = (count) => count * 192 + Math.max(0, count - 1) * 11 + 8;
    const fitScale = (width) => {
      canvas.style.width = `${width}px`;
      return Math.min(1, printPageWidth / Math.max(width, canvas.scrollWidth), printMapHeightBudget / Math.max(1, canvas.scrollHeight));
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
    requestAnimationFrame(() => {
      const svg = elements.canvas.querySelector('.connector-layer');
      if (svg) drawConnectors(svg, new Set([...elements.canvas.querySelectorAll('.person-card')].map((card) => `${card.dataset.generation}|${card.dataset.personId}`)), state.selectedId, partnersOf(state.selectedId).map((item) => item.id));
    });
  }
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
    document.querySelector('#defaultsButton').textContent = state.defaultRecord?.gedcomHandle ? 'Change Default' : 'Set Default';
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
        showToast('The default GEDCOM could not be found. Use Set Default to choose it again.');
        return;
      }
      if (!await loadGedcomFile(file)) return;
      if (record.homePersonId && state.people.has(record.homePersonId)) setFocus(record.homePersonId, true);
      else showTreeWelcome();
      if (record.mediaHandle) {
        await restoreMediaDirectoryHandle(record.mediaHandle);
        await persistActiveSession();
      }
    } catch {
      showToast('The default tree could not be opened. Use Set Default to choose it again.');
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
      if (!await loadGedcomFile(file)) return false;
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
      if (!wrote) showToast(clearing ? 'Home person cleared (saved in this browser only).' : `${person.name} is now the home person (saved in this browser only; use Change Default to also update kinship-defaults.json).`);
      else showToast(clearing ? 'Home person cleared.' : `${person.name} will be selected when the default GEDCOM opens.`);
    } catch {
      showToast('Home person saved in this browser; kinship-defaults.json could not be updated.');
    }
    renderDetails();
  }

  const settingsMenu = document.querySelector('#settingsMenu');
  const settingsPanel = document.querySelector('#settingsPanel');
  const settingsButton = document.querySelector('#settingsButton');
  function setSettingsOpen(open) {
    settingsPanel.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
  }
  settingsButton.addEventListener('click', () => setSettingsOpen(settingsPanel.hidden));
  settingsPanel.addEventListener('click', () => window.setTimeout(() => setSettingsOpen(false), 0));
  document.addEventListener('click', (event) => { if (!settingsMenu.contains(event.target)) setSettingsOpen(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !settingsPanel.hidden) { setSettingsOpen(false); settingsButton.focus(); }
  });

  document.querySelector('#defaultsButton').addEventListener('click', openDefaultsDialog);
  setButtonContent(elements.mapViewButton, 'map', 'Map View');
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

  window.addEventListener('pagehide', () => { persistActiveSession(); });
  // Keeps Kinship Atlas.exe's local server alive while this tab is open.
  window.setInterval(() => { if (state.mediaHelper) fetch('/api/media-info', { cache: 'no-store' }).catch(() => {}); }, 30000);
  probeMediaHelper().then(restoreActiveSession).then(applyDefaultOnStartup).then(loadHelperMedia);
})();
