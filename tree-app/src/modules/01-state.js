  // ---------------------------------------------------------------------------
  // 1. Constants and application state
  // ---------------------------------------------------------------------------

  const eventNames = {
    BIRT: 'Birth', DEAT: 'Death', BAPM: 'Baptism', CHR: 'Christening', BURI: 'Burial',
    CREM: 'Cremation', ADOP: 'Adoption', BARM: 'Bar Mitzvah', BASM: 'Bas Mitzvah',
    BLES: 'Blessing', CHRA: 'Adult Christening', CONF: 'Confirmation', FCOM: 'First Communion',
    RESI: 'Residence', IMMI: 'Immigration', EMIG: 'Emigration', NATU: 'Naturalization',
    CENS: 'Census', EDUC: 'Education', GRAD: 'Graduation', OCCU: 'Occupation', RETI: 'Retirement',
    MARR: 'Marriage', DIV: 'Divorce', MILT: 'Military', RELI: 'Religious',
    ORDN: 'Ordination', PROB: 'Probate', WILL: 'Will', SSN: 'Social Security Number', EVEN: 'Event'
  };
  const eventTags = new Set(Object.keys(eventNames));
  const countryFlagAliases = [
    ['new england', 'US', 'United States'], ['united states of america', 'US', 'United States'],
    ['northern ireland', 'gb-nir', 'Northern Ireland'], ['united kingdom', 'GB', 'United Kingdom'],
    ['great britain', 'GB', 'United Kingdom'], ['new zealand', 'NZ', 'New Zealand'],
    ['south africa', 'ZA', 'South Africa'], ['czech republic', 'CZ', 'Czech Republic'],
    ['saint helena', 'sh-hl', 'Saint Helena'], ['st helena', 'sh-hl', 'Saint Helena'],
    ['u s a', 'US', 'United States'], ['u k', 'GB', 'United Kingdom'],
    ['australia', 'AU', 'Australia'], ['canada', 'CA', 'Canada'],
    ['germany', 'DE', 'Germany'], ['deutschland', 'DE', 'Germany'],
    ['france', 'FR', 'France'], ['switzerland', 'CH', 'Switzerland'],
    ['ireland', 'IE', 'Ireland'], ['scotland', 'gb-sct', 'Scotland'],
    ['england', 'gb-eng', 'England'], ['wales', 'gb-wls', 'Wales'],
    ['united states', 'US', 'United States'], ['usa', 'US', 'United States'],
    ['britain', 'GB', 'United Kingdom'],
    ['uk', 'GB', 'United Kingdom'], ['denmark', 'DK', 'Denmark'],
    ['poland', 'PL', 'Poland'], ['italy', 'IT', 'Italy'], ['czechia', 'CZ', 'Czechia'],
    ['sweden', 'SE', 'Sweden'], ['egypt', 'EG', 'Egypt'], ['hungary', 'HU', 'Hungary'],
    ['russia', 'RU', 'Russia'], ['el salvador', 'SV', 'El Salvador'], ['brazil', 'BR', 'Brazil'],
    ['norway', 'NO', 'Norway'], ['netherlands', 'NL', 'Netherlands'], ['belgium', 'BE', 'Belgium'],
    ['spain', 'ES', 'Spain'], ['portugal', 'PT', 'Portugal'], ['austria', 'AT', 'Austria'],
    ['finland', 'FI', 'Finland'], ['india', 'IN', 'India'], ['japan', 'JP', 'Japan'],
    ['china', 'CN', 'China'], ['mexico', 'MX', 'Mexico'], ['argentina', 'AR', 'Argentina'],
    ['iceland', 'IS', 'Iceland'], ['greece', 'GR', 'Greece'], ['ukraine', 'UA', 'Ukraine'],
    ['croatia', 'HR', 'Croatia'], ['slovakia', 'SK', 'Slovakia'], ['slovenia', 'SI', 'Slovenia'],
    ['turkiye', 'TR', 'Turkiye'], ['turkey', 'TR', 'Turkey'],
    ['australie', 'AU', 'Australia'], ['new zeland', 'NZ', 'New Zealand'], ['scotlamd', 'gb-sct', 'Scotland'],
    ['papua new guinea', 'PG', 'Papua New Guinea', 'Flag_of_Papua_New_Guinea.svg'], ['cuba', 'CU', 'Cuba', 'Flag_of_Cuba.svg'],
    ['jamaica', 'JM', 'Jamaica', 'Flag_of_Jamaica.svg'], ['sudan', 'SD', 'Sudan', 'Flag_of_Sudan.svg'],
    ['armenia', 'AM', 'Armenia', 'Flag_of_Armenia.svg'], ['samoa', 'WS', 'Samoa', 'Flag_of_Samoa.svg'],
    ['puerto rico', 'PR', 'Puerto Rico', 'Flag_of_Puerto_Rico.svg'],
    ['palestine', 'PS', 'Palestine', 'Flag_of_Palestine.svg'], ['palistine', 'PS', 'Palestine', 'Flag_of_Palestine.svg'],
    ['tonga', 'TO', 'Tonga', 'Flag_of_Tonga.svg'], ['bolivia', 'BO', 'Bolivia', 'Flag_of_Bolivia.svg'],
    ['bermuda', 'BM', 'Bermuda', 'Flag_of_Bermuda.svg'], ['latvia', 'LV', 'Latvia', 'Flag_of_Latvia.svg'],
    // Listed after 'germany' so places naming both keep the German flag (equal-length ties keep array order).
    ['prussia', 'de-prussia', 'Prussia', 'Flag_of_Prussia_(1918–1933).svg'],
    ['preussen', 'de-prussia', 'Prussia', 'Flag_of_Prussia_(1918–1933).svg']
  ].sort((a, b) => b[0].length - a[0].length);
  const state = {
    mapMode: false, mapStats: null, directoryMatches: [], reportsMode: false, mediaLibraryMode: false, pedigreeMode: false, pedigreeZoom: 1,
    people: new Map(), families: new Map(), sources: new Map(), selectedId: null,
    fileName: '', searchText: '', history: [], historyIndex: -1, zoom: 1, showSiblings: false,
    mediaIndex: null, mediaUrls: new Map(), mediaRelativePaths: new WeakMap(), folderMediaFiles: new Map(), mediaDirectoryHandle: null,
    rememberedMediaDirectoryHandle: null, mediaFolderPicked: false, mediaHelper: null,
    pendingUploadPersonId: null, pendingPortraitReplacement: null, pendingResearchPersonId: null,
    pendingPersonSummaryId: null,
    pendingLifeEvent: null,
    primaryMediaKey: '', primaryMedia: new Map(), additionalMedia: new Map(), mediaTypes: new Map(), primaryPersonId: '',
    birthCountryEdits: new Map(), birthCountrySuggestions: new Map(), geonamesLookup: null,
    gedcomRecords: [], gedcomDirty: false, gedcomText: '', sessionSaveQueue: Promise.resolve(),
    gedcomSource: '', gedcomFileHandle: null, gedcomBaseHash: '', gedcomSaving: false,
    gedcomSaveQueue: Promise.resolve(), gedcomPickerDeclined: false,
    directoryFilters: { birthCountry: '', deathCountry: '', occupationType: '', birthMin: null, birthMax: null, deathMin: null, deathMax: null },
    directoryYearBounds: { birth: null, death: null },
    expandedSurnames: new Set(), surnameFilter: new Set(),
    mediaLibraryCache: null,
    mediaLibraryCacheKey: '',
    mediaLibraryPage: 0,
    mediaLibrarySearchDebounce: 0,
    mediaFaceAnalysis: null,
    mediaFaceScanRunning: false,
    mediaLibrarySort: 'name-asc',
    mediaLibrarySelected: new Set(),
    mediaLibraryView: 'cards',
    mediaPersonFolders: new Map()
  };

