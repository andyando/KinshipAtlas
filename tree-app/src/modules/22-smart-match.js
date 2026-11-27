// ---------------------------------------------------------------------------
// 22. Smart file matching (suggest a person for an unlinked attachment)
// ---------------------------------------------------------------------------
// When a media folder is scanned, files that no GEDCOM record names are listed
// in the Media Library with no person link. Many of them plainly belong to
// someone: "Alfred Pasley Bell.txt", "Ada Allnutt [I455] - biography.docx".
//
// This module scores each unlinked file against the people in the tree and
// returns the best few suggestions. It is a suggestion only: nothing is linked
// until the user presses the button, which then uses the same person.mediaPaths
// link the rest of the app uses.
//
// Cost: names are normalised once per tree (indexed by every name word), and a
// file is only compared against the people who share a word with it, so a
// 100,000-person tree costs a few lookups per file rather than a full pass.

let smartMatchNameIndexCache = null;

// Lower-case, accent-folded words: "Alfred Pasley Bell.txt" -> ['alfred','pasley','bell'].
function smartMatchWords(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !/^\d+$/.test(word));
}

// People indexed by every word of their name and id, built once per tree.
function smartMatchNameIndex() {
  const cacheKey = `${state.people.size}:${state.families.size}:${state.gedcomDirty ? 'dirty' : 'clean'}`;
  if (smartMatchNameIndexCache?.key === cacheKey) return smartMatchNameIndexCache.index;
  const index = new Map();
  const add = (word, person) => {
    if (!word) return;
    if (!index.has(word)) index.set(word, new Set());
    index.get(word).add(person);
  };
  for (const person of state.people.values()) {
    const words = new Set([
      ...smartMatchWords(person.givenName),
      ...smartMatchWords(person.surname),
      ...smartMatchWords(person.name)
    ]);
    for (const word of words) add(word, person);
    add(String(person.id || '').toLocaleLowerCase(), person);
  }
  smartMatchNameIndexCache = { key: cacheKey, index };
  return index;
}

// How strongly one file name points at one person, 0 when it does not.
//   full name in the file name   strongest
//   surname + any given name     strong
//   surname only                 moderate
//   one name word only           weak
//   GEDCOM id in the file name   strong on its own
function smartMatchScore(fileName, person) {
  const fileText = ` ${smartMatchWords(fileName).join(' ')} `;
  const id = String(person.id || '').toLocaleLowerCase();
  let score = 0;
  if (id && fileText.includes(` ${id} `)) score += 60;
  const fullName = smartMatchWords(person.name).join(' ');
  if (fullName && fullName.length > 3 && fileText.includes(` ${fullName} `)) score += 70;
  const given = smartMatchWords(person.givenName);
  const surname = smartMatchWords(person.surname);
  if (surname.length && surname.every((word) => fileText.includes(` ${word} `))) {
    score += 35;
    if (given.length && given.some((word) => fileText.includes(` ${word} `))) score += 30;
  }
  // A file that merely shares a word ("Bell") is only worth mentioning when the
  // word is distinctive: the index tells us how many people carry it.
  if (!score) {
    const shared = [...new Set(smartMatchWords(fileName))].filter((word) => smartMatchNameIndex().get(word)?.has(person));
    if (shared.length) score += 8 * shared.length;
  }
  return score;
}

// The best suggestions for one file: [{ person, score }], strongest first.
function smartMatchSuggestions(fileName, limit = 3) {
  if (!state.people.size) return [];
  const index = smartMatchNameIndex();
  const candidates = new Set();
  for (const word of new Set(smartMatchWords(fileName))) {
    for (const person of index.get(word) || []) candidates.add(person);
  }
  const scored = [];
  for (const person of candidates) {
    const score = smartMatchScore(fileName, person);
    if (score >= 30) scored.push({ person, score });
  }
  scored.sort((left, right) => right.score - left.score || left.person.name.localeCompare(right.person.name));
  // A tie at the top is not a suggestion worth making: two John Smiths are not
  // a better guess than none.
  if (scored.length > 1 && scored[0].score === scored[1].score) return [];
  return scored.slice(0, limit);
}

// Links a file to a person through the app's normal attachment link (shown on
// the person record and saved with the tree's selections). Returns true when
// the person now holds the file.
function linkAttachmentToPerson(personId, relativePath) {
  const person = state.people.get(personId);
  if (!person || !relativePath) return false;
  if (!person.mediaPaths.includes(relativePath)) person.mediaPaths.push(relativePath);
  const additional = state.additionalMedia.get(personId) || [];
  if (!additional.includes(relativePath)) {
    additional.push(relativePath);
    state.additionalMedia.set(personId, additional);
    saveAdditionalMedia();
  }
  state.mediaLibraryCache = null;
  state.mediaLibraryCacheKey = '';
  if (state.treeMaintenanceMode) renderTreeMaintenance();
  render();
  renderMediaLibrary();
  return true;
}

window.KinshipSmartMatch = {
  suggestions: smartMatchSuggestions,
  link: linkAttachmentToPerson,
  words: smartMatchWords
};
