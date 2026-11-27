// ---------------------------------------------------------------------------
// 22. Favourites (bookmarked people, and the Favourites page)
// ---------------------------------------------------------------------------
// A favourite is one person id plus the date it was added. Nothing is copied
// from the person record: the page reads names, dates and places from the tree
// as it stands, so an edit shows up here immediately and a GEDCOM reload keeps
// every favourite that still exists.
//
// Storage reuses the app's selections framework (readSelection/storeSelection),
// so favourites survive a refresh, a restart, the local helper and the
// selections file. Two shapes are accepted on read:
//
//   { favourites: [{ personId, addedDate }, ...] }   current
//   { favourites: ['I123', 'I456'] }                 older builds
//
// and both are migrated to the current shape on the next save, with no ids
// dropped. The sort choice rides in the same record, so it survives too.

const favouritesStorageKey = 'kinship-atlas:favourites:v1';
const favouritesSortOptions = new Set(['added-desc', 'added-asc', 'surname-asc', 'surname-desc', 'given-asc', 'given-desc', 'year-asc', 'year-desc']);
const favouritesDefaultSort = 'added-desc';

// personId -> addedDate (ISO string, or '' when the record predates dates).
let favouriteEntries = new Map();
let favouritesSort = favouritesDefaultSort;
let favouritesMode = false;
let favouritesLoaded = false;

// Accepts every shape a favourites record has ever had and returns
// [{ personId, addedDate }]. Unknown or malformed entries are skipped, never
// allowed to throw: a corrupt record must not stop the tree loading.
function normalizeFavouriteEntries(record) {
  const raw = record && typeof record === 'object' && !Array.isArray(record) ? record.favourites : record;
  if (!Array.isArray(raw)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of raw) {
    let personId = '';
    let addedDate = '';
    if (typeof item === 'string' || typeof item === 'number') {
      personId = String(item).trim();
    } else if (item && typeof item === 'object') {
      personId = String(item.personId ?? item.id ?? '').trim();
      addedDate = typeof item.addedDate === 'string' ? item.addedDate : '';
    }
    // GEDCOM ids are stored without the @ signs, matching state.people keys.
    personId = personId.replace(/^@|@$/g, '');
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    entries.push({ personId, addedDate });
  }
  return entries;
}

function loadFavourites() {
  let record = null;
  try { record = readSelection(favouritesStorageKey); } catch { record = null; }
  const entries = normalizeFavouriteEntries(record);
  favouriteEntries = new Map(entries.map((entry) => [entry.personId, entry.addedDate]));
  const savedSort = record && typeof record === 'object' && !Array.isArray(record) ? record.sort : '';
  favouritesSort = favouritesSortOptions.has(savedSort) ? savedSort : favouritesDefaultSort;
  favouritesLoaded = true;
  syncFavouritesControls();
}

function saveFavourites() {
  const record = {
    // Oldest first in storage; the page sorts for display.
    favourites: [...favouriteEntries.entries()].map(([personId, addedDate]) => ({ personId, addedDate: addedDate || null })),
    sort: favouritesSort
  };
  let saved = false;
  try { saved = storeSelection(favouritesStorageKey, record) !== false; } catch { saved = false; }
  return saved;
}

// Every favourites reader goes through here, so the record is always loaded
// before it is used (and only once per session).
function favouritesMap() {
  if (!favouritesLoaded) loadFavourites();
  return favouriteEntries;
}

function isFavourite(personId) {
  return favouritesMap().has(personId);
}

function favouriteCount() {
  return favouritesMap().size;
}

function favouritesCountText(count) {
  if (!count) return 'No favourite people';
  return `${count.toLocaleString()} favourite ${count === 1 ? 'person' : 'people'}`;
}

// Favourite people that still exist in the open tree, in tree order.
function favouritePeople() {
  const people = [];
  for (const personId of favouritesMap().keys()) {
    const person = state.people.get(personId);
    if (person) people.push(person);
  }
  return people;
}

function toggleFavourite(personId) {
  const person = state.people.get(personId);
  if (!person) return false;
  const favourites = favouritesMap();
  const removing = favourites.has(personId);
  if (removing) favourites.delete(personId);
  else favourites.set(personId, new Date().toISOString());
  const saved = saveFavourites();
  syncFavouritesControls();
  renderDetails();
  renderRoster();
  // The Favourites page is only rebuilt when it is the page on screen.
  if (favouritesMode) renderFavourites();
  const suffix = saved ? '' : ' This browser could not remember it after closing.';
  showToast(removing
    ? `${person.name} removed from favourites.${suffix}`
    : `${person.name} added to favourites.${suffix}`);
  return !removing;
}

