  // ---------------------------------------------------------------------------
  // 11. Editors and dialogs (person, life events, relationships, deletion)
  // ---------------------------------------------------------------------------

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
    const nameIndex = gedcomLineIndexOf(lines, 'NAME');
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
    let eventIndex = gedcomLineIndexOf(lines, eventTag);
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
    { key: 'NATU', label: 'Naturalization', tag: 'NATU', descLabel: 'Notes', mode: 'note' },
    { key: 'BAPM', label: 'Baptism', tag: 'BAPM', descLabel: 'Church / notes', mode: 'note' },
    { key: 'EDUC', label: 'Education', tag: 'EDUC', descLabel: 'School or qualification', mode: 'value' },
    { key: 'OCCU', label: 'Occupation', tag: 'OCCU', descLabel: 'Occupation', mode: 'value' },
    { key: 'MILT', label: 'Military', tag: 'EVEN', type: 'Military Service', descLabel: 'Unit / rank / notes', mode: 'value' },
    { key: 'RELI', label: 'Religious', tag: 'EVEN', type: 'Religious', descLabel: 'Description / notes', mode: 'value' },
    { key: 'EMIG', label: 'Departure', tag: 'EMIG', type: 'Departure', descLabel: 'Notes', mode: 'note' },
    { key: 'IMMI', label: 'Arrival', tag: 'IMMI', type: 'Arrival', descLabel: 'Notes', mode: 'note' },
    { key: 'BURI', label: 'Burial', tag: 'BURI', descLabel: 'Cemetery / notes', mode: 'note' },
    { key: 'CREM', label: 'Cremation', tag: 'CREM', descLabel: 'Cemetery / notes', mode: 'note' },
    { key: 'BIRT', label: 'Birth', tag: 'BIRT', descLabel: 'Notes', mode: 'note' },
    { key: 'DEAT', label: 'Death', tag: 'DEAT', descLabel: 'Notes', mode: 'note' },
    { key: 'ADOP', label: 'Adoption', tag: 'ADOP', descLabel: 'Family / notes', mode: 'note' },
    { key: 'BARM', label: 'Bar Mitzvah', tag: 'BARM', descLabel: 'Synagogue / notes', mode: 'note' },
    { key: 'BASM', label: 'Bas Mitzvah', tag: 'BASM', descLabel: 'Synagogue / notes', mode: 'note' },
    { key: 'BLES', label: 'Blessing', tag: 'BLES', descLabel: 'Where / notes', mode: 'note' },
    { key: 'CHR', label: 'Christening', tag: 'CHR', descLabel: 'Church / notes', mode: 'note' },
    { key: 'CHRA', label: 'Adult Christening', tag: 'CHRA', descLabel: 'Church / notes', mode: 'note' },
    { key: 'CONF', label: 'Confirmation', tag: 'CONF', descLabel: 'Church / notes', mode: 'note' },
    { key: 'FCOM', label: 'First Communion', tag: 'FCOM', descLabel: 'Church / notes', mode: 'note' },
    { key: 'CENS', label: 'Census', tag: 'CENS', descLabel: 'Household / notes', mode: 'note' },
    { key: 'GRAD', label: 'Graduation', tag: 'GRAD', descLabel: 'School or qualification', mode: 'value' },
    { key: 'RETI', label: 'Retirement', tag: 'RETI', descLabel: 'Occupation / notes', mode: 'note' },
    { key: 'ORDN', label: 'Ordination', tag: 'ORDN', descLabel: 'Church / notes', mode: 'note' },
    { key: 'PROB', label: 'Probate', tag: 'PROB', descLabel: 'Court / will details', mode: 'value' },
    { key: 'WILL', label: 'Will', tag: 'WILL', descLabel: 'Bequest / notes', mode: 'value' },
    { key: 'SSN', label: 'Social Security Number', tag: 'SSN', descLabel: 'Number', mode: 'value' },
    { key: 'OTHER', label: 'Other', tag: 'EVEN', custom: true, descLabel: 'Description / notes', mode: 'value' }
  ];

  function lifeEventConfigFor(event) {
    if (event.familyId) return lifeEventTypes.find((entry) => entry.family && entry.tag === event.type);
    if (event.type === 'EVEN') {
      const detail = (event.detail || '').trim().toLocaleLowerCase();
      return lifeEventTypes.find((entry) => entry.type && entry.type.toLocaleLowerCase() === detail) ||
        lifeEventTypes.find((entry) => entry.custom);
    }
    return lifeEventTypes.find((entry) => entry.tag === event.type && !entry.custom && !entry.family && entry.tag !== 'EVEN') ||
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
      const pageIndex = gedcomLineIndexOf(block, 'PAGE', 3);
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
      const start = gedcomLineIndexOf(lines, pending.config.tag);
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
          const pageIndex = gedcomLineIndexOf(block, 'PAGE', 3);
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
    // Classification dropdown, matching the Media page so a file uploaded here
    // is filed the same way as one classified there.
    const makeClassify = (mediaKey, label) => mediaClassifyControl(mediaKey, label);
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
      // Existing files are classified by their media-folder path.
      item.append(makeClassify(path, name));
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
      // New files are classified by filename until they are saved to the folder.
      item.append(makeClassify(entry.file.name, entry.file.name));
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

  // Spouse list for a new family event. People the person is already married to
  // (an existing spouse family) are listed first so their marriage can be dated
  // on the family that already links them, instead of creating a second family.
  function populateSpouseOptions(person) {
    const fields = lifeEventFields();
    fields.spouse.replaceChildren();
    const create = document.createElement('option');
    create.value = '';
    create.textContent = '＋ New person…';
    fields.spouse.append(create);
    const existingSpouses = existingSpousesOf(person.id);
    const existingIds = new Set(existingSpouses.map((entry) => entry.id));
    if (existingSpouses.length) {
      const group = document.createElement('optgroup');
      group.label = 'Existing spouse';
      for (const spouse of existingSpouses) {
        const option = document.createElement('option');
        option.value = spouse.id;
        const birth = yearFrom(spouse.person.events.find((entry) => entry.type === 'BIRT')?.date);
        const married = yearFrom(spouse.marriage?.date);
        option.textContent = `${spouse.person.name}${birth ? ` (b. ${birth})` : ''}${married ? ` · married ${married}` : ''}`;
        group.append(option);
      }
      fields.spouse.append(group);
    }
    const others = [...state.people.values()]
      .filter((entry) => entry.id !== person.id && !existingIds.has(entry.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (others.length) {
      const group = document.createElement('optgroup');
      group.label = existingSpouses.length ? 'Another person' : 'People in this tree';
      for (const other of others) {
        const option = document.createElement('option');
        option.value = other.id;
        const birth = yearFrom(other.events.find((entry) => entry.type === 'BIRT')?.date);
        option.textContent = `${other.name}${birth ? ` (b. ${birth})` : ''}`;
        group.append(option);
      }
      fields.spouse.append(group);
    }
    fields.spouse.disabled = false;
    fields.spouse.value = '';
  }

  // Spouses already linked to a person through a family record, with that
  // family so its existing marriage date can be shown next to the name.
  function existingSpousesOf(personId) {
    const result = [];
    const seen = new Set();
    for (const family of state.families.values()) {
      const spouseId = family.husbandId === personId ? family.wifeId : family.wifeId === personId ? family.husbandId : '';
      if (!spouseId || spouseId === personId || seen.has(spouseId)) continue;
      const spouse = state.people.get(spouseId);
      if (!spouse) continue;
      seen.add(spouseId);
      result.push({ id: spouseId, person: spouse, familyId: family.id, marriage: family.marriage });
    }
    return result.sort((a, b) => a.person.name.localeCompare(b.person.name));
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
      for (const config of [...lifeEventTypes].sort((a, b) => a.label.localeCompare(b.label))) {
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
      const firstOption = [...lifeEventTypes].sort((a, b) => a.label.localeCompare(b.label))[0];
      state.pendingLifeEvent.config = firstOption;
      applyLifeEventConfig(firstOption);
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
      const start = gedcomLineIndexOf(lines, tag);
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
          // Keep both spouses pointing at the family they now share a marriage in.
          for (const spouseXref of [selected.id, spouseId]) {
            const spouseRecord = findRecord('INDI', spouseXref);
            if (!spouseRecord) continue;
            const linked = spouseRecord.lines.some((line) => {
              const entry = parseGedcomField(line);
              return entry?.level === 1 && entry.tag === 'FAMS' && splitXref(entry.value) === existingFamily.id;
            });
            if (!linked) spouseRecord.lines = [...spouseRecord.lines, `1 FAMS @${existingFamily.id}@`];
          }
          commitNewSources(citations.newSources);
          refreshAfterGedcomMutation(pending.personId);
          fields.dialog.close();
          showToast(`${config.label} recorded on the family that already links ${selected.name} and ${personName(spouseId)}.${mediaLinkedText(mediaNames)}${sourcesChangedText(citations)}`);
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
      // Only typed EVEN records (Military, Religious, Other) carry a TYPE; IMMI/EMIG keep their plain standard tags.
      const typeText = config.custom ? customType : config.tag === 'EVEN' ? config.type : '';
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
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';
    elements.peopleCount.textContent = state.people.size.toLocaleString();
  }

  function refreshAfterGedcomMutation(personId) {
    reparseGedcomRecords();
    state.history = [];
    state.historyIndex = -1;
    markGedcomDirty();
    setFocus(state.people.has(personId) ? personId : state.people.keys().next().value, true);
  }

