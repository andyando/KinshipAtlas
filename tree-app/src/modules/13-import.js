  // ---------------------------------------------------------------------------
  // 13. GEDCOM import, merging and saving
  // ---------------------------------------------------------------------------

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

  function openRelativeEditor(relation = 'PARENT', parentRole = '', parentFamilyId = '') {
    elements.addRelativeForm.reset();
    elements.relativeType.value = relation;
    if (parentRole) elements.relativeParentRole.value = parentRole;
    document.querySelector('#relativeFamily').value = '';
    elements.relativeParentRoleField.hidden = relation !== 'PARENT';
    syncRelativeEntryMode();
    if (parentFamilyId) document.querySelector('#relativeFamily').value = parentFamilyId;
    elements.addRelativeDialog.showModal();
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
    const selectedFamilyId = familySelect.value;
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
    if (selectedFamilyId && families.some((family) => family.id === selectedFamilyId)) {
      familySelect.value = selectedFamilyId;
    } else if (families.length !== 1) {
      familySelect.value = '';
    }
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

  async function createRelativeRecord() {
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
      const parentFamilyId = document.querySelector('#relativeFamily').value;
      const parentFamily = state.families.get(parentFamilyId);
      const parentFamilyRecord = state.gedcomRecords.find((record) => record.tag === 'FAM' && record.xref === parentFamilyId);
      if (!['HUSB', 'WIFE'].includes(parentRole) || (parentFamilyId && (!parentFamilyRecord
        || !parentFamily?.childIds.includes(selected.id)
        || (parentRole === 'HUSB' ? parentFamily.husbandId : parentFamily.wifeId)))) {
        const errorBox = document.querySelector('#relativeError');
        errorBox.textContent = 'That parent family is unavailable or the parent role is already occupied.';
        errorBox.hidden = false;
        return false;
      }
      if (parentFamilyId) {
        appendRecordLine(parentFamilyRecord, `1 ${parentRole} @${personId}@`);
        appendRecordLine(selectedRecord, `1 FAMC @${parentFamilyId}@`);
        newPersonLines.push(`1 FAMS @${parentFamilyId}@`);
        addFamilyRecord = false;
      } else {
        familyLines.push(`1 ${parentRole} @${personId}@`, `1 CHIL @${selected.id}@`);
        newPersonLines.push(`1 FAMS @${familyId}@`);
        selectedRecord.lines.push(`1 FAMC @${familyId}@`);
      }
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
    // The new person gets their media subfolder straight away, so photo and PDF
    // uploads already have somewhere to land.
    refreshAfterGedcomMutation(personId);
    await ensurePersonMediaFolders();
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

  // Declared as a hoisted function (not a const arrow) because several editors defined
  // earlier in this file call it at runtime, after initialisation has completed.
  function findGedcomRecord(tag, xref) {
    return state.gedcomRecords.find((record) => record.tag === tag && record.xref === xref);
  }

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
      const start = gedcomLineIndexOf(lines, 'MARR');
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

  // True for "@Xref@" values; returns the bare xref, or '' when the value is not a pointer.
  function gedcomPointer(value) {
    return /^@[^@\s]+@$/.test(value.trim()) ? value.trim().slice(1, -1) : '';
  }

  // Level-1 block splitter for an INDI record: each entry covers one top-level
  // field (event, NOTE/SOUR/OBJE reference, FAMS/FAMC link…) plus its sub-lines.
  function gedcomPersonBlocks(record) {
    const blocks = [];
    for (let index = 1; index < record.lines.length;) {
      const field = parseGedcomField(record.lines[index]);
      if (!field || field.level !== 1) { index += 1; continue; }
      let end = index + 1;
      while (end < record.lines.length) {
        const next = parseGedcomField(record.lines[end]);
        if (next && next.level <= 1) break;
        end += 1;
      }
      blocks.push({ tag: field.tag, lines: record.lines.slice(index, end) });
      index = end;
    }
    return blocks;
  }

  // Merges the source person's relationships, life events, custom fields and
  // notes/source/media references into the keeper, so the caller can delete the
  // now-redundant source record without losing anything. Returns small counts
  // for the confirmation dialog.
  function mergePersonIntoKeeper(keeperId, sourceId) {
    const result = { families: 0, events: 0, media: 0 };
    const keeperRecord = findGedcomRecord('INDI', keeperId);
    const sourceRecord = findGedcomRecord('INDI', sourceId);
    if (!keeperRecord || !sourceRecord || keeperId === sourceId) return result;

    // Rewrites the FAM records: memberships of the source move to the keeper,
    // dropping links that would leave the keeper listed twice in one family.
    const spouseOf = (record, xref) => record.lines.some((line) => {
      const field = parseGedcomField(line);
      return field && (field.tag === 'HUSB' || field.tag === 'WIFE') && field.value.trim() === xref;
    });
    const childOf = (record, xref) => record.lines.some((line) => {
      const field = parseGedcomField(line);
      return field && field.tag === 'CHIL' && field.value.trim() === xref;
    });
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'FAM') continue;
      const lines = [];
      let changed = false;
      for (const line of record.lines) {
        const field = parseGedcomField(line);
        if (field && (field.tag === 'HUSB' || field.tag === 'WIFE') && field.value.trim() === sourceId) {
          changed = true;
          if (spouseOf(record, keeperId)) continue; // keeper already a spouse here
          lines.push(line.replace(sourceId, keeperId));
          result.families += 1;
          continue;
        }
        if (field && field.tag === 'CHIL' && field.value.trim() === sourceId) {
          changed = true;
          if (childOf(record, keeperId)) continue; // keeper already a child here
          lines.push(line.replace(sourceId, keeperId));
          result.families += 1;
          continue;
        }
        lines.push(line);
      }
      if (changed) record.lines = lines;
    }

    // Moves every remaining level-1 block (life events, occupations, residences,
    // NOTE/SOUR/OBJE references, custom tags) unless the keeper already carries
    // an identical block — so re-running the merge cannot duplicate content.
    const signature = (block) => block.lines.map((line) => line.replace(/\s+/g, ' ').trim().toUpperCase()).join('|');
    const keeperSignatures = new Set(gedcomPersonBlocks(keeperRecord).map(signature));
    const skippedTags = new Set(['NAME', 'SEX', 'FAMS', 'FAMC', 'CHAN', '_UID']);
    const moved = gedcomPersonBlocks(sourceRecord)
      .filter((block) => !skippedTags.has(block.tag) && !keeperSignatures.has(signature(block)));
    if (moved.length) {
      keeperRecord.lines.push(...moved.flatMap((block) => block.lines));
      result.events = moved.filter((block) => eventTags.has(block.tag) || block.tag === 'EVEN' || block.tag === 'RESI' || block.tag === 'OCCU').length;
    }

    // Moves the media attachments; the keeper keeps its own primary image.
    const keeperMedia = state.additionalMedia.get(keeperId) || [];
    const sourceMedia = state.additionalMedia.get(sourceId);
    if (sourceMedia?.length) {
      const merged = [...new Set([...keeperMedia, ...sourceMedia])];
      if (merged.length !== keeperMedia.length) {
        state.additionalMedia.set(keeperId, merged);
        saveAdditionalMedia();
        result.media += merged.length - keeperMedia.length;
      }
      state.additionalMedia.delete(sourceId);
    }
    if (state.primaryMedia.has(sourceId)) {
      if (!state.primaryMedia.has(keeperId)) {
        state.primaryMedia.set(keeperId, state.primaryMedia.get(sourceId));
        result.media += 1;
      }
      state.primaryMedia.delete(sourceId);
      savePrimaryMedia();
    }
    if (state.primaryPersonId === sourceId) {
      state.primaryPersonId = keeperId;
      storeSelection(primaryPersonStorageKey(), keeperId);
      syncPrimaryPersonBar();
    }
    return result;
  }

  // Works out everything a person deletion touches. Families left with one member or none are removed too,
  // as are NOTE/OBJE records used only by removed records. Sources, repositories and media files are kept.
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
    showModalFocused(document.querySelector('#personDeleteDialog'));
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
      // Every person gets a folder of their own in the media folder when one is open.
      if (state.mediaDirectoryHandle) {
        state.mediaPersonFolders.clear();
        ensurePersonMediaFolders({ quiet: true }).then((created) => { if (created) render(); });
      }
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
      await ensurePersonMediaFolders({ quiet: true });
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

  // Media can be inspected without a GEDCOM: picking a folder or files enables
  // the Media Library button so its entries are reachable.
  function openLibraryOnMediaImport() {
    elements.mediaLibraryButton.disabled = false;
    const menuButton = document.querySelector('#mediaLibraryMenuButton');
    if (menuButton) menuButton.disabled = false;
    // Picking the folder also lets entries be checked for duplicates.
    const duplicateButton = document.querySelector('#duplicateMediaMenuButton');
    if (duplicateButton) duplicateButton.disabled = false;
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
    openLibraryOnMediaImport();
    const byName = new Map();
    // Files picked from the folder are Media Library entries in their own right,
    // even when no GEDCOM person references them.
    const folderFiles = new Map();
    for (const file of files) {
      // Index by bare name and, when the picker supplies it, the relative path.
      for (const key of new Set([file.name, file.webkitRelativePath])) {
        const name = normalizeMediaPath(key);
        if (!name) continue;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(file);
        if (typeof isImageFile === 'function' ? isImageFile(file) : /^image\//.test(file.type || '')) folderFiles.set(name, file);
      }
    }
    state.folderMediaFiles = folderFiles;
    state.mediaIndex = { byName };
    // The entries already known to be out of date are replaced by these picks.
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';
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
    const viewSwitch = document.querySelector('#viewSwitch');
    if (viewSwitch) { viewSwitch.disabled = true; viewSwitch.value = 'tree'; }
    document.querySelector('#mediaLibraryMenuButton').disabled = true;
    document.querySelector('#birthCountryMenuButton').disabled = true;
    document.querySelector('#duplicateFinderMenuButton').disabled = true;
    document.querySelector('#mediaOrganiseMenuButton').disabled = true;
    document.querySelector('#duplicateMediaMenuButton').disabled = true;
    document.querySelector('#orphanRecordsMenuButton').disabled = true;
    releaseMediaUrls(); state.mediaIndex = null; state.mediaFolderPicked = false;
    state.mediaRelativePaths = new WeakMap(); state.folderMediaFiles = new Map(); state.mediaDirectoryHandle = null; state.pendingUploadPersonId = null; state.pendingPortraitReplacement = null;
    syncMediaButton();
    state.primaryMediaKey = ''; state.primaryMedia.clear(); state.mediaTypes.clear();
    state.additionalMedia.clear();
    state.gedcomRecords = [];     state.gedcomDirty = false;
    state.gedcomSource = ''; state.gedcomFileHandle = null; state.gedcomBaseHash = ''; state.gedcomPickerDeclined = false;
    state.people.clear(); state.families.clear(); state.sources.clear(); state.selectedId = null;
    state.primaryPersonId = ''; syncPrimaryPersonBar();
    state.mediaLibraryCache = null;
    state.mediaLibraryCacheKey = '';
    refreshDirectoryFilters(true);
    state.fileName = ''; state.gedcomText = ''; state.history = []; state.historyIndex = -1; state.searchText = '';
    state.rememberedMediaDirectoryHandle = null;
    elements.fileInput.value = ''; elements.mediaInput.value = ''; elements.mediaButton.disabled = true; elements.search.value = ''; elements.search.disabled = true;
    document.querySelector('#openGedcomLabel').hidden = false;
    elements.clear.disabled = true; elements.back.disabled = true; elements.forward.disabled = true;
    document.querySelector('#importGedcomButton').disabled = true;
    elements.printMapButton.disabled = true;
    state.showSiblings = false;
    elements.showSiblings.checked = false;
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
  document.querySelector('#viewSwitch').addEventListener('change', (event) => {
    const mode = event.target.value;
    if (mode === 'tree') {
      if (state.pedigreeMode) setPedigreeMode(false);
      if (state.mediaLibraryMode) setMediaLibraryMode(false);
      if (state.reportsMode) setReportsMode(false);
      if (state.mapMode) setMapMode(false);
    } else if (mode === 'map') {
      if (state.pedigreeMode) setPedigreeMode(false);
      if (state.mediaLibraryMode) setMediaLibraryMode(false);
      if (state.reportsMode) setReportsMode(false);
      setMapMode(true);
    } else if (mode === 'pedigree') {
      if (state.mapMode) setMapMode(false);
      if (state.mediaLibraryMode) setMediaLibraryMode(false);
      if (state.reportsMode) setReportsMode(false);
      setPedigreeMode(true);
    } else if (mode === 'reports') {
      if (state.mapMode) setMapMode(false);
      if (state.pedigreeMode) setPedigreeMode(false);
      if (state.mediaLibraryMode) setMediaLibraryMode(false);
      setReportsMode(true);
    } else if (mode === 'media') {
      if (state.mapMode) setMapMode(false);
      if (state.pedigreeMode) setPedigreeMode(false);
      if (state.reportsMode) setReportsMode(false);
      setMediaLibraryMode(true);
    }
  });
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
  document.querySelector('#duplicateFinderMenuButton').addEventListener('click', openDuplicateFinder);
  document.querySelector('#duplicateThreshold').addEventListener('input', (event) => {
    document.querySelector('#duplicateThresholdLabel').textContent = event.target.value;
    renderDuplicateFinder();
  });
  document.querySelector('#duplicateFinderList').addEventListener('change', (event) => {
    if (event.target.dataset.duplicateDelete !== undefined) {
      // One choice per pair: selecting one record clears the other radio of that pair.
      const card = event.target.closest('.duplicate-pair');
      for (const other of card.querySelectorAll('input[data-duplicate-delete]')) {
        if (other !== event.target) other.checked = false;
      }
      card.classList.toggle('is-selected', event.target.checked);
      updateDuplicateSelected();
    }
  });
  document.querySelector('#deleteDuplicatesButton').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#duplicateFinderList input[data-duplicate-delete]:checked');
    const idsToDelete = new Set();
    for (const cb of checkboxes) idsToDelete.add(cb.dataset.duplicateDelete);
    const merges = [...document.querySelectorAll('#duplicateFinderList input[data-duplicate-merge-source]:checked')]
      .map((box) => ({ source: box.dataset.duplicateMergeSource, keeper: box.dataset.duplicateMergeKeeper }))
      .filter(({ source }) => idsToDelete.has(source));
    if (!idsToDelete.size) return;
    // Check no one would be the last person
    if (state.people.size - idsToDelete.size < 1) {
      showToast('Cannot delete the last person in the tree.');
      return;
    }
    // Show confirmation naming the chosen records and what deletion removes
    const dialog = document.querySelector('#duplicateFinderDialog');
    const details = [...idsToDelete].map((id) => {
      const plan = planPersonDeletion(id);
      if (!plan) return `@${id}@`;
      const extras = [
        plan.events ? `${plan.events} life event${plan.events === 1 ? '' : 's'}` : '',
        plan.removedFamilyIds.length ? `${plan.removedFamilyIds.length} family record${plan.removedFamilyIds.length === 1 ? '' : 's'}` : ''
      ].filter(Boolean).join(', ');
      return `${plan.name}${extras ? ` (${extras})` : ''}`;
    });
    const confirmP = document.createElement('p');
    confirmP.id = 'duplicateDeleteConfirm';
    confirmP.className = 'duplicate-delete-confirm';
    confirmP.append(document.createTextNode(
      `${merges.length ? `First merge ${merges.map(({ source, keeper }) => {
        const from = state.people.get(source)?.name || `@${source}@`;
        const into = state.people.get(keeper)?.name || `@${keeper}@`;
        return `${from} into ${into}`;
      }).join(', ')}. ` : ''}Delete ${details.join('; ')}? Their events, links to relatives and any note records used only by them are removed too. Relatives, sources and media files are kept. This cannot be undone.`
    ));
    dialog.querySelector('.dialog-panel').prepend(confirmP);
    // Re-render delete button to trigger confirmation
    const deleteBtn = document.querySelector('#deleteDuplicatesButton');
    if (!deleteBtn.dataset.confirm) {
      deleteBtn.dataset.confirm = 'pending';
      deleteBtn.textContent = `Confirm delete ${idsToDelete.size} person${idsToDelete.size > 1 ? 's' : ''}`;
      return;
    }
    deleteBtn.dataset.confirm = '';
    // Proceed: merge first (so nothing is lost), then delete the leftovers.
    confirmP.remove();
    for (const { source, keeper } of merges) mergePersonIntoKeeper(keeper, source);
    for (const id of idsToDelete) {
      const plan = planPersonDeletion(id);
      if (plan) deletePersonRecord(plan);
    }
    closeDuplicateFinder();
    showToast(`Deleted ${idsToDelete.size} duplicate person${idsToDelete.size > 1 ? 's' : ''}.`);
  });
  document.querySelector('#closeDuplicateFinder').addEventListener('click', closeDuplicateFinder);
  // ---------- Colour theme ----------
  // The theme is a single data-theme attribute on <html>; styles.css holds the
  // palettes, so every component follows it. The choice is remembered in
  // localStorage and re-applied on every startup. Themes are chosen from the
  // Settings > Theme submenu.
  const themeStorageKey = 'kinship-atlas:theme';
  const themeColorMeta = () => document.querySelector('meta[name="color-scheme"]');
  const knownThemes = ['heritage', 'dark', 'parchment', 'forest', 'royal'];
  const darkThemes = new Set(['dark']);

  function applyTheme(theme, { remember = true } = {}) {
    if (!knownThemes.includes(theme)) theme = 'heritage';
    const dark = darkThemes.has(theme);
    document.documentElement.dataset.theme = theme;
    // Tell the browser so native controls, scrollbars and form widgets match.
    const meta = themeColorMeta();
    if (meta) meta.setAttribute('content', dark ? 'dark light' : 'light dark');
    syncThemeMenu();
    if (remember) {
      try { localStorage.setItem(themeStorageKey, theme); } catch { }
    }
    // Redraw the pedigree so its connector colours and card surfaces follow the theme.
    if (state.pedigreeMode) renderPedigreeView();
  }

  function preferredTheme() {
    try {
      const saved = localStorage.getItem(themeStorageKey);
      if (knownThemes.includes(saved)) return saved;
      // Older installs only stored light/dark; a removed theme falls back too.
      if (saved === 'light') return 'heritage';
      if (saved === 'dark') return 'dark';
      if (saved === 'atlas-dark') return 'dark';
    } catch { }
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'heritage';
  }

  function syncThemeMenu() {
    const current = document.documentElement.dataset.theme || 'heritage';
    for (const option of document.querySelectorAll('#themePanel .theme-option')) {
      option.setAttribute('aria-checked', String(option.dataset.themeChoice === current));
    }
  }

  const themeMenuButton = document.querySelector('#themeMenuButton');
  const themePanel = document.querySelector('#themePanel');
  function setThemeSubmenuOpen(open) {
    themePanel.hidden = !open;
    themeMenuButton.setAttribute('aria-expanded', String(open));
  }
  themeMenuButton.addEventListener('click', () => setThemeSubmenuOpen(themePanel.hidden));
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#themeSubmenu')) setThemeSubmenuOpen(false);
  });
  for (const option of document.querySelectorAll('#themePanel .theme-option')) {
    option.addEventListener('click', () => {
      applyTheme(option.dataset.themeChoice);
      setThemeSubmenuOpen(false);
    });
  }

  const treeManagementMenuButton = document.querySelector('#treeManagementMenuButton');
  const treeManagementPanel = document.querySelector('#treeManagementPanel');
  function setTreeManagementSubmenuOpen(open) {
    treeManagementPanel.hidden = !open;
    treeManagementMenuButton.setAttribute('aria-expanded', String(open));
  }
  treeManagementMenuButton.addEventListener('click', () => setTreeManagementSubmenuOpen(treeManagementPanel.hidden));
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#treeManagementSubmenu')) setTreeManagementSubmenuOpen(false);
  });
  // Map provider preference: choosing one stores it and keeps the menu open
  // (it is a control, not a command, so it must not close the menu).
  const mapProviderSelect = document.querySelector('#mapProviderSelect');
  if (mapProviderSelect && typeof setPreferredMapProvider === 'function' && typeof preferredMapProvider === 'function') {
    mapProviderSelect.value = preferredMapProvider();
    mapProviderSelect.addEventListener('change', () => {
      setPreferredMapProvider(mapProviderSelect.value);
      showToast(`Place links now open in ${mapProviderSelect.selectedOptions[0].textContent}.`);
    });
  }
  // Choosing an item closes the submenu and then the whole settings menu, the
  // same way a top-level menu item does. The map-provider select is a control
  // rather than a command, so it keeps the menu open.
  for (const item of treeManagementPanel.querySelectorAll('.menu-item:not(.menu-submenu-toggle):not(.menu-select-item)')) {
    if (item.id === 'gazetteerMenuButton') {
      item.addEventListener('click', () => {
        setTreeManagementSubmenuOpen(false);
        setSettingsOpen(false);
        window.KinshipHistoricalGazetteer?.openDialog?.();
      });
      continue;
    }
    item.addEventListener('click', () => {
      setTreeManagementSubmenuOpen(false);
      window.setTimeout(() => setSettingsOpen(false), 0);
    });
  }

  document.querySelector('#duplicateRelationMenuButton').addEventListener('click', openDuplicateRelationFinder);
  document.querySelector('#duplicateRelationSelectAll').addEventListener('change', (event) => {
    const checked = event.target.checked;
    for (const box of document.querySelectorAll('#duplicateRelationList input[data-relation-delete]')) box.checked = checked;
    updateDuplicateRelationSelected();
  });
  document.querySelector('#duplicateRelationList').addEventListener('change', () => {
    const boxes = [...document.querySelectorAll('#duplicateRelationList input[data-relation-delete]')];
    document.querySelector('#duplicateRelationSelectAll').checked = boxes.length > 0 && boxes.every((box) => box.checked);
    updateDuplicateRelationSelected();
  });
  document.querySelector('#deleteDuplicateRelationsButton').addEventListener('click', () => {
    const deleteButton = document.querySelector('#deleteDuplicateRelationsButton');
    const dialog = document.querySelector('#duplicateRelationDialog');
    const chosen = [...document.querySelectorAll('#duplicateRelationList input[data-relation-delete]:checked')]
      .map((box) => latestRelationFindings[Number(box.dataset.relationDelete)]).filter(Boolean);
    if (!chosen.length) return;
    const confirmP = document.createElement('p');
    confirmP.id = 'duplicateRelationConfirm';
    confirmP.className = 'duplicate-delete-confirm';
    confirmP.append(document.createTextNode(
      `Delete ${chosen.length} duplicate link${chosen.length > 1 ? 's' : ''}? At least one identical connection stays in place for every person involved, and sources, media and life events are untouched. This cannot be undone.`
    ));
    dialog.querySelector('.dialog-panel').prepend(confirmP);
    if (!deleteButton.dataset.confirm) {
      deleteButton.dataset.confirm = 'pending';
      deleteButton.textContent = `Confirm delete ${chosen.length} duplicate link${chosen.length > 1 ? 's' : ''}`;
      return;
    }
    deleteButton.dataset.confirm = '';
    confirmP.remove();
    const removed = deleteDuplicateRelationship(chosen);
    closeDuplicateRelationFinder();
    showToast(removed ? `Deleted ${chosen.length} duplicate link${chosen.length > 1 ? 's' : ''}.` : 'No duplicate links could be removed; the tree may already be fixed.');
  });
  document.querySelector('#closeDuplicateRelations').addEventListener('click', closeDuplicateRelationFinder);
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
  document.querySelector('#mediaLibrarySearch').addEventListener('input', () => {
    clearTimeout(state.mediaLibrarySearchDebounce);
    state.mediaLibraryPage = 0;
    state.mediaLibrarySearchDebounce = setTimeout(renderMediaLibrary, 150);
  });
  document.querySelector('#mediaLibraryTypeFilter').addEventListener('change', () => {
    state.mediaLibraryPage = 0;
    renderMediaLibrary();
  });
  document.querySelector('#mediaLibrarySort').addEventListener('change', (event) => {
    state.mediaLibrarySort = event.target.value || 'name-asc';
    state.mediaLibraryPage = 0;
    renderMediaLibrary();
  });
  for (const button of elements.mediaLibraryView.querySelectorAll('[data-media-page]')) {
    button.addEventListener('click', () => changeMediaLibraryPage(Number(button.dataset.mediaPage)));
  }
  // Bulk and face features need the media library elements to exist on the page
  // before the app wires handlers to them.
  for (const [value, label] of mediaTypeOptions) {
    if (!value) continue;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    document.querySelector('#mediaLibraryBulkType').append(option);
  }
  document.querySelector('#mediaLibraryBulkType').addEventListener('change', () => {
    document.querySelector('#mediaLibraryBulkApplyButton').disabled = !state.mediaLibrarySelected.size || !document.querySelector('#mediaLibraryBulkType').value;
  });
  document.querySelector('#mediaLibraryBulkApplyButton').addEventListener('click', () => {
    const entries = visibleMediaLibraryEntries().filter((entry) => state.mediaLibrarySelected.has(entry.key));
    const applied = applyBulkMediaClassification(entries, document.querySelector('#mediaLibraryBulkType').value);
    if (applied) showToast(`Updated the classification of ${applied} item${applied === 1 ? '' : 's'}.`);
  });
  document.querySelector('#mediaLibrarySelectAllButton').addEventListener('click', () => {
    // One button for both directions: when everything visible is already
    // selected, clicking clears; otherwise it selects.
    const entries = visibleMediaLibraryEntries();
    const allSelected = entries.length > 0 && entries.every((entry) => state.mediaLibrarySelected.has(entry.key));
    if (allSelected) {
      for (const entry of entries) state.mediaLibrarySelected.delete(entry.key);
    } else {
      for (const entry of entries) state.mediaLibrarySelected.add(entry.key);
    }
    const button = document.querySelector('#mediaLibrarySelectAllButton');
    button.dataset.pressed = String(!allSelected);
    setButtonContent(button, 'list', 'Select/Deselect all');
    renderMediaLibrary();
  });
  document.querySelector('#mediaLibraryClearSelectionButton').addEventListener('click', () => {
    state.mediaLibrarySelected.clear();
    renderMediaLibrary();
  });
  document.querySelector('#mediaLibraryScanButton').addEventListener('click', () => { scanMediaFaces(); });
  document.querySelector('#mediaLibraryProfileReviewButton').addEventListener('click', openProfileImageReview);
  // Card and table are two views of the same filtered, sorted page of files.
  const viewStyleKey = 'kinship-atlas:media-library-view:v1';
  try { if (localStorage.getItem(viewStyleKey) === 'table') state.mediaLibraryView = 'table'; } catch { }
  syncMediaLibraryViewButtons();
  elements.mediaLibraryCardsButton.addEventListener('click', () => {
    setMediaLibraryView('cards');
    try { localStorage.setItem(viewStyleKey, 'cards'); } catch { }
    elements.mediaLibraryCardsButton.focus();
  });
  elements.mediaLibraryTableButton.addEventListener('click', () => {
    setMediaLibraryView('table');
    try { localStorage.setItem(viewStyleKey, 'table'); } catch { }
    elements.mediaLibraryTableButton.focus();
  });
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
    const chooseHero = event.target.closest('[data-choose-hero-image]');
    if (chooseHero) {
      openHeroImageChooser(chooseHero.dataset.chooseHeroImage);
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
      openRelativeEditor(addRelationButton.dataset.addRelation,
        addRelationButton.dataset.parentRole, addRelationButton.dataset.parentFamilyId);
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
      openRelativeEditor();
      return;
    }
    const addButton = event.target.closest('button[data-add-media-for]');
    if (addButton) {
      state.pendingPortraitReplacement = null;
      state.pendingUploadPersonId = addButton.dataset.addMediaFor;
      elements.mediaUploadInput.accept = 'image/*,.pdf,application/pdf';
      elements.mediaUploadInput.click();
      return;
    }
    const researchButton = event.target.closest('button[data-public-records-search]');
    if (researchButton) {
      const person = state.people.get(researchButton.dataset.publicRecordsSearch);
      if (!person) return;
      openPublicRecordsDialog(person);
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
    const openFolderButton = event.target.closest('button[data-open-media-folder-for]');
    if (openFolderButton) {
      openPersonMediaFolderInExplorer(openFolderButton.dataset.openMediaFolderFor);
      return;
    }
    const button = event.target.closest('button[data-person-id]');
    if (button) setFocus(button.dataset.personId);
  });
  elements.mediaUploadInput.addEventListener('change', (event) => {
    saveUploadedMedia([...(event.target.files || [])]).catch((error) => {
      console.error('The media upload stopped unexpectedly.', error);
      showToast('The media files could not be saved.');
    });
    elements.mediaUploadInput.accept = 'image/*,.pdf,application/pdf';
  });
  elements.mediaUploadInput.addEventListener('cancel', () => {
    state.pendingUploadPersonId = null;
    state.pendingPortraitReplacement = null;
    elements.mediaUploadInput.accept = 'image/*,.pdf,application/pdf';
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
    showModalFocused(document.querySelector('#personDeleteConfirmDialog'));
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
    showModalFocused(document.querySelector('#eventMediaDeleteConfirmDialog'));
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
    saveLifeEvent(true).catch(() => {});
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
  elements.addRelativeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!await createRelativeRecord() && document.querySelector('#relativeDuplicateWarning').hidden
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
  elements.researchDialog.addEventListener('close', () => {
    state.pendingResearchPersonId = null;
  });
  // ESC is native to <dialog>; also wire the explicit close button and focus
  // the Search All button each time the dialog opens.
  document.querySelector('.public-records-close')?.addEventListener('click', () => {
    elements.researchDialog.close();
  });
  document.querySelector('#searchAllPublicRecords')?.addEventListener('click', () => {
    searchAllProviders();
  });
  document.querySelector('#publicRecordsProviders')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-provider-search]');
    if (button) searchOneProvider(button.dataset.providerSearch);
  });
  elements.researchDialog.addEventListener('open', () => {
    document.querySelector('#searchAllPublicRecords')?.focus();
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
  elements.printMapButton.addEventListener('click', () => printSection(state.pedigreeMode ? 'pedigree' : 'map'));

  // A4 landscape with 12 mm margins leaves about 273 x 186 mm, i.e. roughly 1030 x 700 CSS px.
  const printPageWidth = 1030;
  const printPageHeight = 700;
  const mmToPx = 96 / 25.4;
  let printCleanup = null;

  // Measure the map heading, summary line and print footer at print width so the map gets only the height left on one page.
