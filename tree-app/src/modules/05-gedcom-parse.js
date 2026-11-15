  // ---------------------------------------------------------------------------
  // 5. GEDCOM parsing
  // ---------------------------------------------------------------------------

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
    // Some files record a child only as "1 CHIL" inside the FAM record and omit
    // the matching "1 FAMC" on the person (and likewise for spouses and FAMS).
    // Link those back so parents, spouses and the pedigree view see them.
    for (const family of families.values()) {
      for (const childId of family.childIds) {
        const child = people.get(childId);
        if (child && !child.parentFamilyIds.includes(family.id)) child.parentFamilyIds.push(family.id);
      }
      for (const spouseId of [family.husbandId, family.wifeId]) {
        const spouse = spouseId && people.get(spouseId);
        if (spouse && !spouse.spouseFamilyIds.includes(family.id)) spouse.spouseFamilyIds.push(family.id);
      }
    }
    return { people, families, sources, gedcomRecords };
  }

