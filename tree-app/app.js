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
    people: new Map(), families: new Map(), sources: new Map(), selectedId: null,
    fileName: '', searchText: '', history: [], historyIndex: -1, zoom: 1,
    mediaIndex: null, mediaUrls: new Map(), mediaRelativePaths: new WeakMap(), mediaDirectoryHandle: null,
    rememberedMediaDirectoryHandle: null,
    pendingUploadPersonId: null, pendingResearchPersonId: null,
    pendingPersonSummaryId: null,
    primaryMediaKey: '', primaryMedia: new Map(), additionalMedia: new Map(),
    gedcomRecords: [], gedcomDirty: false, gedcomText: '', sessionSaveQueue: Promise.resolve(),
    directoryFilters: { birthCountry: '', deathCountry: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null },
    directoryYearBounds: { birth: null, death: null },
    expandedSurnames: new Set()
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
    saveGedcom: document.querySelector('#saveGedcomButton'),
    clear: document.querySelector('#clearButton'),
    treeLabel: document.querySelector('#treeLabel'), peopleCount: document.querySelector('#peopleCount'),
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
    toast: document.querySelector('#toast')
  };
  let toastTimer = 0;
  let wikiTreeSearchAbort = null;

  function splitXref(value) {
    return value ? value.replace(/^@|@$/g, '') : '';
  }

  function createEvent(type, value = '') {
    return { type, value: cleanEventDisplayText(value), date: '', place: '', detail: '', notes: [], sources: [] };
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
          childIds: [...new Set(record.childIds)], marriage: record.marriage,
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
          record.events.push(activeEvent);
          continue;
        }
        if (level === 1 && tag === 'OCCU') {
          activeEvent = createEvent('OCCU', value);
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
          else if (tag === 'TYPE') activeEvent.detail = cleanEventDisplayText(value);
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(cleanEventDisplayText(value));
        }
      } else if (record.type === 'FAM') {
        if (level === 1 && tag === 'MARR') {
          record.marriage = createEvent('MARR');
          activeEvent = record.marriage;
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
      birthCountry: countryFlagForPlace(birth?.place)?.country || '',
      deathCountry: countryFlagForPlace(death?.place)?.country || ''
    };
  }

  function renderWikiTreeQueryPreview(query) {
    const fields = [
      ['First name', query.firstName],
      ['Last name', query.lastName],
      ['Year born', query.birthYear],
      ['Year died', query.deathYear],
      ['Country born', query.birthCountry],
      ['Country died', query.deathCountry]
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
      ['wpFirst', query.firstName],
      ['wpLast', query.lastName],
      ['wpBirthDate', query.birthYear],
      ['wpDeathDate', query.deathYear],
      ['birth_location', query.birthCountry],
      ['death_location', query.deathCountry]
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
    return `${baseName || 'Family Tree'}_media`;
  }

  function syncMediaButton() {
    elements.mediaButton.textContent = state.mediaDirectoryHandle || state.rememberedMediaDirectoryHandle
      ? 'Update Media Folder'
      : 'Select Media Folder';
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

  async function saveUploadedMedia(files) {
    const person = state.people.get(state.pendingUploadPersonId);
    const directoryHandle = state.mediaDirectoryHandle;
    state.pendingUploadPersonId = null;
    elements.mediaUploadInput.value = '';
    if (!person || !directoryHandle) return;

    let savedCount = 0;
    let failedCount = 0;
    for (const file of files) {
      if (!isImageFile(file) && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        failedCount += 1;
        continue;
      }
      try {
        const fileName = await uniqueMediaFileName(directoryHandle, file.name);
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        const savedFile = await fileHandle.getFile();
        addFileToMediaIndex(savedFile, fileName);
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
      showToast(`${savedCount} media item${savedCount === 1 ? '' : 's'} saved to the selected folder. ${linkStatus}${failedCount ? ` ${failedCount} item${failedCount === 1 ? '' : 's'} could not be saved.` : ''}`);
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
    elements.saveGedcom.disabled = true;
    state.primaryMediaKey = storageKey;
    state.additionalMedia = loadAdditionalMedia(storageKey, state.people);
    state.primaryMedia = loadPrimaryMedia(storageKey, state.people);
    state.fileName = fileName;
    state.searchText = '';
    state.history = [];
    state.historyIndex = -1;
    elements.search.value = '';
    elements.search.disabled = false;
    elements.clear.disabled = false;
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
      elements.saveGedcom.disabled = !state.gedcomDirty;
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
    elements.saveGedcom.disabled = false;
    elements.loadStatus.textContent = 'UNSAVED CHANGES';
    persistActiveSession();
  }

  async function saveGedcomToFile() {
    if (!state.gedcomDirty) return;
    const text = serializeGedcomRecords(state.gedcomRecords);
    const suggestedName = state.fileName.toLowerCase().endsWith('.ged') ? state.fileName : `${state.fileName || 'Family Tree'}.ged`;
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'GEDCOM file', accept: { 'text/plain': ['.ged'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      state.gedcomDirty = false;
      elements.saveGedcom.disabled = true;
      elements.loadStatus.textContent = 'TREE SAVED LOCALLY';
      state.gedcomText = text;
      await persistActiveSession();
      showToast('GEDCOM saved.');
    } catch (error) {
      if (error.name !== 'AbortError') showToast('The GEDCOM could not be saved.');
    }
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

  function renderGraph() {
    const selected = state.people.get(state.selectedId);
    elements.canvas.replaceChildren();
    if (!selected) return;
    const ancestors = generationLevels(selected.id, 'up', 2);
    const descendants = generationLevels(selected.id, 'down', 2);
    const partners = partnersOf(selected.id).map((item) => item.id);
    const allIds = new Set([selected.id, ...partners]);
    for (const ids of [...ancestors.values(), ...descendants.values()]) ids.forEach((id) => allIds.add(id));
    const nodeKeys = new Set();

    const rows = [
      { generation: -2, label: 'Grandparents', ids: ancestors.get(-2) || new Set() },
      { generation: -1, label: 'Parents', ids: ancestors.get(-1) || new Set() },
      { generation: 0, label: 'Selected person & partners', ids: new Set([selected.id, ...partners]) },
      { generation: 1, label: 'Children', ids: descendants.get(1) || new Set() },
      { generation: 2, label: 'Grandchildren', ids: descendants.get(2) || new Set() }
    ];
    const visibleRows = rows.map((row) => {
      const people = sortedPeople(row.ids);
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
      const parentIds = [family.husbandId, family.wifeId].filter(Boolean);
      for (const parentId of parentIds) {
        for (const childId of family.childIds) {
          for (const generation of [-2, -1, 0, 1]) {
            if (!nodeKeys.has(`${generation}|${parentId}`) || !nodeKeys.has(`${generation + 1}|${childId}`)) continue;
            addPath(point(cardFor(generation, parentId), 'bottom'), point(cardFor(generation + 1, childId), 'top'));
          }
        }
      }
    }
    const focusCard = cardFor(0, selectedId);
    for (const partnerId of partners) addPath(point(focusCard, 'bottom'), point(cardFor(0, partnerId), 'bottom'), true);
  }

  function renderRoster() {
    const query = state.searchText.trim().toLocaleLowerCase();
    const matches = [...state.people.values()].filter((person) => {
      if (query && !person.name.toLocaleLowerCase().includes(query)) return false;
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
      if (!groups.has(surname)) groups.set(surname, []);
      groups.get(surname).push(person);
    }
    for (const [surname, people] of groups) {
      const group = document.createElement('section');
      group.className = 'surname-group';
      const expanded = state.expandedSurnames.has(surname) || Boolean(query);
      const toggle = makeButton('', 'surname-group-toggle');
      toggle.dataset.surnameToggle = surname;
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
      group.append(toggle);
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

  function addRelationGroup(parent, label, items) {
    const group = document.createElement('div');
    group.className = 'relation-group';
    const heading = document.createElement('div');
    heading.className = 'relation-label';
    heading.textContent = label;
    const list = document.createElement('div');
    list.className = 'relation-list';
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'relation-button empty';
      empty.textContent = 'Not recorded';
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
        const button = makeButton(item.label, 'relation-button');
        button.dataset.personId = item.id;
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'relation-detail';
          detail.textContent = item.detail;
          button.append(detail);
        }
        list.append(button);
      }
    }
    group.append(heading, list);
    parent.append(group);
  }

  function relationshipGroups(person) {
    const parentFamilies = person.parentFamilyIds.map((id) => state.families.get(id)).filter(Boolean);
    const parents = [];
    const siblings = new Set();
    for (const family of parentFamilies) {
      const present = [family.husbandId, family.wifeId].filter(Boolean);
      for (const id of present) if (state.people.has(id)) parents.push({ id, label: personName(id) });
      if (present.length < 2) parents.push({ id: '', label: 'Parent not identified' });
      family.childIds.forEach((id) => { if (id !== person.id && state.people.has(id)) siblings.add(id); });
    }
    const partners = partnersOf(person.id).map(({ id, family }) => ({
      id, label: personName(id),
      detail: family.marriage ? [family.marriage.date, family.marriage.place].filter(Boolean).join(' · ') : ''
    }));
    const children = childrenOf(person.id).map((id) => ({ id, label: personName(id) }));
    return [
      ['Parents', parents], ['Siblings', [...siblings].map((id) => ({ id, label: personName(id) }))],
      ['Partners / spouses', partners], ['Children', children]
    ];
  }

  function eventTitle(event) {
    if (event.type === 'EVEN' && event.detail) return cleanEventDisplayText(event.detail);
    return cleanEventDisplayText(eventNames[event.type] || event.type);
  }

  function renderEvents(person) {
    const events = [...person.events].sort((a, b) => {
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

  function renderDetails() {
    const person = state.people.get(state.selectedId);
    elements.details.replaceChildren();
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
    const summaryEditButton = makeButton('Edit person details', 'research-button');
    summaryEditButton.dataset.editPersonSummary = person.id;
    const editButton = makeButton('Edit GEDCOM fields', 'research-button');
    editButton.dataset.editPerson = person.id;
    const addRelativeButton = makeButton('Add relative', 'research-button');
    addRelativeButton.dataset.addRelative = person.id;
    personActions.append(summaryEditButton, editButton, addRelativeButton);
    if (isRecordedDeceased(person)) {
      const researchButton = makeButton('Search WikiTree', 'research-button');
      researchButton.dataset.wikitreeSearch = person.id;
      personActions.append(researchButton);
    }
    hero.append(personActions);
    elements.details.append(hero);
    const media = renderMedia(person);
    if (media) elements.details.append(media);
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
  }

  function renderMedia(person) {
    const mediaSection = document.createElement('section');
    mediaSection.className = 'detail-section';
    const heading = document.createElement('h3');
    heading.className = 'detail-section-title';
    heading.textContent = `Attached media (${person.mediaPaths.length})`;
    mediaSection.append(heading);

    const actions = document.createElement('div');
    actions.className = 'media-actions';
    const addButton = makeButton('Add photo or PDF', 'media-add-button');
    addButton.dataset.addMediaFor = person.id;
    addButton.disabled = !state.mediaDirectoryHandle;
    addButton.title = state.mediaDirectoryHandle ? 'Add photo or PDF to the selected folder' : 'Select a media folder before adding files';
    actions.append(addButton);
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

    const grid = document.createElement('div');
    grid.className = 'media-grid';
    mediaSection.append(grid);
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
        grid.append(item);
      }
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
    renderGraph();
    renderDetails();
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

  function ensureCreateGedcomWelcomeAction() {
    const welcomeButton = elements.canvas.querySelector('.welcome-button');
    if (!welcomeButton || elements.canvas.querySelector('[data-create-gedcom]')) return;
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    welcomeButton.replaceWith(actions);
    const createButton = makeButton('Create new GEDCOM', 'button button-secondary');
    createButton.dataset.createGedcom = 'true';
    actions.append(welcomeButton, createButton);
  }

  elements.fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      showToast('This file is over 100 MB. Choose a smaller GEDCOM export.');
      elements.fileInput.value = '';
      return;
    }
    try {
      elements.loadStatus.textContent = 'READING LOCALLY…';
      const text = await file.text();
      const parsed = parseGedcom(text);
      const storageKey = await primaryMediaStorageKey(file, text);
      setLoaded(file.name, parsed, storageKey, text);
      await persistActiveSession();
      showToast(`Loaded ${parsed.people.size.toLocaleString()} individuals. The data remains in this tab.`);
    } catch (error) {
      elements.loadStatus.textContent = 'IMPORT FAILED';
      showToast(error instanceof Error ? error.message : 'The GEDCOM could not be read.');
    }
  });
  elements.saveGedcom.addEventListener('click', saveGedcomToFile);
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
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'GEDCOM file', accept: { 'text/plain': ['.ged'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(gedcomText);
        await writable.close();
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
      if (error.name !== 'AbortError') showToast('The GEDCOM file could not be saved.');
      return;
    }

    const storageKey = await primaryMediaStorageKey(file, gedcomText);
    setLoaded(fileName, parsed, storageKey, gedcomText);
    await persistActiveSession();
    elements.newGedcomDialog.close();
    showToast(`Created a new GEDCOM starter with one person and ${saveAction} the file.`);
  });
  ensureCreateGedcomWelcomeAction();

  elements.mediaButton.addEventListener('click', showMediaFolderDialog);
  elements.linkExistingMediaFolder.addEventListener('click', () => {
    chooseMediaDirectory(false).finally(() => elements.mediaFolderDialog.close());
  });
  elements.createMediaFolder.addEventListener('click', () => {
    chooseMediaDirectory(true).finally(() => elements.mediaFolderDialog.close());
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
    showToast(`Matched ${matched.toLocaleString()} of ${references.toLocaleString()} media references. Files remain in this tab.`);
  });

  elements.clear.addEventListener('click', () => {
    releaseMediaUrls(); state.mediaIndex = null;
    state.mediaRelativePaths = new WeakMap(); state.mediaDirectoryHandle = null; state.pendingUploadPersonId = null;
    syncMediaButton();
    state.primaryMediaKey = ''; state.primaryMedia.clear();
    state.additionalMedia.clear();
    state.gedcomRecords = []; state.gedcomDirty = false; elements.saveGedcom.disabled = true;
    state.people.clear(); state.families.clear(); state.sources.clear(); state.selectedId = null;
    refreshDirectoryFilters(true);
    state.fileName = ''; state.gedcomText = ''; state.history = []; state.historyIndex = -1; state.searchText = '';
    state.rememberedMediaDirectoryHandle = null;
    elements.fileInput.value = ''; elements.mediaInput.value = ''; elements.mediaButton.disabled = true; elements.search.value = ''; elements.search.disabled = true;
    elements.clear.disabled = true; elements.back.disabled = true; elements.forward.disabled = true;
    elements.zoomIn.disabled = true; elements.zoomOut.disabled = true;
    elements.treeLabel.textContent = 'No tree loaded'; elements.peopleCount.textContent = '0';
    elements.loadStatus.textContent = 'WAITING FOR FILE'; elements.statusPip.classList.remove('ready');
    elements.canvas.innerHTML = '<div class="welcome-state"><div class="welcome-art" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="welcome-node node-a"></span><span class="welcome-node node-b"></span><span class="welcome-node node-c"></span><span class="welcome-node node-d"></span><span class="welcome-node node-e"></span><span class="welcome-stem stem-a"></span><span class="welcome-stem stem-b"></span><span class="welcome-stem stem-c"></span><span class="welcome-stem stem-d"></span></div><div class="eyebrow">YOUR ARCHIVE, CONNECTED</div><h2>Start with a person.</h2><p>Choose a local GEDCOM file to open its family relationships in this tab.</p><label class="button button-primary welcome-button" for="gedcomInput"><span class="button-plus" aria-hidden="true">+</span> Open GEDCOM</label><span class="welcome-note">Your file is read locally and is not uploaded or saved by this app.</span></div>';
    ensureCreateGedcomWelcomeAction();
    elements.title.textContent = 'A family, in context.'; elements.subtitle.textContent = 'Open a GEDCOM to explore recorded relationships.';
    elements.graphSummary.textContent = 'NO TREE LOADED'; elements.generationLabel.textContent = 'FIVE GENERATIONS';
    state.zoom = 1; elements.canvas.style.zoom = '1'; elements.zoomLabel.textContent = '100%';
    renderRoster(); renderDetails();
    clearActiveSession();
  });

  elements.search.addEventListener('input', () => { state.searchText = elements.search.value; renderRoster(); });
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
    if (event.target.closest('button[data-create-gedcom]')) {
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
    const editButton = event.target.closest('button[data-edit-person]');
    if (editButton) {
      const person = state.people.get(editButton.dataset.editPerson);
      if (person) openPersonEditor(person);
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
      unlinkPersonMedia(unlinkButton.dataset.personId, unlinkButton.dataset.unlinkMedia);
      return;
    }
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.mediaUploadInput.addEventListener('change', (event) => {
    saveUploadedMedia([...(event.target.files || [])]);
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
  window.addEventListener('pagehide', () => { persistActiveSession(); });
  restoreActiveSession();
})();
