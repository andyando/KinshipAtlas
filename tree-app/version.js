// Kinship Atlas version history, shown in Help > About Kinship Atlas.
// Versions are MAJOR.MINOR.PATCH. For every release, add a new entry at the top of `releases` (newest first):
//   - increase MAJOR (reset MINOR and PATCH to 0) for large or incompatible changes, such as a new data format;
//   - increase MINOR (reset PATCH to 0) for new features;
//   - increase PATCH for small fixes and adjustments to existing features.
// Dates are YYYY-MM-DD. The first entry is the current version.
window.KINSHIP_VERSION = {
  releases: [
    {
      version: '1.8.1',
      date: '2026-11-06',
      changes: [
        'Resized the About window to use one scrollbar and keep its Close button at the top.'
      ]
    },
    {
      version: '1.8.0',
      date: '2026-11-06',
      changes: [
        'Added Settings > Check for application updates for installing published, numbered GitHub releases without changing GEDCOM files, media, defaults or image selections.'
      ]
    },
    {
      version: '1.7.2',
      date: '2026-11-06',
      changes: [
        'Replaced thirteen PNG country flags with Wikimedia Commons SVGs and documented their source and license terms.'
      ]
    },
    {
      version: '1.7.1',
      date: '2026-11-06',
      changes: [
        'The example folder path shown when asking for a media folder\'s location is now a general example rather than a specific drive.'
      ]
    },
    {
      version: '1.7.0',
      date: '2026-11-06',
      changes: [
        'Importing new GEDCOM records can now optionally merge extra details into people who are already in the tree (same first name, last name and birth date). The preview lists each match with the number of additional life events and other details; tick the people to merge. Only missing details are added, and where the file differs the tree\'s value is kept and shown.'
      ]
    },
    {
      version: '1.6.0',
      date: '2026-11-06',
      changes: [
        'The Help menu now has guides: Getting started; Opening & importing GEDCOM files; Exploring the family tree; Editing people & saving; Photos, documents & media; Map View, Reports & data checks; and Defaults & home person. Each opens in a help window with a topic list for moving between guides.'
      ]
    },
    {
      version: '1.5.0',
      date: '2026-11-06',
      changes: [
        'The Kinship Atlas logo pulses and turns 45 degrees each time a different person is selected. Motion is turned off when the device is set to reduce motion.'
      ]
    },
    {
      version: '1.4.2',
      date: '2026-11-06',
      changes: [
        'The Welcome page button "View Home Person Relationship Map" is now labelled "Go to Home/Default Person in Tree".'
      ]
    },
    {
      version: '1.4.1',
      date: '2026-11-06',
      changes: [
        'The GEDCOM file name in the top bar can be clicked to open Update defaults.',
        'Settings > Update defaults and Settings > Select/Change media folder now have icons.'
      ]
    },
    {
      version: '1.4.0',
      date: '2026-11-06',
      changes: [
        'The Welcome page art is now animated: the family network turns slowly, its orbits spin, and the nodes and lines gently pulse. Motion is turned off when the device is set to reduce motion.'
      ]
    },
    {
      version: '1.3.1',
      date: '2026-11-06',
      changes: [
        'Versions now have three parts (MAJOR.MINOR.PATCH), so small fixes get their own number; earlier versions are shown as 1.0.0 to 1.3.0.',
        'The Reports death country count now includes only people with a recorded death date, leaving out anyone who may be living.'
      ]
    },
    {
      version: '1.3.0',
      date: '2026-11-06',
      changes: [
        'Reports shows how many people have or do not have a birth country, and a death country, separating places with no recognised country from places that are not recorded.'
      ]
    },
    {
      version: '1.2.0',
      date: '2026-11-06',
      changes: [
        'Show siblings is now on by default in the relationship map.'
      ]
    },
    {
      version: '1.1.0',
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
      version: '1.0.0',
      date: '2026-11-03',
      changes: [
        'First recorded version: the relationship map, Map View, Reports, Media library, GEDCOM editing and saving, and the local helper and launcher, as they stood on 3 November 2026. Earlier changes were not versioned.'
      ]
    }
  ]
};
