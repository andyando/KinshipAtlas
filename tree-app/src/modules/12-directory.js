  // ---------------------------------------------------------------------------
  // 12. Directory, duplicate finder and birth-country suggestions
  // ---------------------------------------------------------------------------

  function birthPlaceOf(person) {
    return person.events.find((event) => event.type === 'BIRT')?.place || '';
  }

  function peopleWithoutBirthCountry() {
    return [...state.people.values()]
      .filter((person) => !countryFlagForPlace(birthPlaceOf(person)))
      .sort((a, b) => (a.surname || '').localeCompare(b.surname || '', undefined, { sensitivity: 'base' })
        || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  // ---------- Duplicate Finder ----------

  function duplicateScore(a, b) {
    let score = 0;
    if ((a.surname || '').trim() && (b.surname || '').trim()
      && a.surname.toLocaleLowerCase() === b.surname.toLocaleLowerCase()) score += 25;
    if ((a.givenName || '').trim() && (b.givenName || '').trim()
      && a.givenName.toLocaleLowerCase() === b.givenName.toLocaleLowerCase()) score += 15;
    if (a.name && b.name && a.name.toLocaleLowerCase() === b.name.toLocaleLowerCase()) {
      score = Math.max(score, 40);
    }
    const aBirth = a.events.find((e) => e.type === 'BIRT');
    const bBirth = b.events.find((e) => e.type === 'BIRT');
    if (aBirth && bBirth) {
      const aDate = (aBirth.date || '').trim();
      const bDate = (bBirth.date || '').trim();
      if (aDate && bDate && aDate === bDate) score += 20;
      else if (aDate && bDate && aDate.slice(-4) === bDate.slice(-4)) score += 10;
      const aPlace = (aBirth.place || '').trim();
      const bPlace = (bBirth.place || '').trim();
      if (aPlace && bPlace && aPlace.toLocaleLowerCase() === bPlace.toLocaleLowerCase()) score += 5;
    }
    const aDeath = a.events.find((e) => e.type === 'DEAT');
    const bDeath = b.events.find((e) => e.type === 'DEAT');
    if (aDeath && bDeath) {
      const aDate = (aDeath.date || '').trim();
      const bDate = (bDeath.date || '').trim();
      if (aDate && bDate && aDate === bDate) score += 20;
      else if (aDate && bDate && aDate.slice(-4) === bDate.slice(-4)) score += 10;
      const aPlace = (aDeath.place || '').trim();
      const bPlace = (bDeath.place || '').trim();
      if (aPlace && bPlace && aPlace.toLocaleLowerCase() === bPlace.toLocaleLowerCase()) score += 5;
    }
    if (a.sex && b.sex && a.sex === b.sex) score += 5;
    return score;
  }

  function findDuplicates(threshold) {
    const people = [...state.people.values()];
    const pairs = [];
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const score = duplicateScore(people[i], people[j]);
        if (score >= threshold) {
          pairs.push({ personA: people[i], personB: people[j], score });
        }
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    return pairs;
  }

  // Distinct relatives connected to a person (parents, partners and children combined).
  // `graph` is a shared kinshipGraph() so rendering many pairs stays cheap. The maps
  // omit people without links, so every lookup needs an empty-set fallback.
  function connectedPeopleCount(graph, personId) {
    const relatives = [
      ...(graph.parents.get(personId) || []),
      ...(graph.partners.get(personId) || []),
      ...(graph.children.get(personId) || [])
    ];
    return new Set(relatives.filter(Boolean)).size;
  }

  // Which of the two records a pair card currently marks for deletion ('' when none).
  function duplicateDeleteChoice(checkboxA, checkboxB) {
    if (checkboxA?.checked) return checkboxA.dataset.duplicateDelete;
    if (checkboxB?.checked) return checkboxB.dataset.duplicateDelete;
    return '';
  }

  function renderDuplicateFinder() {
    const list = document.querySelector('#duplicateFinderList');
    const threshold = Number(document.querySelector('#duplicateThreshold').value);
    const pairs = findDuplicates(threshold);
    const summary = document.querySelector('#duplicateFinderSummary');

    list.replaceChildren();

    if (pairs.length === 0) {
      summary.textContent = `No duplicate candidates found with a score of ${threshold} or higher.`;
      const empty = document.createElement('div');
      empty.className = 'duplicate-finder-empty';
      empty.textContent = 'Try lowering the minimum score threshold.';
      list.append(empty);
      updateDuplicateSelected();
      return;
    }

    summary.textContent = `${pairs.length} candidate pair${pairs.length === 1 ? '' : 's'} found.`;
    const graph = kinshipGraph();

    for (const pair of pairs) {
      const card = document.createElement('div');
      card.className = 'duplicate-pair';

      const heading = document.createElement('div');
      heading.className = 'duplicate-pair-heading';
      const scoreBadge = document.createElement('div');
      scoreBadge.className = `duplicate-pair-score is-${pair.score >= 75 ? 'high' : pair.score >= 50 ? 'medium' : 'low'}`;
      scoreBadge.textContent = `Match score ${pair.score}`;
      const prompt = document.createElement('div');
      prompt.className = 'duplicate-pair-prompt';
      prompt.textContent = 'These records may be the same person. Choose the one to delete:';
      heading.append(scoreBadge, prompt);
      card.append(heading);

      const checkboxById = {};
      for (const person of [pair.personA, pair.personB]) {
        const personDiv = document.createElement('div');
        personDiv.className = 'duplicate-pair-person';

        const deleteLabel = document.createElement('label');
        deleteLabel.className = 'duplicate-pair-delete-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'radio';
        checkbox.name = `duplicate-pair-${pair.personA.id}-${pair.personB.id}`;
        checkbox.dataset.duplicateDelete = person.id;
        checkbox.title = `Mark ${person.name} for deletion`;
        deleteLabel.append(checkbox, document.createTextNode('Delete this record'));
        checkboxById[person.id] = checkbox;

        // Optional merge: if this record is the one being deleted, move its
        // relationships, life events and media into the surviving record first.
        const other = person.id === pair.personA.id ? pair.personB : pair.personA;
        const mergeLabel = document.createElement('label');
        mergeLabel.className = 'duplicate-pair-merge-choice';
        const mergeBox = document.createElement('input');
        mergeBox.type = 'checkbox';
        mergeBox.dataset.duplicateMergeSource = person.id;
        mergeBox.dataset.duplicateMergeKeeper = other.id;
        // Disabled until the user picks this record for deletion; the change
        // handler above arms the matching box (and only that one).
        mergeBox.disabled = true;
        mergeBox.title = `Before deleting ${person.name}, move their relationships, life events and media into ${other.name}`;
        mergeLabel.append(mergeBox, document.createTextNode(`Merge this record's data into ${other.name} first`));

        const nameBtn = makeButton(person.name, 'duplicate-pair-name');
        nameBtn.dataset.personId = person.id;
        const facts = document.createElement('div');
        facts.className = 'duplicate-pair-detail';
        const parts = [];
        if (person.sex) parts.push(person.sex === 'M' ? 'Male' : 'Female');
        const yrs = lifespan(person);
        if (yrs) parts.push(yrs);
        const birth = person.events.find((e) => e.type === 'BIRT');
        const death = person.events.find((e) => e.type === 'DEAT');
        if (birth?.place) parts.push(`Born: ${birth.place}`);
        if (death?.place) parts.push(`Died: ${death.place}`);
        if (parts.length) facts.textContent = parts.join(' · ');
        const counts = document.createElement('div');
        counts.className = 'duplicate-pair-counts';
        counts.textContent = `${connectedPeopleCount(graph, person.id)} connected people · ${person.events.length} life event${person.events.length === 1 ? '' : 's'}`;

        personDiv.append(nameBtn, facts, counts, deleteLabel, mergeLabel);
        card.append(personDiv);
      }

      const checkboxA = checkboxById[pair.personA.id];
      const checkboxB = checkboxById[pair.personB.id];

      // Clicking anywhere on the card selects the first record for deletion;
      // clicking it again clears the choice. Radios and the merge checkboxes
      // still let the user pick the other record or enable the merge option.
      card.addEventListener('click', (event) => {
        if (event.target.closest('label')) return;
        const current = duplicateDeleteChoice(checkboxA, checkboxB);
        checkboxA.checked = !current;
        checkboxB.checked = false;
        card.classList.toggle('is-selected', checkboxA.checked);
        updateDuplicateSelected();
      });

      card.addEventListener('change', () => {
        // Only the chosen record's merge box can be armed.
        const chosen = duplicateDeleteChoice(checkboxA, checkboxB);
        for (const box of card.querySelectorAll('input[data-duplicate-merge-source]')) {
          if (box.dataset.duplicateMergeSource !== chosen) box.checked = false;
          box.disabled = box.dataset.duplicateMergeSource !== chosen;
        }
        card.classList.toggle('is-selected', Boolean(chosen));
        updateDuplicateSelected();
      });

      list.append(card);
    }

    updateDuplicateSelected();
  }

  function updateDuplicateSelected() {
    const selected = document.querySelectorAll('#duplicateFinderList input[data-duplicate-delete]:checked');
    const count = selected.length;
    const merged = document.querySelectorAll('#duplicateFinderList input[data-duplicate-merge-source]:checked').length;
    const label = document.querySelector('#duplicateFinderSelected');
    const deleteButton = document.querySelector('#deleteDuplicatesButton');
    label.textContent = count
      ? `${count} record${count > 1 ? 's' : ''} selected for deletion${merged ? ` · ${merged} will merge first` : ''}`
      : '';
    deleteButton.disabled = !count;
    if (!count) {
      deleteButton.dataset.confirm = '';
      deleteButton.textContent = 'Delete selected duplicates';
      document.querySelector('#duplicateDeleteConfirm')?.remove();
    }
  }

  function openDuplicateFinder() {
    const dialog = document.querySelector('#duplicateFinderDialog');
    renderDuplicateFinder();
    dialog.showModal();
  }

  function closeDuplicateFinder() {
    const dialog = document.querySelector('#duplicateFinderDialog');
    const confirm = document.querySelector('#duplicateDeleteConfirm');
    if (confirm) confirm.remove();
    const deleteBtn = document.querySelector('#deleteDuplicatesButton');
    deleteBtn.dataset.confirm = '';
    deleteBtn.textContent = 'Delete selected duplicates';
    dialog.close();
  }

  // ---------- Duplicate Relationship Finder ----------

  // Scans FAM records for duplicated links within the same family:
  //   - a child listed more than once (repeated 1 CHIL lines, or a FAMC back
  //     reference on the child that repeats the same family),
  //   - the same person recorded as both HUSB and WIFE (self marriage),
  //   - a person pointing at the same spouse family with repeated 1 FAMS lines,
  //   - a child pointing at the same parent family with repeated 1 FAMC lines,
  //   - a child linked to the same parent through two different family records
  //     (e.g. FAMC @F21@ and FAMC @F701@ that both name the same father).
  // Each finding is one removable line or redundant back reference; deleting it
  // never removes the person's only connection, because at least one identical
  // link always remains.
  function findDuplicateRelationships() {
    const findings = [];
    const personNameOf = (id) => state.people.get(id)?.name || `@${id}@`;
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'FAM') continue;
      const lines = record.lines;
      const familyLabel = (id) => {
        const family = state.families.get(record.xref);
        if (!family) return `family @${record.xref}@`;
        const spouseIds = [family.husbandId, family.wifeId].filter(Boolean);
        return spouseIds.map(personNameOf).join(' & ') || `family @${record.xref}@`;
      };
      // Repeated 1 CHIL lines within one family record.
      const childCounts = new Map();
      for (let index = 1; index < lines.length; index += 1) {
        const field = parseGedcomField(lines[index]);
        if (field?.level === 1 && field.tag === 'CHIL') {
          const childId = splitXref(field.value);
          if (!childId) continue;
          childCounts.set(childId, (childCounts.get(childId) || 0) + 1);
          if (childCounts.get(childId) > 1) {
            findings.push({
              kind: 'child', recordXref: record.xref, lineIndex: index, personId: childId, otherId: record.xref,
              description: `${personNameOf(childId)} is listed as a child of ${familyLabel()} more than once in family @${record.xref}@.`
            });
          }
        }
      }
      const family = state.families.get(record.xref);
      const husbandId = family?.husbandId || '';
      const wifeId = family?.wifeId || '';
      // The same person recorded as both spouses of the family.
      if (husbandId && husbandId === wifeId) {
        findings.push({
          kind: 'self-spouse', recordXref: record.xref, lineIndex: -1, personId: husbandId, otherId: husbandId,
          description: `${personNameOf(husbandId)} is recorded as both the husband and the wife of family @${record.xref}@.`
        });
      }
      // The same spouse appears in two family records with the identical pair.
      if (husbandId && wifeId && husbandId !== wifeId) {
        for (const other of state.gedcomRecords) {
          if (other === record || other.tag !== 'FAM' || other.xref < record.xref) continue;
          const otherFamily = state.families.get(other.xref);
          if (!otherFamily) continue;
          const samePair = (otherFamily.husbandId === husbandId && otherFamily.wifeId === wifeId) ||
            (otherFamily.husbandId === wifeId && otherFamily.wifeId === husbandId);
          if (!samePair) continue;
          const sameChildren = otherFamily.childIds.length === family.childIds.length &&
            otherFamily.childIds.every((id) => family.childIds.includes(id)) &&
            family.childIds.every((id) => otherFamily.childIds.includes(id));
          if (!sameChildren) continue;
          findings.push({
            kind: 'family-copy', recordXref: other.xref, lineIndex: -1, personId: husbandId, otherId: wifeId,
            description: `Families @${record.xref}@ and @${other.xref}@ record the same couple ${personNameOf(husbandId)} & ${personNameOf(wifeId)} with the same children. Deleting one whole family record keeps the other.`,
            wholeFamily: other.xref
          });
        }
      }
    }
    // Repeated 1 FAMS / 1 FAMC back references on person records.
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'INDI') continue;
      const lines = record.lines;
      const seen = new Map();
      for (let index = 1; index < lines.length; index += 1) {
        const field = parseGedcomField(lines[index]);
        if (field?.level !== 1 || (field.tag !== 'FAMS' && field.tag !== 'FAMC')) continue;
        const target = splitXref(field.value);
        if (!target) continue;
        const key = `${field.tag}|${target}`;
        seen.set(key, (seen.get(key) || 0) + 1);
        if (seen.get(key) > 1) {
          findings.push({
            kind: field.tag === 'FAMS' ? 'fams' : 'famc', recordXref: record.xref, lineIndex: index,
            personId: record.xref, otherId: target,
            description: `${personNameOf(record.xref)} points at family @${target}@ with a repeated ${field.tag} line.`
          });
        }
      }
    }
    // A child reachable from the same parent through two different parent
    // families is a duplicate parent link. Typically one FAM record is a stub
    // (father only) and the other the full family, as with Ancestry exports
    // that repeat "1 CHIL @I44@" under both @F21@ and @F701@ via FAMC.
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'INDI') continue;
      const famcLines = [];
      record.lines.forEach((line, index) => {
        const field = parseGedcomField(line);
        if (field?.level === 1 && field.tag === 'FAMC') {
          const target = splitXref(field.value);
          if (target) famcLines.push({ index, familyId: target });
        }
      });
      if (famcLines.length < 2) continue;
      // Group this person's parent families by each parent they name, so a
      // father-only stub family collapses onto the fuller family that names
      // the same father (plus a mother).
      const byParent = new Map();
      for (const entry of famcLines) {
        const family = state.families.get(entry.familyId);
        if (!family) continue;
        const parentIds = [family.husbandId, family.wifeId].filter((id) => id && id !== record.xref && state.people.has(id));
        for (const parentId of parentIds) {
          if (!byParent.has(parentId)) byParent.set(parentId, []);
          byParent.get(parentId).push({ ...entry, parentIds });
        }
      }
      // A parent named by two or more of this person's families is duplicated.
      const reported = new Set();
      for (const [parentId, group] of byParent) {
        if (group.length < 2) continue;
        // Keep the family that names the most parents (the full one); the
        // extra FAMC lines point at duplicate or stub family records.
        const ranked = [...group].sort((a, b) => b.parentIds.length - a.parentIds.length);
        const keeper = ranked[0];
        for (const extra of ranked.slice(1)) {
          const extraFamily = state.families.get(extra.familyId);
          const keeperFamily = state.families.get(keeper.familyId);
          // When both family records explicitly list this child, the family-side
          // child-link detector below reports and removes the duplicate CHIL link.
          if (extraFamily?.childIds.includes(record.xref) && keeperFamily?.childIds.includes(record.xref)) continue;
          const key = `${extra.index}`;
          if (reported.has(key)) continue;
          reported.add(key);
          findings.push({
            kind: 'famc-duplicate-parent', recordXref: record.xref, lineIndex: extra.index,
            personId: record.xref, otherId: extra.familyId, keepFamilyId: keeper.familyId,
            description: `${personNameOf(record.xref)} is linked to ${personNameOf(parentId)} twice, through families @${keeper.familyId}@ and @${extra.familyId}@. Deleting the extra FAMC keeps the @${keeper.familyId}@ link.`
          });
        }
      }
    }
    // Some GEDCOM exports record a child's parent relationship only from the
    // FAM side (CHIL) and omit the child's FAMC back-reference. Find repeated
    // parent links by comparing those family-side child entries directly.
    const childFamilyEntries = new Map();
    for (const record of state.gedcomRecords) {
      if (record.tag !== 'FAM') continue;
      const family = state.families.get(record.xref);
      if (!family) continue;
      const familyParentIds = [...new Set([family.husbandId, family.wifeId]
        .filter((id) => id && state.people.has(id)))];
      if (!familyParentIds.length) continue;
      const seenChildren = new Set();
      record.lines.forEach((line, lineIndex) => {
        const field = parseGedcomField(line);
        const childId = field?.level === 1 && field.tag === 'CHIL' ? splitXref(field.value) : '';
        if (!childId || seenChildren.has(childId) || !state.people.has(childId)) return;
        seenChildren.add(childId);
        const parentIds = familyParentIds.filter((id) => id !== childId);
        if (!parentIds.length) return;
        if (!childFamilyEntries.has(childId)) childFamilyEntries.set(childId, []);
        childFamilyEntries.get(childId).push({ familyId: record.xref, parentIds, lineIndex });
      });
    }
    for (const [childId, entries] of childFamilyEntries) {
      if (entries.length < 2) continue;
      const ranked = [...entries].sort((a, b) => b.parentIds.length - a.parentIds.length);
      for (let index = 1; index < ranked.length; index += 1) {
        const extra = ranked[index];
        const keeper = ranked.slice(0, index).find((candidate) =>
          extra.parentIds.every((parentId) => candidate.parentIds.includes(parentId)));
        if (!keeper) continue;
        findings.push({
          kind: 'duplicate-parent-family-child', recordXref: extra.familyId, lineIndex: extra.lineIndex,
          personId: childId, otherId: extra.parentIds[0], keepFamilyId: keeper.familyId,
          description: `${personNameOf(childId)} is listed under ${extra.parentIds.map(personNameOf).join(' and ')} in both families @${keeper.familyId}@ and @${extra.familyId}@. Deleting the duplicate child link keeps the more complete @${keeper.familyId}@ family.`
        });
      }
    }
    return findings;
  }

  // Removes the duplicated link itself (one repeated line, or one whole
  // redundant copy family together with its back references) while leaving at
  // least one identical connection intact.
  function deleteDuplicateRelationship(findings) {
    // Group single-line deletions per record and apply them highest-index first
    // so earlier removals cannot shift later line numbers.
    const lineDeletions = new Map();
    const wholeFamilies = new Set();
    for (const finding of findings) {
      if (finding.kind === 'family-copy') {
        const record = state.gedcomRecords.find((entry) => entry.tag === 'FAM' && entry.xref === finding.wholeFamily);
        if (!record) continue;
        const family = state.families.get(finding.wholeFamily);
        const keeper = state.families.get(finding.recordXref);
        // Only delete the copy when it still holds the same couple so the other
        // family record continues to carry the relationship for everyone.
        if (!family || !keeper) continue;
        if (!((family.husbandId === keeper.husbandId && family.wifeId === keeper.wifeId) ||
          (family.husbandId === keeper.wifeId && family.wifeId === keeper.husbandId))) continue;
        wholeFamilies.add(finding.wholeFamily);
        continue;
      }
      const record = state.gedcomRecords.find((entry) => entry.xref === finding.recordXref);
      if (!record || finding.lineIndex < 0 || finding.lineIndex >= record.lines.length) continue;
      // A duplicate parent link stored on the family side must remove the
      // duplicate CHIL entry and any matching child-side FAMC pointers, while
      // preserving the fuller family and its relationship.
      if (finding.kind === 'duplicate-parent-family-child') {
        const duplicateFamily = state.families.get(finding.recordXref);
        const keeperFamily = state.families.get(finding.keepFamilyId);
        const duplicateRecord = record.tag === 'FAM' ? record : null;
        const keeperRecord = state.gedcomRecords.find((entry) => entry.tag === 'FAM' && entry.xref === finding.keepFamilyId);
        const parentIds = [duplicateFamily?.husbandId, duplicateFamily?.wifeId].filter((id) => id && id !== finding.personId && state.people.has(id));
        const keeperParentIds = [keeperFamily?.husbandId, keeperFamily?.wifeId].filter((id) => id && id !== finding.personId && state.people.has(id));
        const keeperHasChild = keeperRecord?.lines.some((line) => {
          const entry = parseGedcomField(line);
          return entry?.level === 1 && entry.tag === 'CHIL' && splitXref(entry.value) === finding.personId;
        });
        const target = parseGedcomField(record.lines[finding.lineIndex]);
        if (!duplicateRecord || !duplicateFamily || !keeperFamily || !keeperHasChild
          || !parentIds.length || !parentIds.every((id) => keeperParentIds.includes(id))
          || target?.level !== 1 || target.tag !== 'CHIL' || splitXref(target.value) !== finding.personId) continue;
        const childRecord = state.gedcomRecords.find((entry) => entry.tag === 'INDI' && entry.xref === finding.personId);
        const duplicateChildLines = duplicateRecord.lines.map((line, index) => ({ line, index })).filter(({ line }) => {
          const entry = parseGedcomField(line);
          return entry?.level === 1 && entry.tag === 'CHIL' && splitXref(entry.value) === finding.personId;
        });
        if (!duplicateChildLines.length) continue;
        if (!lineDeletions.has(duplicateRecord)) lineDeletions.set(duplicateRecord, new Set());
        duplicateChildLines.forEach(({ index }) => lineDeletions.get(duplicateRecord).add(index));
        if (childRecord) {
          const backReferences = childRecord.lines.map((line, index) => ({ line, index })).filter(({ line }) => {
            const entry = parseGedcomField(line);
            return entry?.level === 1 && entry.tag === 'FAMC' && splitXref(entry.value) === finding.recordXref;
          });
          if (backReferences.length) {
            if (!lineDeletions.has(childRecord)) lineDeletions.set(childRecord, new Set());
            backReferences.forEach(({ index }) => lineDeletions.get(childRecord).add(index));
          }
        }
        continue;
      }
      // A child linked to the same parent through two family records: the kept
      // FAMC line names a different family, so the identical-line rule below
      // does not apply. Verify the keeper line still exists before removing.
      if (finding.kind === 'famc-duplicate-parent') {
        const keeperFamilyId = finding.keepFamilyId;
        const keeperStillLinked = record.lines.some((line) => {
          const entry = parseGedcomField(line);
          return entry?.level === 1 && entry.tag === 'FAMC' && splitXref(entry.value) === keeperFamilyId;
        });
        if (!keeperStillLinked) continue;
        if (!lineDeletions.has(record)) lineDeletions.set(record, new Set());
        lineDeletions.get(record).add(finding.lineIndex);
        continue;
      }
      const field = parseGedcomField(record.lines[finding.lineIndex]);
      const expected = finding.kind === 'child' ? 'CHIL' : finding.kind === 'fams' ? 'FAMS' : finding.kind === 'famc' ? 'FAMC' : '';
      if (!expected || field?.level !== 1 || field.tag !== expected) continue;
      // Safety: a repeated link may only be removed while an identical level-1
      // line remains, so the person keeps that exact connection afterwards.
      const sameLines = record.lines.filter((line) => {
        const entry = parseGedcomField(line);
        return entry?.level === 1 && entry.tag === field.tag && entry.value === field.value;
      }).length;
      if (sameLines < 2) continue;
      if (!lineDeletions.has(record)) lineDeletions.set(record, new Set());
      lineDeletions.get(record).add(finding.lineIndex);
    }
    if (!lineDeletions.size && !wholeFamilies.size) return false;
    for (const [record, indexes] of lineDeletions) {
      const lines = [...record.lines];
      for (const index of [...indexes].sort((a, b) => b - a)) lines.splice(index, 1);
      record.lines = lines;
    }
    if (wholeFamilies.size) {
      // Drop the redundant family records plus every FAMS/FAMC back reference
      // pointing at them, so no dangling pointers remain. The surviving twin
      // family keeps the same couple and children connected.
      for (let index = state.gedcomRecords.length - 1; index >= 0; index -= 1) {
        const record = state.gedcomRecords[index];
        if (record.tag === 'FAM' && wholeFamilies.has(record.xref)) {
          state.gedcomRecords.splice(index, 1);
          continue;
        }
        if (record.tag !== 'INDI') continue;
        const matches = (field) => field?.level === 1 && (field.tag === 'FAMS' || field.tag === 'FAMC') && wholeFamilies.has(splitXref(field.value));
        if (record.lines.some((line) => matches(parseGedcomField(line)))) {
          record.lines = record.lines.filter((line) => !matches(parseGedcomField(line)));
        }
      }
    }
    reparseGedcomRecords();
    refreshAfterGedcomMutation(state.primaryPersonId || [...state.people.keys()][0] || '');
    return true;
  }

  // Findings from the most recent renderDuplicateRelations() so checkbox
  // selection can map back to the exact finding objects at delete time.
  let latestRelationFindings = [];

  function renderDuplicateRelations() {
    const list = document.querySelector('#duplicateRelationList');
    const summary = document.querySelector('#duplicateRelationSummary');
    const findings = findDuplicateRelationships();
    latestRelationFindings = findings;
    list.replaceChildren();
    document.querySelector('#duplicateRelationSelectAll').checked = false;
    if (!findings.length) {
      summary.textContent = 'No duplicate relationships found. Every person is connected to each parent and spouse once.';
      const empty = document.createElement('div');
      empty.className = 'duplicate-finder-empty';
      empty.textContent = 'Nothing to fix here.';
      list.append(empty);
      updateDuplicateRelationSelected();
      return;
    }
    summary.textContent = `${findings.length} duplicated link${findings.length === 1 ? '' : 's'} found. Deleting one copy always leaves the original connection in place.`;
    for (const finding of findings) {
      const row = document.createElement('div');
      row.className = 'duplicate-relation-row';
      const label = document.createElement('label');
      label.className = 'duplicate-relation-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.relationDelete = String(findings.indexOf(finding));
      checkbox.title = 'Mark this duplicate link for deletion';
      label.append(checkbox, document.createTextNode('Delete this duplicate link'));
      const text = document.createElement('div');
      text.className = 'duplicate-relation-detail';
      text.textContent = finding.description;
      row.append(label, text);
      list.append(row);
    }
    updateDuplicateRelationSelected();
  }

  function updateDuplicateRelationSelected() {
    const selected = document.querySelectorAll('#duplicateRelationList input[data-relation-delete]:checked');
    const count = selected.length;
    const label = document.querySelector('#duplicateRelationSelected');
    const deleteButton = document.querySelector('#deleteDuplicateRelationsButton');
    label.textContent = count ? `${count} duplicate link${count > 1 ? 's' : ''} selected for deletion` : '';
    deleteButton.disabled = !count;
    if (!count) {
      deleteButton.dataset.confirm = '';
      deleteButton.textContent = 'Delete selected duplicate links';
      document.querySelector('#duplicateRelationConfirm')?.remove();
    }
  }

  function openDuplicateRelationFinder() {
    if (!state.people.size) return;
    const dialog = document.querySelector('#duplicateRelationDialog');
    renderDuplicateRelations();
    dialog.showModal();
  }

  function closeDuplicateRelationFinder() {
    const dialog = document.querySelector('#duplicateRelationDialog');
    document.querySelector('#duplicateRelationConfirm')?.remove();
    const deleteBtn = document.querySelector('#deleteDuplicateRelationsButton');
    deleteBtn.dataset.confirm = '';
    deleteBtn.textContent = 'Delete selected duplicate links';
    dialog.close();
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

