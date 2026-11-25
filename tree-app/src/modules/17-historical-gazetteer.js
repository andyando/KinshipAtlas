// ---------------------------------------------------------------------------
// 17. Historical Gazetteer: offline resolution of historic place names
// ---------------------------------------------------------------------------
// Resolves genealogy places from roughly 1700-1970 — former German/Prussian,
// Austro-Hungarian, Russian-empire and British-isles spellings — onto modern
// coordinates. Data comes from data/historical-gazetteer.js (window.
// KINSHIP_HISTORICAL_GAZETTEER), curated from the World Historical Gazetteer,
// Getty TGN and GeoNames alternate names, and stays editable from the Tools >
// Historical Gazetteer screen. Everything runs offline; each lookup is one
// map read after the index is built.

const historicalGazetteerData = () => window.KINSHIP_HISTORICAL_GAZETTEER || { places: {}, aliases: {}, regions: {} };

// Normalises a place string the way the alias table is spelled: case-folded,
// diacritics folded (Königsberg -> Konigsberg), punctuation ignored.
function normalizeHistoricalPlace(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(kingdom of|province of|duchy of|county of|co\.|free city of|city of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let historicalPlaceIndex = null;
let historicalAliasIndex = null;
let historicalRegionIndex = null;
let historicalFuzzyIndex = null;
let historicalLookupCache = new Map();
let historicalUserAliases = {};

// The user's own aliases (added in Tools > Historical Gazetteer) ride in the
// selections store so they survive restarts like every other preference.
function loadUserAliases() {
  try { historicalUserAliases = readSelection('kinship-atlas:historical-aliases') || {}; } catch { historicalUserAliases = {}; }
}

function saveUserAliases() {
  storeSelection('kinship-atlas:historical-aliases', historicalUserAliases);
}

function buildHistoricalIndexes() {
  const data = historicalGazetteerData();
  historicalPlaceIndex = new Map();
  for (const [name, entry] of Object.entries(data.places)) {
    historicalPlaceIndex.set(normalizeHistoricalPlace(name), entry);
  }
  historicalAliasIndex = new Map();
  for (const [alias, target] of Object.entries({ ...data.aliases, ...historicalUserAliases })) {
    const resolved = historicalPlaceIndex.get(normalizeHistoricalPlace(target))
      || (data.regions[target] ? null : null) || data.regions[normalizeHistoricalPlace(target)];
    historicalAliasIndex.set(normalizeHistoricalPlace(alias), { target, region: data.regions[normalizeHistoricalPlace(target)] || null });
  }
  historicalRegionIndex = new Map();
  for (const [name, entry] of Object.entries(data.regions)) {
    historicalRegionIndex.set(normalizeHistoricalPlace(name), entry);
  }
  // Fuzzy index: every known spelling (places + regions + alias keys) by its
  // normalised name, so an exact miss can still find the closest spelling.
  historicalFuzzyIndex = new Map();
  const addFuzzy = (name) => {
    const key = normalizeHistoricalPlace(name);
    if (!key || historicalFuzzyIndex.has(key)) return;
    historicalFuzzyIndex.set(key, name);
  };
  for (const name of Object.keys(data.places)) addFuzzy(name);
  for (const name of Object.keys(data.regions)) addFuzzy(name);
  for (const alias of Object.keys({ ...data.aliases, ...historicalUserAliases })) addFuzzy(alias);
}

function rebuildHistoricalIndexes() {
  historicalPlaceIndex = null;
  historicalLookupCache = new Map();
  buildHistoricalIndexes();
}

// A place string like "Königsberg, East Prussia" may carry several parts; the
// strongest result wins: an exact town beats an alias beats a region. Parts
// are tried last-to-first so trailing country/region text does not mask the
// town name, but the town (first part) wins when both match.
function resolveHistoricalPlace(placeText) {
  const raw = String(placeText || '').trim();
  if (!raw) return null;
  if (historicalLookupCache.has(raw)) return historicalLookupCache.get(raw);
  if (!historicalPlaceIndex) buildHistoricalIndexes();
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  let best = null;
  // Steps 1-3 run per comma part; the earliest (most specific) part wins.
  for (const part of parts) {
    const key = normalizeHistoricalPlace(part);
    if (!key) continue;
    let found = null;
    let kind = '';
    if (historicalPlaceIndex.has(key)) { found = historicalPlaceIndex.get(key); kind = 'town'; }
    else if (historicalAliasIndex.has(key)) {
      const hit = historicalAliasIndex.get(key);
      found = hit.region
        ? { modernName: hit.target, country: 'Historic Region', latitude: hit.region.latitude, longitude: hit.region.longitude, historicalRegion: hit.target, viaAlias: true }
        : null;
      kind = hit.region ? 'region-alias' : 'alias';
      if (!found && historicalPlaceIndex.get(normalizeHistoricalPlace(hit.target))) {
        found = { ...historicalPlaceIndex.get(normalizeHistoricalPlace(hit.target)), viaAlias: true };
      }
    }
    if (!found && historicalRegionIndex.has(key)) { found = { ...historicalRegionIndex.get(key), historicalRegion: part }; kind = 'region'; }
    if (found && !best) best = { ...found, matchedText: part, matchedKind: kind, viaAlias: found.viaAlias || kind === 'alias' };
    // Keep scanning: a later part that names an actual town outranks an
    // earlier region-only hit ("East Prussia, Königsberg" -> Königsberg).
    if (found && best && best.matchedKind !== 'town' && kind === 'town') best = { ...found, matchedText: part, matchedKind: kind, viaAlias: found.viaAlias || kind === 'alias' };
  }
  // Step 4: normalisation fixes spellings like "Co. Clare" -> "County Clare";
  // the indexes were already built normalised, so a miss here falls through
  // to fuzzy matching (step 6).
  if (!best) {
    const joined = normalizeHistoricalPlace(raw);
    if (historicalRegionIndex.has(joined)) best = { ...historicalRegionIndex.get(joined), matchedText: raw, matchedKind: 'region' };
  }
  if (!best) {
    const fuzzy = findHistoricalFuzzy(raw);
    if (fuzzy) {
      const key = normalizeHistoricalPlace(fuzzy.name);
      if (historicalPlaceIndex.has(key)) best = { ...historicalPlaceIndex.get(key), matchedText: fuzzy.name, matchedKind: 'fuzzy', viaAlias: fuzzy.distance > 0, fuzzyDistance: fuzzy.distance };
      else if (historicalRegionIndex.has(key)) best = { ...historicalRegionIndex.get(key), matchedText: fuzzy.name, matchedKind: 'fuzzy', viaAlias: fuzzy.distance > 0, fuzzyDistance: fuzzy.distance };
    }
  }
  const result = best ? {
    latitude: best.latitude,
    longitude: best.longitude,
    label: best.modernName || best.matchedText,
    historicalName: best.matchedText,
    historicalRegion: best.historicalRegion || '',
    country: best.country || '',
    precision: best.matchedKind === 'region' ? 'region' : 'city',
    source: 'historical-gazetteer',
    viaAlias: Boolean(best.viaAlias),
    fuzzyDistance: best.fuzzyDistance || 0,
    startYear: best.startYear ?? null,
    endYear: best.endYear ?? null
  } : null;
  if (historicalLookupCache.size > 2000) historicalLookupCache.clear();
  historicalLookupCache.set(raw, result);
  return result;
}

// Levenshtein distance capped at a small budget, so lookups stay fast even
// with a few thousand names.
function historicalEditDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

function findHistoricalFuzzy(placeText) {
  if (!historicalFuzzyIndex) buildHistoricalIndexes();
  const key = normalizeHistoricalPlace(placeText);
  if (!key || key.length < 4) return null;
  // The allowed distance grows with length: 1 typo in a short name, 2 in a
  // long one ("Schneidemuhl" vs "Schneidemühl" is already caught by
  // normalisation, so remaining fuzz is genuine spelling drift).
  const budget = key.length >= 9 ? 2 : 1;
  let bestName = '';
  let bestDistance = budget + 1;
  for (const name of historicalFuzzyIndex.keys()) {
    if (Math.abs(name.length - key.length) > budget) continue;
    const distance = historicalEditDistance(key, name, budget);
    if (distance < bestDistance || (distance === bestDistance && name.length === key.length)) {
      bestDistance = distance;
      bestName = name;
    }
  }
  return bestName && bestDistance <= budget ? { name: bestName, distance: bestDistance } : null;
}

// The three tables, in the shape the admin page edits and exports.
function historicalGazetteerTables() {
  return {
    places: { ...historicalGazetteerData().places },
    aliases: { ...historicalGazetteerData().aliases, ...historicalUserAliases },
    regions: { ...historicalGazetteerData().regions }
  };
}

function addHistoricalAlias(alias, target) {
  const cleanAlias = String(alias || '').trim();
  const cleanTarget = String(target || '').trim();
  if (!cleanAlias || !cleanTarget) return false;
  historicalUserAliases[cleanAlias] = cleanTarget;
  saveUserAliases();
  rebuildHistoricalIndexes();
  return true;
}

function addHistoricalPlace(name, entry) {
  const data = window.KINSHIP_HISTORICAL_GAZETTEER;
  if (!data || !String(name || '').trim()) return false;
  data.places[String(name).trim()] = {
    modernName: String(entry.modernName || name).trim(),
    country: String(entry.country || '').trim(),
    latitude: Number(entry.latitude),
    longitude: Number(entry.longitude),
    historicalRegion: String(entry.historicalRegion || '').trim(),
    startYear: entry.startYear === '' || entry.startYear == null ? null : Number(entry.startYear),
    endYear: entry.endYear === '' || entry.endYear == null ? null : Number(entry.endYear)
  };
  rebuildHistoricalIndexes();
  return true;
}

function editHistoricalPlace(name, entry) {
  const data = window.KINSHIP_HISTORICAL_GAZETTEER;
  const key = String(name || '').trim();
  if (!data || !data.places[key]) return false;
  data.places[key] = { ...data.places[key], ...entry };
  rebuildHistoricalIndexes();
  return true;
}
