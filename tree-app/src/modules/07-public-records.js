  // ---------------------------------------------------------------------------
  // 7. Search Public Records (multi-provider external lookups)
  // ---------------------------------------------------------------------------

  // Providers themselves live in public-records.js; this layer owns only the UI.
  const PUBLIC_RECORD_PROVIDER_NAMES = {
    openArchives: 'Open Archives',
    wikitree: 'WikiTree',
    europeana: 'Europeana',
    dpla: 'DPLA',
    internetArchive: 'Internet Archive',
    findAGrave: 'Find a Grave'
  };
  // Manual-search fallbacks shown in each provider card's empty state.
  const PUBLIC_RECORD_HOME_LINKS = {
    openArchives: 'https://www.openarchieven.nl/',
    wikitree: 'https://www.wikitree.com/wiki/Special:SearchPerson',
    europeana: 'https://www.europeana.eu/en',
    dpla: 'https://dp.la/',
    internetArchive: 'https://archive.org/',
    findAGrave: 'https://www.findagrave.com/memorial/search'
  };

  function publicRecordPersonDates(person) {
    const birth = yearFrom(person.events.find((event) => event.type === 'BIRT')?.date);
    const death = yearFrom(person.events.find((event) => event.type === 'DEAT')?.date);
    return birth || death ? `${birth || '?'}\u2013${death || '?'}` : '';
  }

  function setSearchIndicator(button, status) {
    const indicator = button?.nextElementSibling;
    if (!indicator?.classList.contains('public-record-search-indicator')) return;
    indicator.classList.remove('is-results', 'is-empty', 'is-searching');
    indicator.textContent = '';
    indicator.removeAttribute('aria-label');
    indicator.removeAttribute('title');
    if (status === 'results') {
      indicator.classList.add('is-results');
      indicator.textContent = '✓';
      indicator.setAttribute('aria-label', 'Results found');
      indicator.title = 'Results found';
    } else if (status === 'empty') {
      indicator.classList.add('is-empty');
      indicator.textContent = '✕';
      indicator.setAttribute('aria-label', 'No results found');
      indicator.title = 'No results found';
    } else if (status === 'searching') {
      indicator.classList.add('is-searching');
      indicator.textContent = '…';
      indicator.setAttribute('aria-label', 'Searching');
    }
  }

  function setProviderStatus(card, status, message = '') {
    const statusEl = card.querySelector('.public-record-status');
    const list = card.querySelector('.public-record-results');
    const searchButton = card.querySelector('[data-provider-search]');
    setSearchIndicator(searchButton, status === 'results' || status === 'empty' || status === 'searching' ? status : '');
    statusEl.classList.remove('is-ready', 'is-searching', 'is-results', 'is-empty', 'is-error');
    statusEl.classList.add(`is-${status}`);
    if (status === 'searching') {
      statusEl.replaceChildren();
      const spinner = document.createElement('span');
      spinner.className = 'public-record-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      statusEl.append(spinner, document.createTextNode(' Searching…'));
    } else if (status === 'results') statusEl.textContent = message || 'Results found';
    else if (status === 'empty') {
      statusEl.replaceChildren();
      statusEl.append(document.createTextNode('No results found '));
      const providerId = card.dataset.providerId;
      const fallbackUrl = PUBLIC_RECORD_HOME_LINKS[providerId];
      if (fallbackUrl) {
        const link = document.createElement('a');
        link.href = fallbackUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Search ${PUBLIC_RECORD_PROVIDER_NAMES[providerId] || providerId} manually`;
        statusEl.append(link);
      }
    }
    else if (status === 'error') statusEl.textContent = `Unable to retrieve results from this service.${message ? ` ${message}` : ''}`;
    else statusEl.textContent = 'Ready';
    list.replaceChildren();
  }

  function renderPublicRecordResults(card, results) {
    const list = card.querySelector('.public-record-results');
    for (const result of results) {
      const item = document.createElement('div');
      item.className = 'public-record-item';
      const title = document.createElement('div');
      title.className = 'public-record-item-title';
      title.textContent = result.title;
      const provider = document.createElement('div');
      provider.className = 'public-record-item-provider';
      provider.textContent = result.service;
      const description = document.createElement('div');
      description.className = 'public-record-item-description';
      if (result.description) description.textContent = result.description;
      const link = document.createElement('a');
      link.className = 'public-record-item-link';
      const check = window.KinshipPublicRecords.validateExternalUrl(result.url);
      if (check.isValid) {
        link.href = check.normalizedUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View Source';
        link.setAttribute('aria-label', `View source on ${result.service}: ${result.title}`);
      } else {
        // No valid source URL (e.g. isShownAt missing): plain text instead of a
        // link that would silently resolve to the page itself.
        const span = document.createElement('span');
        span.className = 'public-record-item-link';
        span.textContent = 'Source record URL unavailable';
        item.append(title, provider, description, span);
        list.append(item);
        continue;
      }
      item.append(title, provider, description, link);
      list.append(item);
    }
  }

  function buildPublicRecordCards() {
    const providers = window.KinshipPublicRecords.PROVIDERS;
    const host = document.querySelector('#publicRecordsProviders');
    host.replaceChildren();
    for (const provider of providers) {
      const card = document.createElement('div');
      card.className = 'public-record-card';
      card.dataset.providerId = provider.id;
      const head = document.createElement('div');
      head.className = 'public-record-head';
      const name = document.createElement('div');
      name.className = 'public-record-name';
      name.textContent = provider.name;
      const note = document.createElement('div');
      note.className = 'public-record-note';
      note.textContent = provider.note;
      const searchButton = makeButton('Search', 'research-button public-record-search');
      searchButton.dataset.providerSearch = provider.id;
      searchButton.title = `Search ${provider.name} for this person`;
      const searchRow = document.createElement('div');
      searchRow.className = 'public-record-search-row';
      const searchIndicator = document.createElement('span');
      searchIndicator.className = 'public-record-search-indicator';
      searchIndicator.setAttribute('aria-live', 'polite');
      searchIndicator.setAttribute('aria-hidden', 'true');
      searchRow.append(searchButton, searchIndicator);
      head.append(name, note, searchRow);
      const status = document.createElement('div');
      status.className = 'public-record-status is-ready';
      status.setAttribute('role', 'status');
      status.textContent = 'Ready';
      const list = document.createElement('div');
      list.className = 'public-record-results';
      card.append(head, status, list);
      host.append(card);
    }
  }

  // One provider at a time; the modal streams results as each finishes.
  async function searchOneProvider(providerId) {
    const provider = window.KinshipPublicRecords.PROVIDERS.find((entry) => entry.id === providerId);
    const card = document.querySelector(`.public-record-card[data-provider-id="${providerId}"]`);
    if (!provider || !card) return;
    const person = state.people.get(state.pendingResearchPersonId);
    if (!person) return null;
    setProviderStatus(card, 'searching');
    const outcome = await window.KinshipPublicRecords.runProvider(provider, person);
    if (outcome.status === 'results' && outcome.results.length > 0) {
      setProviderStatus(card, 'results', `${outcome.results.length} result${outcome.results.length === 1 ? '' : 's'} found`);
      renderPublicRecordResults(card, outcome.results);
    } else if (outcome.status === 'empty' || outcome.status === 'results') {
      setProviderStatus(card, 'empty');
      outcome.status = 'empty';
    } else {
      setProviderStatus(card, 'error', outcome.errorMessage);
    }
    return outcome;
  }

  async function searchAllProviders() {
    const button = document.querySelector('#searchAllPublicRecords');
    setSearchIndicator(button, 'searching');
    const outcomes = await Promise.all(window.KinshipPublicRecords.PROVIDERS.map((provider) => searchOneProvider(provider.id)));
    const hasResults = outcomes.some((outcome) => outcome?.status === 'results' && outcome.results.length > 0);
    setSearchIndicator(button, hasResults ? 'results' : 'empty');
  }

  // Retained name: the search helpers still reference a normalised snapshot.
  function buildWikiTreeQuery(person) {
    return window.KinshipPublicRecords.normalisePerson(person);
  }

  // Opens the modal for a person: renders the provider cards fresh, resets all
  // statuses to Ready and shows the person's name and lifespan in the header.
  function openPublicRecordsDialog(person) {
    if (!person) return;
    state.pendingResearchPersonId = person.id;
    const nameEl = document.querySelector('#publicRecordsPersonName');
    const datesEl = document.querySelector('#publicRecordsPersonDates');
    if (nameEl) nameEl.textContent = person.name;
    if (datesEl) datesEl.textContent = publicRecordPersonDates(person);
    buildPublicRecordCards();
    const dialog = elements.researchDialog;
    if (dialog.open) return;
    dialog.showModal();
  }


  function countryFlagForPlace(place) {
    const normalized = ` ${String(place || '').toLocaleLowerCase().replace(/\u00df/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const match = countryFlagAliases.find(([alias]) => normalized.includes(` ${alias} `));
    if (!match) return null;
    const [, code, country, file = `${code.toLocaleLowerCase()}.svg`] = match;
    return { code: code.toLocaleLowerCase(), country, file };
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function sortedPeople(ids) {
    return [...new Set(ids)].map((id) => state.people.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function makeButton(text, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 4200);
  }

