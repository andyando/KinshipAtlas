/* Kinship Atlas runs entirely in this browser tab. It does not upload or persist imported GEDCOM data. */
(() => {
  'use strict';

  const eventNames = {
    BIRT: 'Birth', DEAT: 'Death', BAPM: 'Baptism', CHR: 'Christening', BURI: 'Burial',
    RESI: 'Residence', IMMI: 'Immigration', EMIG: 'Emigration', NATU: 'Naturalization',
    MARR: 'Marriage', DIV: 'Divorce', OCCU: 'Occupation', EDUC: 'Education', EVEN: 'Event'
  };
  const eventTags = new Set(Object.keys(eventNames));
  const state = {
    people: new Map(), families: new Map(), sources: new Map(), selectedId: null,
    fileName: '', searchText: '', history: [], historyIndex: -1, zoom: 1
  };
  const elements = {
    fileInput: document.querySelector('#gedcomInput'), clear: document.querySelector('#clearButton'),
    treeLabel: document.querySelector('#treeLabel'), peopleCount: document.querySelector('#peopleCount'),
    search: document.querySelector('#peopleSearch'), peopleList: document.querySelector('#peopleList'),
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

  function splitXref(value) {
    return value ? value.replace(/^@|@$/g, '') : '';
  }

  function createEvent(type, value = '') {
    return { type, value: value || '', date: '', place: '', detail: '', notes: [], sources: [] };
  }

  function parseGedcom(text) {
    const people = new Map();
    const families = new Map();
    const sources = new Map();
    let record = null;
    let activeEvent = null;

    function finishRecord() {
      if (!record) return;
      if (record.type === 'INDI') {
        const rawName = record.rawName || '';
        const parsedSurname = (rawName.match(/\/([^/]+)\//) || [])[1] || '';
        const fallbackName = rawName.replaceAll('/', '').replace(/\s+/g, ' ').trim();
        const name = [record.givenName, record.surname || parsedSurname]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || fallbackName || record.id;
        people.set(record.id, {
          id: record.id, name, sex: record.sex, birthName: fallbackName,
          parentFamilyIds: record.parentFamilyIds, spouseFamilyIds: record.spouseFamilyIds,
          events: record.events, sourceIds: [...new Set(record.sourceIds)]
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
          record = { id: xref, type: tag, rawName: '', givenName: '', surname: '', sex: '', parentFamilyIds: [], spouseFamilyIds: [], events: [], sourceIds: [] };
        } else if (tag === 'FAM') {
          record = { id: xref, type: tag, husbandId: '', wifeId: '', childIds: [], marriage: null, sourceIds: [] };
        } else {
          record = { id: xref, type: tag, title: '', author: '' };
        }
        continue;
      }
      if (!record) continue;

      if (record.type === 'INDI') {
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
        if (level === 1 && tag === 'NAME') { record.rawName = value; activeEvent = null; continue; }
        if (level === 1 && tag === 'SEX') { record.sex = value; activeEvent = null; continue; }
        if (level === 1 && tag === 'FAMC') { record.parentFamilyIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag === 'FAMS') { record.spouseFamilyIds.push(splitXref(value)); activeEvent = null; continue; }
        if (level === 1 && tag !== 'SOUR' && tag !== 'NOTE') activeEvent = null;
        if (tag === 'GIVN' && level === 2) { record.givenName = value; continue; }
        if (tag === 'SURN' && level === 2) { record.surname = value; continue; }
        if (tag === 'SOUR') {
          const sourceId = splitXref(value);
          if (sourceId) {
            record.sourceIds.push(sourceId);
            if (activeEvent) activeEvent.sources.push(sourceId);
          }
          continue;
        }
        if (activeEvent && level >= 2) {
          if (tag === 'DATE') activeEvent.date = value;
          else if (tag === 'PLAC') activeEvent.place = value;
          else if (tag === 'TYPE') activeEvent.detail = value;
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(value);
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
          if (tag === 'DATE') activeEvent.date = value;
          else if (tag === 'PLAC') activeEvent.place = value;
          else if (tag === 'NOTE' || tag === 'CONT') activeEvent.notes.push(value);
          else if (tag === 'SOUR') activeEvent.sources.push(splitXref(value));
        }
      } else if (record.type === 'SOUR') {
        if (level === 1 && tag === 'TITL') record.title = value;
        else if (level === 1 && tag === 'AUTH') record.author = value;
      }
    }
    finishRecord();
    if (!people.size) throw new Error('No individual records were found in this file.');
    return { people, families, sources };
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

  function setLoaded(fileName, data) {
    state.people = data.people;
    state.families = data.families;
    state.sources = data.sources;
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

  function addPersonControl(container, personId, relation = '') {
    const person = state.people.get(personId);
    if (!person) return;
    const button = makeButton('', `person-card${person.sex === 'F' ? ' female' : ''}${relation === 'Partner' ? ' partner' : ''}`);
    button.dataset.personId = personId;
    button.dataset.generation = container.dataset.generation;
    button.setAttribute('aria-current', String(personId === state.selectedId));
    const relationLabel = document.createElement('span');
    relationLabel.className = 'card-relation';
    relationLabel.textContent = relation || (personId === state.selectedId ? 'Selected person' : 'Family member');
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = person.name;
    const years = document.createElement('span');
    years.className = 'card-years';
    const birthPlace = person.events.find((event) => event.type === 'BIRT')?.place || '';
    years.textContent = [lifespan(person), birthPlace].filter(Boolean).join(' · ');
    button.append(relationLabel, name, years);
    container.append(button);
  }

  function appendGeneration(canvas, label, generation, people, relation = '') {
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
    for (const person of people) addPersonControl(nodes, person.id, relation || '');
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
    for (const row of rows) {
      const sorted = sortedPeople(row.ids);
      if (!sorted.length && row.generation === 0) sorted.push(selected);
      if (!sorted.length) continue;
      appendGeneration(elements.canvas, row.label, row.generation, sorted);
      for (const person of sorted) nodeKeys.add(`${row.generation}|${person.id}`);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connector-layer');
    svg.setAttribute('aria-hidden', 'true');
    elements.canvas.prepend(svg);
    elements.generationLabel.textContent = `${rows.filter((row) => row.ids.size || row.generation === 0).length} GENERATIONS`;
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
    const matches = [...state.people.values()]
      .filter((person) => !query || person.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    elements.peopleList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = query ? 'No names match this search.' : state.people.size ? 'No individuals in this file.' : 'Open a GEDCOM to see people here.';
      elements.peopleList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const person of matches.slice(0, 120)) {
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
      fragment.append(button);
    }
    elements.peopleList.append(fragment);
    if (matches.length > 120) {
      const note = document.createElement('div');
      note.className = 'list-empty list-cap';
      note.textContent = `Showing first 120 of ${matches.length.toLocaleString()} matches.`;
      elements.peopleList.append(note);
    }
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
    if (event.type === 'EVEN' && event.detail) return event.detail;
    return eventNames[event.type] || event.type;
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
        detail.textContent = [event.date, event.place, event.value, ...event.notes].filter(Boolean).join(' · ') || 'Details not recorded';
        body.append(label, detail);
        const sourceIds = [...new Set(event.sources)];
        if (sourceIds.length) {
          const source = document.createElement('span');
          source.className = 'event-source';
          source.textContent = sourceIds.map((id) => state.sources.get(id)?.title ? `${id}: ${state.sources.get(id).title}` : id).join(' · ');
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
    elements.details.append(hero);
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
      const parsed = parseGedcom(await file.text());
      setLoaded(file.name, parsed);
      showToast(`Loaded ${parsed.people.size.toLocaleString()} individuals. The data remains in this tab.`);
    } catch (error) {
      elements.loadStatus.textContent = 'IMPORT FAILED';
      showToast(error instanceof Error ? error.message : 'The GEDCOM could not be read.');
    }
  });

  elements.clear.addEventListener('click', () => {
    state.people.clear(); state.families.clear(); state.sources.clear(); state.selectedId = null;
    state.fileName = ''; state.history = []; state.historyIndex = -1; state.searchText = '';
    elements.fileInput.value = ''; elements.search.value = ''; elements.search.disabled = true;
    elements.clear.disabled = true; elements.back.disabled = true; elements.forward.disabled = true;
    elements.zoomIn.disabled = true; elements.zoomOut.disabled = true;
    elements.treeLabel.textContent = 'No tree loaded'; elements.peopleCount.textContent = '0';
    elements.loadStatus.textContent = 'WAITING FOR FILE'; elements.statusPip.classList.remove('ready');
    elements.canvas.innerHTML = '<div class="welcome-state"><div class="welcome-art" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="welcome-node node-a"></span><span class="welcome-node node-b"></span><span class="welcome-node node-c"></span><span class="welcome-node node-d"></span><span class="welcome-node node-e"></span><span class="welcome-stem stem-a"></span><span class="welcome-stem stem-b"></span><span class="welcome-stem stem-c"></span><span class="welcome-stem stem-d"></span></div><div class="eyebrow">YOUR ARCHIVE, CONNECTED</div><h2>Start with a person.</h2><p>Choose a local GEDCOM file to open its family relationships in this tab.</p><label class="button button-primary welcome-button" for="gedcomInput"><span class="button-plus" aria-hidden="true">+</span> Open GEDCOM</label><span class="welcome-note">Your file is read locally and is not uploaded or saved by this app.</span></div>';
    elements.title.textContent = 'A family, in context.'; elements.subtitle.textContent = 'Open a GEDCOM to explore recorded relationships.';
    elements.graphSummary.textContent = 'NO TREE LOADED'; elements.generationLabel.textContent = 'FIVE GENERATIONS';
    state.zoom = 1; elements.canvas.style.zoom = '1'; elements.zoomLabel.textContent = '100%';
    renderRoster(); renderDetails();
  });

  elements.search.addEventListener('input', () => { state.searchText = elements.search.value; renderRoster(); });
  elements.peopleList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.canvas.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.details.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
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
})();
