/* Kinship Atlas – Search Public Records providers.
 *
 * One integration per external service. Each provider receives a normalised
 * person snapshot and returns SearchPublicRecordItem[]; the modal renders them
 * as they arrive so a fast service never waits for a slow one.
 *
 * Request strategy (in order, per provider):
 *   1. Direct browser call to the provider API (works wherever CORS allows).
 *   2. If the call is CORS/network blocked, the same request is relayed through
 *      the Kinship Atlas backend at /api/public-records/{provider}, which holds
 *      the API keys server-side. No public proxy services are ever used.
 *   The fallback is invisible to the user: the card keeps showing "Searching…"
 *   until either path answers.
 *
 * Endpoints (kept in PROVIDER_CONFIG):
 *   Open Archives   https://api.openarchieven.nl/1.0/records/match.json
 *   WikiTree        https://api.wikitree.com/api.php (appId=KinshipAtlas);
 *                   on-site search page ignores URL parameters, so a plain
 *                   search-page link plus an explanatory message is shown.
 *   Europeana       https://api.europeana.eu/record/v2/search.json
 *   DPLA            https://api.dp.la/v2/items  (single `q` parameter)
 *   Internet Arch.  https://archive.org/advancedsearch.php (exact phrase)
 *   Find A Grave    no public API; the backend queries the memorial search
 *                   HTML for the result count, then the card links to it.
 */
