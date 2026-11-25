  // ---------------------------------------------------------------------------
  // 18. Historical Gazetteer: offline resolution of historic place names
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

  // --- Tools > Historical Gazetteer -----------------------------------------
  // Search, add, edit, test-resolve and import/export the gazetteer tables.
  function openHistoricalGazetteerDialog() {
    if (!window.KINSHIP_HISTORICAL_GAZETTEER) {
      showToast('The historical gazetteer data file was not found next to the app.');
      return;
    }
    loadUserAliases();
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog gazetteer-dialog';
    dialog.innerHTML = `
      <header class="gazetteer-header">
        <h2>Historical Gazetteer</h2>
        <button type="button" class="dialog-close" aria-label="Close">&times;</button>
      </header>
      <p class="gazetteer-hint">Resolves historic place names (1700-1970) — former Prussian, Austro-Hungarian, Russian and British-isles spellings — onto modern map coordinates. Everything is stored and resolved on this device.</p>
      <div class="gazetteer-search-row">
        <input type="search" class="gazetteer-search" placeholder="Test resolve a place, e.g. Königsberg, East Prussia" aria-label="Place to resolve">
        <button type="button" class="dialog-button dialog-button-primary gazetteer-test">Test resolve</button>
      </div>
      <div class="gazetteer-result" hidden></div>
      <div class="gazetteer-tabs" role="tablist">
        <button type="button" class="dialog-button gazetteer-tab is-current" data-gazetteer-tab="places" role="tab" aria-selected="true">Historic places</button>
        <button type="button" class="dialog-button gazetteer-tab" data-gazetteer-tab="aliases" role="tab" aria-selected="false">Aliases</button>
        <button type="button" class="dialog-button gazetteer-tab" data-gazetteer-tab="regions" role="tab" aria-selected="false">Historic regions</button>
      </div>
      <div class="gazetteer-add-row">
        <input type="text" class="gazetteer-add-name" placeholder="Historic name (e.g. Lyck)" aria-label="Historic name">
        <input type="text" class="gazetteer-add-target" placeholder="Modern name or town (e.g. Elk)" aria-label="Modern name">
        <input type="number" class="gazetteer-add-lat" step="any" placeholder="Latitude" aria-label="Latitude">
        <input type="number" class="gazetteer-add-lon" step="any" placeholder="Longitude" aria-label="Longitude">
        <input type="text" class="gazetteer-add-region" placeholder="Region" aria-label="Historical region">
        <button type="button" class="dialog-button dialog-button-primary gazetteer-add">Add</button>
      </div>
      <p class="gazetteer-add-hint">Two names filled: adds an alias from the first to the second. Name plus coordinates: adds a historic place.</p>
      <div class="gazetteer-list" role="tabpanel"></div>
      <div class="dialog-actions">
        <button type="button" class="dialog-button gazetteer-export">Export JSON</button>
        <label class="dialog-button gazetteer-import-label" for="gazetteerImportInput">Import JSON
          <input id="gazetteerImportInput" type="file" accept=".json,application/json" hidden>
        </label>
        <button type="button" class="dialog-button dialog-button-quiet gazetteer-reload">Reload from data file</button>
      </div>
      <p id="gazetteerError" class="form-error" role="alert" hidden></p>
    `;
    const showError = (message) => {
      const box = dialog.querySelector('#gazetteerError');
      box.textContent = message;
      box.hidden = false;
    };
    const clearError = () => { dialog.querySelector('#gazetteerError').hidden = true; };
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector('.dialog-close').addEventListener('click', close);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });

    let currentTab = 'places';
    const list = dialog.querySelector('.gazetteer-list');
    const searchInput = dialog.querySelector('.gazetteer-search');
    const resultBox = dialog.querySelector('.gazetteer-result');

    const renderList = () => {
      const tables = historicalGazetteerTables();
      const filter = searchInput.value.trim().toLocaleLowerCase();
      const entries = Object.entries(tables[currentTab] || {})
        .filter(([name]) => !filter || name.toLocaleLowerCase().includes(filter) || JSON.stringify(tables[currentTab][name]).toLocaleLowerCase().includes(filter));
      list.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'gazetteer-empty';
        empty.textContent = filter ? 'No entries match the search.' : 'No entries yet.';
        list.append(empty);
        return;
      }
      for (const [name, entry] of entries) {
        const row = document.createElement('div');
        row.className = 'gazetteer-row';
        const label = document.createElement('span');
        label.className = 'gazetteer-row-name';
        label.textContent = name;
        const detail = document.createElement('span');
        detail.className = 'gazetteer-row-detail';
        detail.textContent = currentTab === 'aliases'
          ? `→ ${typeof entry === 'string' ? entry : JSON.stringify(entry)}`
          : `${entry.modernName || entry.historicalRegion || ''} · ${entry.latitude}, ${entry.longitude}${entry.country ? ` · ${entry.country}` : ''}`;
        const coordsButton = currentTab === 'aliases' ? null : (() => {
          const button = makeButton('', 'gazetteer-map');
          button.type = 'button';
          button.title = `Show "${name}" on the map site`;
          button.setAttribute('aria-label', button.title);
          setButtonContent(button, 'mapPin', '');
          button.addEventListener('click', () => {
            openLocationOnMap(`${entry.latitude},${entry.longitude}`);
          });
          return button;
        })();
        const editButton = makeButton('Edit', 'gazetteer-edit');
        editButton.type = 'button';
        editButton.addEventListener('click', () => {
          const nextLat = window.prompt(`New latitude for ${name}`, entry.latitude);
          if (nextLat === null) return;
          const nextLon = window.prompt(`New longitude for ${name}`, entry.longitude);
          if (nextLon === null) return;
          const lat = Number(nextLat);
          const lon = Number(nextLon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) { showError('Coordinates must be numbers.'); return; }
          if (currentTab === 'places') {
            editHistoricalPlace(name, { latitude: lat, longitude: lon });
            if (!window.KINSHIP_GAZETTEER_EDITS) window.KINSHIP_GAZETTEER_EDITS = {};
            window.KINSHIP_GAZETTEER_EDITS[name] = { latitude: lat, longitude: lon };
          }
          clearError();
          renderList();
          showToast(`Coordinates for ${name} updated for this session. Export JSON to keep them permanently.`);
        });
        row.append(label, detail);
        if (coordsButton) row.append(coordsButton);
        row.append(editButton);
        list.append(row);
      }
    };

    for (const tab of dialog.querySelectorAll('.gazetteer-tab')) {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.gazetteerTab;
        for (const other of dialog.querySelectorAll('.gazetteer-tab')) {
          other.classList.toggle('is-current', other === tab);
          other.setAttribute('aria-selected', String(other === tab));
        }
        renderList();
      });
    }
    searchInput.addEventListener('input', renderList);

    dialog.querySelector('.gazetteer-test').addEventListener('click', () => {
      const place = searchInput.value.trim();
      clearError();
      resultBox.hidden = true;
      if (!place) return;
      const started = performance.now();
      const result = resolveHistoricalPlace(place);
      const elapsed = Math.round(performance.now() - started);
      resultBox.hidden = false;
      if (!result) {
        resultBox.textContent = `No match for "${place}" (${elapsed} ms). Add it as a historic place or alias below.`;
        return;
      }
      resultBox.innerHTML = '';
      const line = document.createElement('div');
      line.textContent = `✓ ${result.label} — ${result.latitude}, ${result.longitude} (${result.country || 'no country'})${result.historicalRegion ? ` · ${result.historicalRegion}` : ''}${result.viaAlias ? ' · via alias' : ''}${result.fuzzyDistance ? ` · fuzzy match (distance ${result.fuzzyDistance})` : ''}`;
      line.className = 'gazetteer-result-line';
      const timing = document.createElement('div');
      timing.className = 'gazetteer-result-timing';
      timing.textContent = `${result.precision} · resolved in ${elapsed} ms`;
      resultBox.append(line, timing);
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); dialog.querySelector('.gazetteer-test').click(); }
    });

    dialog.querySelector('.gazetteer-add').addEventListener('click', () => {
      const name = dialog.querySelector('.gazetteer-add-name').value.trim();
      const target = dialog.querySelector('.gazetteer-add-target').value.trim();
      const lat = dialog.querySelector('.gazetteer-add-lat').value.trim();
      const lon = dialog.querySelector('.gazetteer-add-lon').value.trim();
      const region = dialog.querySelector('.gazetteer-add-region').value.trim();
      clearError();
      if (!name) { showError('Enter the historic name to add.'); return; }
      if (lat && lon) {
        if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) { showError('Coordinates must be numbers.'); return; }
        addHistoricalPlace(name, { modernName: target || name, country: '', latitude: lat, longitude: lon, historicalRegion: region });
        showToast(`${name} added to the historic places table.`);
      } else if (target) {
        addHistoricalAlias(name, target);
        showToast(`${name} → ${target} saved as an alias.`);
      } else {
        showError('Fill the modern name (for an alias) or both coordinates (for a historic place).');
        return;
      }
      for (const input of dialog.querySelectorAll('.gazetteer-add-row input')) input.value = '';
      renderList();
    });

    // Export writes the merged tables (built-in + user aliases + session edits).
    dialog.querySelector('.gazetteer-export').addEventListener('click', () => {
      const tables = historicalGazetteerTables();
      if (window.KINSHIP_GAZETTEER_EDITS) {
        for (const [name, edit] of Object.entries(window.KINSHIP_GAZETTEER_EDITS)) {
          if (tables.places[name]) Object.assign(tables.places[name], edit);
        }
      }
      const payload = JSON.stringify({
        historicalGazetteer: tables.places,
        placeAliases: tables.aliases,
        historicalRegions: tables.regions
      }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'historical-gazetteer-export.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    dialog.querySelector('#gazetteerImportInput').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      clearError();
      try {
        const parsed = JSON.parse(await file.text());
        const places = parsed.historicalGazetteer || parsed.places || {};
        const aliases = parsed.placeAliases || parsed.aliases || {};
        const regions = parsed.historicalRegions || parsed.regions || {};
        const data = window.KINSHIP_HISTORICAL_GAZETTEER;
        let added = 0;
        for (const [name, entry] of Object.entries(places)) {
          if (typeof entry?.latitude !== 'number') continue;
          data.places[name] = { modernName: entry.modernName || name, country: entry.country || '', latitude: entry.latitude, longitude: entry.longitude, historicalRegion: entry.historicalRegion || '', startYear: entry.startYear ?? null, endYear: entry.endYear ?? null };
          added += 1;
        }
        for (const [alias, target] of Object.entries(aliases)) {
          if (typeof target !== 'string') continue;
          historicalUserAliases[alias] = target;
          added += 1;
        }
        for (const [name, entry] of Object.entries(regions)) {
          if (typeof entry?.latitude !== 'number') continue;
          data.regions[name] = entry;
          added += 1;
        }
        saveUserAliases();
        rebuildHistoricalIndexes();
        renderList();
        showToast(`Imported ${added} gazetteer entries. Export JSON to keep them permanently.`);
      } catch (error) {
        showError(`The file could not be imported (${error.message}).`);
      }
    });

    dialog.querySelector('.gazetteer-reload').addEventListener('click', () => {
      // Reloading the script tag is not possible offline in a loaded page; the
      // honest reset is clearing user aliases and session edits.
      historicalUserAliases = {};
      saveUserAliases();
      window.KINSHIP_GAZETTEER_EDITS = {};
      rebuildHistoricalIndexes();
      renderList();
      showToast('User aliases and session coordinate edits cleared; built-in data restored.');
    });

    renderList();
    document.body.append(dialog);
    dialog.showModal();
  }

  // Public surface: map.js and future screens call these without reaching into
  // the bundle's internals.
  window.KinshipHistoricalGazetteer = {
    resolve: resolveHistoricalPlace,
    tables: historicalGazetteerTables,
    addAlias: addHistoricalAlias,
    addPlace: addHistoricalPlace,
    editPlace: editHistoricalPlace,
    openDialog: openHistoricalGazetteerDialog,
    setProvider: setPreferredMapProvider
  };
  loadUserAliases();
  buildHistoricalIndexes();
})();
