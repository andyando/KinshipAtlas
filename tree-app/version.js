// Kinship Atlas version history, shown in Help > About Kinship Atlas.
// For every release, add a new entry at the top of `releases` (newest first):
//   - increase MAJOR (and reset MINOR to 0) for large or incompatible changes, such as a new data format;
//   - otherwise increase MINOR for new features and fixes.
// Dates are YYYY-MM-DD. The first entry is the current version.
window.KINSHIP_VERSION = {
  releases: [
    {
      version: '1.1',
      date: '2026-11-06',
      changes: [
        'Added Help > About Kinship Atlas, showing the app version and this version history.',
        'The Welcome page links to the Home Person Relationship Map when a primary person is set, and its guidance text is larger.',
        'Added Settings > People without a birth country, to list, edit, and save birth locations that do not identify a country.',
        'Added optional GeoNames country suggestions for those birth locations, with a button to accept each suggestion before saving.',
        'Fixed: photos and PDFs added with "Add photo or PDF" now appear straight away, with the media list expanded and the new files highlighted.',
        'Fixed: a new upload with the same name as a file in a media subfolder now shows without refreshing the tab.'
      ]
    },
    {
      version: '1.0',
      date: '2026-11-03',
      changes: [
        'First recorded version: the relationship map, Map View, Reports, Media library, GEDCOM editing and saving, and the local helper and launcher, as they stood on 3 November 2026. Earlier changes were not versioned.'
      ]
    }
  ]
};