// The heart on the person record, and any other control that shows state.
function syncFavouritesControls() {
  const selected = state.people.get(state.selectedId);
  for (const button of document.querySelectorAll('[data-favourite-toggle]')) {
    const personId = button.dataset.favouriteToggle;
    const on = isFavourite(personId);
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('is-favourite', on);
    button.title = on ? 'Remove this person from favourites' : 'Add this person to favourites';
    const label = button.querySelector('.favourite-toggle-label');
    if (label) label.textContent = on ? 'Remove Favourite' : 'Add to Favourites';
  }
  const count = document.querySelector('#favouritesCount');
  if (count) count.textContent = favouritesCountText(favouritePeople().length);
  const viewOption = document.querySelector('#viewSwitch option[value="favourites"]');
  if (viewOption) viewOption.textContent = favouriteCount() ? `Favourites (${favouriteCount().toLocaleString()})` : 'Favourites';
  if (selected && !document.querySelector('[data-favourite-toggle]')) renderDetails();
}

// ---------- Sorting ----------

function favouriteSurname(person) {
  return (person.surname || '').trim();
}

function favouriteGiven(person) {
  return (person.givenName || person.name || '').trim();
}

// The birth year as a number, or null when it is not recorded.
function favouriteBirthYear(person) {
  const birth = person.events?.find((event) => event.type === 'BIRT');
  const year = /(\d{4})/.exec(birth?.date || '')?.[1];
  return year ? Number(year) : null;
}

function compareFavourites(left, right, sort) {
  const direction = sort.endsWith('desc') ? -1 : 1;
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  if (sort.startsWith('added')) {
    // Missing dates (older records) sort as the oldest, so they gather at the
    // end of "newest first" rather than jumping to the top.
    const a = left.addedDate ? Date.parse(left.addedDate) || 0 : 0;
    const b = right.addedDate ? Date.parse(right.addedDate) || 0 : 0;
    if (a !== b) return (a - b) * direction;
    return byName(left.person.name, right.person.name);
  }
  if (sort.startsWith('surname')) {
    const primary = byName(favouriteSurname(left.person), favouriteSurname(right.person));
    if (primary) return primary * direction;
    const secondary = byName(favouriteGiven(left.person), favouriteGiven(right.person));
    if (secondary) return secondary * direction;
    return (favouriteBirthYear(left.person) ?? 9999) - (favouriteBirthYear(right.person) ?? 9999);
  }
  if (sort.startsWith('given')) {
    const primary = byName(favouriteGiven(left.person), favouriteGiven(right.person));
    if (primary) return primary * direction;
    return byName(favouriteSurname(left.person), favouriteSurname(right.person)) * direction;
  }
  if (sort.startsWith('year')) {
    const a = favouriteBirthYear(left.person);
    const b = favouriteBirthYear(right.person);
    // Unknown years always sit at the end, whichever direction is chosen.
    if (a === null && b === null) return byName(left.person.name, right.person.name);
    if (a === null) return 1;
    if (b === null) return -1;
    if (a !== b) return (a - b) * direction;
    return byName(left.person.name, right.person.name);
  }
  return byName(left.person.name, right.person.name);
}

// ---------- Rendering ----------

function favouritesElements() {
  return {
    view: document.querySelector('#favouritesView'),
    content: document.querySelector('#favouritesContent'),
    search: document.querySelector('#favouritesSearch'),
    sort: document.querySelector('#favouritesSort'),
    count: document.querySelector('#favouritesCount'),
    fileName: document.querySelector('#favouritesFileName')
  };
}

