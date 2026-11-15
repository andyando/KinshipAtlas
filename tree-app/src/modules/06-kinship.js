  // ---------------------------------------------------------------------------
  // 6. Kinship graph and relationship terms
  // ---------------------------------------------------------------------------

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

  function siblingFamiliesOf(personId) {
    const person = state.people.get(personId);
    const siblings = new Map();
    if (!person) return siblings;
    const parentFamilyIds = new Set(person.parentFamilyIds);
    const parentIds = new Set();
    for (const familyId of parentFamilyIds) {
      const family = state.families.get(familyId);
      for (const id of [family?.husbandId, family?.wifeId]) {
        if (id && state.people.has(id)) parentIds.add(id);
      }
    }
    for (const family of state.families.values()) {
      if (!parentFamilyIds.has(family.id)
        && ![family.husbandId, family.wifeId].some((id) => parentIds.has(id))) continue;
      for (const id of family.childIds) {
        if (id !== personId && state.people.has(id) && !siblings.has(id)) siblings.set(id, family.id);
      }
    }
    return siblings;
  }

  function siblingsOf(personId) {
    return [...siblingFamiliesOf(personId).keys()];
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