(() => {
  'use strict';

  const PROVIDER_CONFIG = {
    wikitree: {
      appId: 'KinshipAtlas',
      endpoint: 'https://api.wikitree.com/api.php',
      searchEndpoint: 'https://www.wikitree.com/wiki/Special:SearchPerson'
    },
    // wskey/apiKey intentionally omitted: held server-side by the launcher
    // (launcher/KinshipAtlas.cs) and injected into relayed requests there.
    europeana: { endpoint: 'https://api.europeana.eu/record/v2/search.json' },
    dpla: { endpoint: 'https://api.dp.la/v2/items' },
    internetArchive: {
      searchEndpoint: 'https://archive.org/advancedsearch.php',
      metadataEndpoint: 'https://archive.org/metadata'
    },
    openArchives: { endpoint: 'https://api.openarchieven.nl/1.0/records' },
    findAGrave: { searchEndpoint: 'https://www.findagrave.com/memorial/search' }
  };

  const REQUEST_TIMEOUT_MS = 20000;
  const BACKEND_BASE = '/api/public-records';

  function normalisePerson(person) {
    const birth = person?.events?.find((event) => event.type === 'BIRT');
    const death = person?.events?.find((event) => event.type === 'DEAT');
    const year = (date) => {
      const match = String(date || '').match(/\b(\d{3,4})\b/);
      return match ? Number(match[1]) : null;
    };
    return {
      id: person?.id || '',
      fullName: (person?.name || '').trim(),
      surname: (person?.surname || '').trim(),
      givenName: (person?.givenName || '').trim(),
      birthYear: year(birth?.date),
      deathYear: year(death?.date)
    };
  }

  /* ------------------------ Shared URL validation ------------------------- */
  // Every result URL passes through validateExternalUrl before it is rendered.
  // Anything that is not a real http(s) address — relative fragments, "h",
  // localhost echoes of the dev server, javascript:/data: schemes — is dropped,
  // and the item falls back to the "Source record URL unavailable" text.
  const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

  function validateExternalUrl(url) {
    if (!url || typeof url !== 'string') return { isValid: false, error: 'Missing URL' };
    const trimmed = url.trim();
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { isValid: false, error: 'Not an absolute URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: `Unsupported protocol ${parsed.protocol}` };
    }
    if (!parsed.hostname) {
      return { isValid: false, error: 'No hostname' };
    }
    if (LOCAL_HOSTNAMES.has(parsed.hostname)) {
      return { isValid: false, error: 'Local address is not an external record' };
    }
    return { isValid: true, normalizedUrl: parsed.href };
  }

  /* ---------------------------- Query variations -------------------------- */
  // Query variations, most exact first. Providers pick whichever shapes fit.
  function buildQueries(person) {
    const name = person.fullName;
    const surname = person.surname;
    const initials = person.givenName.split(/\s+/)
      .filter(Boolean).map((part) => `${part[0].toUpperCase()}.`).join(' ');
    const queries = [name];
    if (person.givenName && surname) queries.push(`${person.givenName} ${surname}`);
    // Also the two-part form most catalogues index: first given name + surname.
    const firstGiven = person.givenName.split(/\s+/)[0];
    if (firstGiven && person.givenName.includes(' ') && surname) queries.push(`${firstGiven} ${surname}`);
    if (initials && surname) queries.push(`${initials} ${surname}`);
    if (person.birthYear && surname) queries.push(`"${name}" ${person.birthYear}`);
    if (person.birthYear && person.deathYear) queries.push(`${person.birthYear} ${person.deathYear}`);
    return [...new Set(queries)].filter(Boolean);
  }

  /* ------------------------------ Transport ------------------------------- */
  // Fetch with a timeout; network and CORS failures become Error('network').
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      throw error.name === 'AbortError'
        ? new Error('timeout')
        : new Error('network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url) {
    let response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error) {
      throw error; // 'timeout' or 'network'
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error('invalid_json');
    }
  }

  // Direct first, then the Kinship Atlas backend relay if the browser call was
  // blocked (CORS or network). Never surfaces proxy/CORS details to the user.
  // Keys for Europeana/DPLA live only in the backend; the direct attempt for
  // those providers is attempted keyless first and relies on the relay when it
  // is rejected, so nothing sensitive ships in this file.
  async function fetchProviderJson(providerPath, directUrl, buildBackendUrl) {
    try {
      return await fetchJson(directUrl);
    } catch (directError) {
      console.info(`[Search Public Records] direct call failed (${directError.message}); using Kinship Atlas backend relay for ${providerPath}.`);
      return fetchJson(buildBackendUrl());
    }
  }

  /* ---------------------------- Open Archives ---------------------------- */
  // Open Archieven match.json matches a person by full name + birth year and
  // returns the record URIs of the birth and death registrations found.
  async function searchOpenArchives(person) {
    const { endpoint } = PROVIDER_CONFIG.openArchives;
    if (!person.birthYear || !person.surname) return [];
    const url = `${endpoint}/match.json?name=${encodeURIComponent(person.fullName)}&birthyear=${person.birthYear}&lang=en`;
    const data = await fetchProviderJson(
      'open-archives', url,
      () => `${BACKEND_BASE}/open-archives?q=${encodeURIComponent(person.fullName)}&birthYear=${person.birthYear}`
    );
    const docs = data?.response?.docs || [];
    return docs.map((doc) => {
      const check = validateExternalUrl(doc.uri);
      return {
        service: 'Open Archives',
        title: `${doc.eventtype || 'Record'} — ${doc.sourcetype || 'archival record'}`,
        description: [doc.eventplace, doc.archive].filter(Boolean).join(', '),
        url: check.isValid ? check.normalizedUrl : '',
        sourceId: doc.uri ? doc.uri.split('/').pop() : ''
      };
    }).filter((item) => item.url);
  }

  /* ------------------------------ WikiTree ------------------------------- */
  // api.wikitree.com sends no CORS headers, and the on-site Special:SearchPerson
  // page ignores GET parameters (verified against the live site: the form is a
  // POST and arrives empty when opened with query-string fields). The API call
  // is attempted directly first, then relayed through the backend; if both fail
  // the card explains that WikiTree does not support deep-linked searches.
  async function searchWikiTree(person) {
    const { appId, endpoint, searchEndpoint } = PROVIDER_CONFIG.wikitree;
    const params = new URLSearchParams({
      action: 'searchPerson', appId,
      FirstName: person.givenName || person.fullName,
      LastName: person.surname || ''
    });
    if (person.birthYear) params.set('BirthDate', String(person.birthYear));
    const url = `${endpoint}?${params.toString()}`;
    let data = null;
    try {
      data = await fetchProviderJson(
        'wikitree', url,
        () => `${BACKEND_BASE}/wikitree?q=${encodeURIComponent(person.givenName || person.fullName)}&surname=${encodeURIComponent(person.surname || '')}&birthYear=${person.birthYear ?? ''}`
      );
    } catch (error) {
      console.info('[Search Public Records] WikiTree API unavailable:', error.message);
      return [{
        service: 'WikiTree',
        title: 'Open WikiTree search',
        description: 'Direct search links are not supported by WikiTree. Click to open WikiTree search.',
        url: searchEndpoint,
        sourceId: ''
      }];
    }
    const list = data?.matches || data?.['0']?.matches || [];
    const mapped = (Array.isArray(list) ? list : []).map((entry) => {
      const check = validateExternalUrl(`https://www.wikitree.com/wiki/${entry.Name || entry.name}`);
      return {
        service: 'WikiTree',
        title: entry.RealName || entry.BirthName || entry.FirstName || entry.Name || 'WikiTree profile',
        description: [
          entry.BirthDate && !/^0/.test(entry.BirthDate) ? `Born ${entry.BirthDate}` : '',
          entry.DeathDate && !/^0/.test(entry.DeathDate) ? `Died ${entry.DeathDate}` : ''
        ].filter(Boolean).join(', '),
        url: check.isValid ? check.normalizedUrl : '',
        sourceId: String(entry.Id ?? '')
      };
    }).filter((item) => item.url);
    if (mapped.length) return mapped;
    return [{
      service: 'WikiTree',
      title: 'Open WikiTree search',
      description: 'No API matches found. Click to open WikiTree search.',
      url: searchEndpoint,
      sourceId: ''
    }];
  }

  /* ------------------------------ Europeana ------------------------------ */
  async function searchEuropeana(person) {
    const { endpoint } = PROVIDER_CONFIG.europeana;
    const results = [];
    for (const query of buildQueries(person).slice(0, 2)) {
      const url = `${endpoint}?query=${encodeURIComponent(query)}&rows=20`;
      const data = await fetchProviderJson(
        'europeana', url,
        () => `${BACKEND_BASE}/europeana?q=${encodeURIComponent(query)}`
      );
      for (const item of data?.items || []) {
        const check = validateExternalUrl((item.guid || item.id || '').split('?')[0]);
        if (!check.isValid) continue;
        results.push({
          service: 'Europeana',
          title: Array.isArray(item.title) ? item.title.join(' · ') : item.title || 'Europeana record',
          description: [item.edmPlaceLabel?.def, item.year].filter(Boolean).join(', '),
          url: check.normalizedUrl,
          sourceId: item.id?.split('/').pop()
        });
      }
      if (results.length >= 40) break;
    }
    return results;
  }

  /* --------------------------------- DPLA -------------------------------- */
  // DPLA exposes a single `q` parameter — no FirstName/LastName/BirthYear
  // fields — so the person data is combined into it. Searches run in priority
  // order and stop at the first query that returns results:
  //   1. FirstName + Surname + BirthYear
  //   2. FirstName + Surname
  //   3. Surname + BirthYear
  //   4. Surname
  // Only `isShownAt` is a clickable record page; `object` and `mediaMaster`
  // are media files and are deliberately not used as record URLs. A missing or
  // invalid isShownAt renders "Source record URL unavailable" instead of a
  // broken link.
  function dplaQueries(person) {
    const { givenName, surname, birthYear } = person;
    const queries = [];
    if (givenName && surname) queries.push(`${givenName} ${surname}${birthYear ? ` ${birthYear}` : ''}`.trim());
    if (birthYear && surname && !(givenName && surname)) queries.push(`${surname} ${birthYear}`);
    if (surname) queries.push(surname);
    return [...new Set(queries)].filter(Boolean);
  }

  async function searchDpla(person) {
    const { endpoint } = PROVIDER_CONFIG.dpla;
    const queries = dplaQueries(person);
    if (!queries.length) return [];
    let docs = [];
    for (const query of queries) {
      const url = `${endpoint}?q=${encodeURIComponent(query)}&page_size=20`;
      const data = await fetchProviderJson(
        'dpla', url,
        () => `${BACKEND_BASE}/dpla?q=${encodeURIComponent(query)}`
      );
      docs = data?.docs || [];
      console.info('[Search Public Records] DPLA raw response:', { query, count: docs.length });
      if (docs.length) break;
    }
    return docs.map((doc) => {
      // isShownAt arrives as a string (older DPLA payloads) or as a 1-element
      // array — take the first element either way, never index the string.
      const shownAtRaw = doc.isShownAt;
      const shownAt = Array.isArray(shownAtRaw) ? shownAtRaw[0] : shownAtRaw;
      console.info('[Search Public Records] DPLA isShownAt detected:', shownAt);
      const check = validateExternalUrl(shownAt);
      console.info('[Search Public Records] DPLA recordUrl normalised:', check.isValid ? check.normalizedUrl : check.error);
      return {
        service: 'Digital Public Library of America',
        title: doc.sourceResource?.title?.[0] || doc.title?.[0] || 'DPLA record',
        description: doc.sourceResource?.description?.[0] || doc.sourceResource?.creator?.join?.(', ') || '',
        url: check.isValid ? check.normalizedUrl : '',
        urlInvalid: !check.isValid,
        sourceId: doc.id,
        dplaId: doc.id
      };
    });
  }

  /* --------------------------- Internet Archive --------------------------- */
  // Exact phrase only — bare-name queries match far too much unrelated text.
  async function searchInternetArchive(person) {
    const { searchEndpoint } = PROVIDER_CONFIG.internetArchive;
    if (!person.fullName) return [];
    const query = `title:"${person.fullName}"`;
    const url = `${searchEndpoint}?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=year&rows=20&output=json`;
    const data = await fetchProviderJson(
      'internet-archive', url,
      () => `${BACKEND_BASE}/internet-archive?q=${encodeURIComponent(query)}`
    );
    const docs = data?.response?.docs || [];
    return docs.map((doc) => {
      const check = validateExternalUrl(`https://archive.org/details/${doc.identifier}`);
      return {
        service: 'Internet Archive',
        title: doc.title || doc.identifier,
        description: doc.year ? String(doc.year) : '',
        url: check.isValid ? check.normalizedUrl : '',
        sourceId: doc.identifier
      };
    }).filter((item) => item.url);
  }

  /* ----------------------------- Find A Grave ----------------------------- */
  // No public API. The backend fetches the memorial search HTML and extracts
  // the result count so the card reports how many memorials matched, and the
  // item links to the same search for the user to open.
  function findAGraveSearchUrl(person) {
    const { searchEndpoint } = PROVIDER_CONFIG.findAGrave;
    const first = person.givenName.split(/\s+/)[0] || '';
    const params = new URLSearchParams();
    if (first) params.set('firstname', first);
    if (person.surname) params.set('lastname', person.surname);
    if (person.birthYear) {
      params.set('birthyear', String(person.birthYear));
      params.set('birthyearadj', 'exact');
    }
    return `${searchEndpoint}?${params.toString()}`;
  }

  async function searchFindAGrave(person) {
    const url = findAGraveSearchUrl(person);
    const params = url.split('?')[1] || '';
    let count = null;
    try {
      const response = await fetch(`${BACKEND_BASE}/findagrave?q=${encodeURIComponent(params)}`);
      if (response.ok) {
        const data = await response.json();
        count = typeof data.count === 'number' ? data.count : null;
      }
    } catch (error) {
      console.info('[Search Public Records] Find A Grave count unavailable:', error.message);
    }
    const label = count === null
      ? 'Search Find A Grave memorials'
      : `${count.toLocaleString()} matching memorial${count === 1 ? '' : 's'} found`;
    return [{
      service: 'Find A Grave',
      title: label,
      description: `${person.fullName} · ${person.birthYear ?? '?'}–${person.deathYear ?? '?'}`,
      url,
      sourceId: ''
    }];
  }

  const PROVIDERS = [
    { id: 'openArchives', name: 'Open Archives', run: searchOpenArchives, note: 'Dutch civil registration and church books' },
    { id: 'wikitree', name: 'WikiTree', run: searchWikiTree, note: 'Community-sourced shared family tree' },
    { id: 'europeana', name: 'Europeana', run: searchEuropeana, note: 'European cultural heritage collections' },
    { id: 'dpla', name: 'Digital Public Library of America', run: searchDpla, note: 'US archives, libraries and museums' },
    { id: 'internetArchive', name: 'Internet Archive', run: searchInternetArchive, note: 'Books, periodicals and archived records' },
    { id: 'findAGrave', name: 'Find A Grave', run: searchFindAGrave, note: 'Headstone and burial records' }
  ];

  async function runProvider(provider, person) {
    try {
      const snapshot = normalisePerson(person);
      const results = await provider.run(snapshot);
      return { provider, status: results.length ? 'results' : 'empty', results };
    } catch (error) {
      console.warn(`[Search Public Records] ${provider.name} failed:`, error);
      const message = error.message === 'timeout' ? 'Timed out.'
        : error.message === 'invalid_json' ? 'Unreadable response.'
          : error.message.startsWith('http_') ? `Service error (${error.message.slice(5)}).`
            : 'Unable to retrieve results from this service.';
      return { provider, status: 'error', results: [], errorMessage: message };
    }
  }

  window.KinshipPublicRecords = {
    PROVIDER_CONFIG,
    PROVIDERS,
    normalisePerson,
    buildQueries,
    dplaQueries,
    validateExternalUrl,
    runProvider,
    findAGraveSearchUrl,
    searchWikiTree,
    searchEuropeana,
    searchDpla,
    searchInternetArchive,
    searchOpenArchives,
    searchFindAGrave,
    fetchWithTimeout
  };
})();