function renderFavourites() {
  const ui = favouritesElements();
  if (!ui.view || !ui.content) return;
  if (ui.sort && ui.sort.value !== favouritesSort) ui.sort.value = favouritesSort;
  if (ui.fileName) ui.fileName.textContent = state.fileName || '';
  if (!state.people.size) {
    if (ui.count) ui.count.textContent = favouritesCountText(0);
    ui.content.replaceChildren(favouritesEmptyState('Open a GEDCOM first: favourites are saved per tree.'));
    return;
  }
  const all = favouritePeople()
    .map((person) => ({ person, addedDate: favouritesMap().get(person.id) || '' }))
    .sort((left, right) => compareFavourites(left, right, favouritesSort));
  const query = normalizeDirectoryName((ui.search?.value || '').trim());
  const shown = query
    ? all.filter((entry) => normalizeDirectoryName(`${entry.person.name} ${entry.person.givenName} ${entry.person.surname} ${entry.person.id}`).includes(query))
    : all;
  if (ui.count) ui.count.textContent = all.length ? favouritesCountText(all.length) : favouritesCountText(0);

  ui.content.replaceChildren();
  if (!all.length) {
    ui.content.append(favouritesEmptyState());
    return;
  }
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'favourites-empty-note';
    empty.textContent = 'No favourite matches this search.';
    ui.content.append(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'favourites-grid';
  for (const entry of shown) grid.append(favouritesCard(entry));
  ui.content.append(grid);
}

function favouritesEmptyState(noteText = 'Add people using the Add to Favourites button on any person record.') {
  const box = document.createElement('div');
  box.className = 'favourites-empty';
  const heart = document.createElement('span');
  heart.className = 'favourites-empty-icon';
  heart.setAttribute('aria-hidden', 'true');
  heart.append(createButtonIcon('heart'));
  const heading = document.createElement('h2');
  heading.textContent = 'No favourites yet';
  const note = document.createElement('p');
  note.textContent = noteText;
  box.append(heart, heading, note);
  return box;
}

// One favourite card. The image, initials and lifespan come from the same
// helpers the directory and person record use, so a card never disagrees with
// the rest of the app.
function favouritesCard({ person, addedDate }) {
  const card = document.createElement('article');
  card.className = 'favourites-card';
  card.dataset.favouritePerson = person.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${person.name}`);
  if (person.id === state.selectedId) card.classList.add('is-selected');

  const media = document.createElement('div');
  media.className = 'favourites-card-media';
  const image = primaryImageFor(person);
  if (image) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = mediaThumbnailUrl(image.file) || mediaUrl(image.file);
    media.append(img);
  } else {
    const monogram = document.createElement('span');
    monogram.className = 'favourites-card-initials';
    // initials() is the app's own initials helper; the element is named
    // separately so it cannot shadow the function.
    monogram.textContent = initials(person.name);
    media.append(monogram);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'favourites-card-remove';
  remove.dataset.favouriteRemove = person.id;
  remove.title = `Remove ${person.name} from favourites`;
  remove.setAttribute('aria-label', `Remove ${person.name} from favourites`);
  remove.append(createButtonIcon('heart'));
  remove.addEventListener('click', (event) => {
    // Removing must not also open the person.
    event.stopPropagation();
    toggleFavourite(person.id);
  });
  media.append(remove);

  const body = document.createElement('div');
  body.className = 'favourites-card-body';
  const name = document.createElement('h2');
  name.className = 'favourites-card-name';
  name.textContent = person.name;
  name.title = person.name;
  body.append(name);

  const life = document.createElement('p');
  life.className = 'favourites-card-life';
  life.textContent = lifespan(person) || 'Dates not recorded';
  body.append(life);

  const birth = person.events?.find((event) => event.type === 'BIRT')?.place || '';
  if (birth) {
    const place = document.createElement('p');
    place.className = 'favourites-card-place';
    place.textContent = birth;
    place.title = birth;
    body.append(place);
  }

  const meta = document.createElement('p');
  meta.className = 'favourites-card-meta';
  const id = document.createElement('span');
  id.className = 'favourites-card-id';
  id.textContent = `@${person.id}@`;
  meta.append(id);
  if (addedDate) {
    const added = document.createElement('span');
    added.className = 'favourites-card-added';
    added.textContent = `Added ${favouritesDateLabel(addedDate)}`;
    meta.append(added);
  }
  body.append(meta);

  card.append(media, body);
  card.addEventListener('click', () => openFavouritePerson(person.id));
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openFavouritePerson(person.id);
  });
  return card;
}

function favouritesDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Selecting a card behaves exactly like choosing that person anywhere else:
// the tree view comes back with them focused and the person record filled in.
function openFavouritePerson(personId) {
  if (!state.people.has(personId)) return;
  setFavouritesMode(false);
  if (state.mapMode) setMapMode(false);
  setFocus(personId, true);
  renderDetails();
}

// ---------- Page mode ----------

function setFavouritesMode(on) {
  const ui = favouritesElements();
  if (!ui.view) return;
  if (on && !state.people.size) {
    showToast('Open a GEDCOM first: favourites are saved per tree.');
    return;
  }
  // The other full-page views must stand down first: each of them owns the
  // shell's visibility, so closing them is what makes leaving Favourites
  // restore the tree cleanly.
  if (on) {
    if (state.reportsMode) setReportsMode(false);
    if (state.mediaLibraryMode) setMediaLibraryMode(false);
    if (state.mapMode) setMapMode(false);
    if (state.treeMaintenanceMode) setTreeMaintenanceMode(false);
  }
  favouritesMode = Boolean(on);
  ui.view.hidden = !on;
  elements.appShell.hidden = Boolean(on);
  if (on) {
    renderFavourites();
    ui.view.scrollTop = 0;
    syncFavouritesControls();
  }
  syncViewSwitch();
}

function favouritesModeIsOn() {
  return favouritesMode;
}

// ---------- Wiring ----------

window.KinshipFavourites = {
  open: () => setFavouritesMode(true),
  close: () => setFavouritesMode(false),
  toggle: toggleFavourite,
  isFavourite,
  count: favouriteCount,
  refresh: renderFavourites,
  normalize: normalizeFavouriteEntries
};

const favouritesViewElement = document.querySelector('#favouritesView');
if (favouritesViewElement) {
  favouritesViewElement.querySelector('#favouritesBackButton')?.addEventListener('click', () => setFavouritesMode(false));
  favouritesViewElement.querySelector('#favouritesSearch')?.addEventListener('input', renderFavourites);
  favouritesViewElement.querySelector('#favouritesSort')?.addEventListener('change', (event) => {
    const value = event.target.value;
    favouritesSort = favouritesSortOptions.has(value) ? value : favouritesDefaultSort;
    saveFavourites();
    renderFavourites();
  });
}

// The record's heart, delegated from the details panel so a re-render cannot
// leave a stale listener behind.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-favourite-toggle]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFavourite(button.dataset.favouriteToggle);
});

// The favourites record is read as soon as the tree is known to the page.
loadFavourites();
