// Kinship Atlas version history, shown in Help > About Kinship Atlas.
// Versions are MAJOR.MINOR.PATCH. For every release, add a new entry at the top of `releases` (newest first):
//   - increase MAJOR (reset MINOR and PATCH to 0) for large or incompatible changes, such as a new data format;
//   - increase MINOR (reset PATCH to 0) for new features;
//   - increase PATCH for small fixes and adjustments to existing features.
// Dates are YYYY-MM-DD. The first entry is the current version.
window.KINSHIP_VERSION = {
  releases: [
    {
      version: '1.20.0',
      date: '2026-11-27',
      changes: [
        'Added Favourites: bookmark people with Add to Favourites on any person record and reach them from the new Favourites view in the View dropdown.',
        'The Favourites page shows a responsive card for each person, with photo or initials, lifespan, birth place, GEDCOM ID and when they were added; click a card to open that person, or remove them straight from the card.',
        'Favourites can be searched by name or GEDCOM ID and sorted by recently added, surname, first name or birth year; the sort choice is remembered.',
        'Favourites are saved with the tree and survive a refresh, a restart and a GEDCOM reload; records saved by an older version as a plain list of ids are migrated automatically.',
        'A small heart marks favourite people in the directory and on pedigree cards.',
        'Fixed Tree Maintenance opening from the Media library or Reports: the page was shown but the app shell stayed hidden, so nothing appeared. It now closes those views first and always restores the shell, and the menu entry is wired once by delegation so it cannot go dead.',
        'The View dropdown now lists Favourites.'
      ]
    },
    {
      version: '1.19.0',
      date: '2026-11-27',
      changes: [
        'Documents are now first-class attachments: .txt, .doc, .docx, .rtf, .html and .htm files in the media folder are indexed, listed, linked, searched and validated like images and PDFs, and TIF/TIFF images are supported too.',
        'Media Validation no longer reports a document as a missing file solely because of its type; unsupported types are counted separately and only a file that is genuinely absent is listed as missing.',
        'The person record section Attached media is now Attached files and shows documents with a type icon, their type and who they belong to.',
        'TXT files preview inline and HTML files preview in a sanitised, script-free viewer; Word and RTF documents open in their default application.',
        'The Media Library gains a File type filter (Images, PDF, Word documents, Text files, HTML files) and searches type names as well as filenames.',
        'Files with no recorded link are matched to a likely person by name and offered as a suggestion; nothing is linked until you confirm.',
        'One central list (data/attachment-types.json) now defines the supported attachment types for the app, the local helper and the Windows launcher.'
      ]
    },
    {
      version: '1.18.3',
      date: '2026-11-27',
      changes: [
        'Added Settings > Tree Maintenance: a maintenance workspace listing every cleanup, repair and verification tool as a card, with a Maintenance centre overview and tree statistics.',
        'Smart Cleanup runs orphan, duplicate-people, duplicate-relationship and missing-country checks in one pass; each count opens the tool that fixes those findings.',
        'Added Media Validation, which checks every recorded media path and reports missing files, invalid paths and broken links.',
        'Find duplicate images now reports a file only when it has more than one copy in the same folder: a person\'s own folder, the media folder root or the archive folder. Copies in different people\'s folders are no longer flagged.',
        'Settings gained Historic City Names List and Select Map Provider (now including Bing Maps and MapQuest) as direct menu items.',
        'The Select Map Provider dropdown keeps the Settings menu open while it is used, and every place link names the newly chosen provider.',
        'Removed the old Tree Management submenu: all of its tools now live in Tree Maintenance.'
      ]
    },
    {
      version: '1.18.2',
      date: '2026-11-26',
      changes: [
        'Relationship-map parent lines now take their colour from the parent couple, so children with the same two parents share one colour even when their links come from separate family records.',
        'Add Relative gained an optional other-parent field: adding a child to someone with a spouse offers that spouse (pre-selected when there is exactly one), and the same option appears when adding a parent without a family.',
        'On the Add Relative screen the birth place sits under the birth date and the death place under the death date.',
        'Selecting an existing person on Add Relative searches and lists by name and dates only; GEDCOM IDs are no longer shown.'
      ]
    },
    {
      version: '1.18.1',
      date: '2026-11-22',
      changes: [
        'Added a Media Folder link beside the GEDCOM name: it opens this tree\'s media folder in File Explorer.',
        'Organise media files now reads media paths from an older copy of the tree against the current media folder, so files are found instead of reported missing; the GEDCOM\'s own file line is no longer listed.',
        'Find duplicate images now works in Kinship Atlas.exe: its helper compares files on disk and reports sizes and owners.',
        'Kinship Atlas.exe sends the page the GEDCOM already loaded, so its organise and duplicate requests stay small and start promptly.'
      ]
    },
    {
      version: '1.18.0',
      date: '2026-11-22',
      changes: [
        'Added Settings > Find duplicate images: lists files with identical contents (any file name), with thumbnails and links to open each file, and deletes or archives the copies you tick.',
        'A duplicate group is left alone when any copy is a card image or attached to a life event; removed copies are unlinked from every person and event.',
        'Media previews and the media library now refresh after files are moved or removed, instead of showing broken images until the page is reloaded.',
        'Served media carries a version, so the browser never keeps an image from a file\'s old place.'
      ]
    },
    {
      version: '1.17.0',
      date: '2026-11-22',
      changes: [
        'Added Settings > Organise media files: moves every image and PDF into its person folder, creates missing folders, copies files linked to several people, and archives files no person uses.',
        'Added a Check media folder preview and an archive folder name, and pointed every GEDCOM file path at the file\'s new place when the tree is saved.',
        'Included the same organiser in the local helper and a terminal command (helpers/media-organise-cli.mjs) for folders the browser cannot write to.',
        'Left files already in their person\'s folder untouched, so running the check twice changes nothing.',
        'Excluded the archive folder and unlinked files it holds from the media library.'
      ]
    },
    {
      version: '1.16.2',
      date: '2026-11-20',
      changes: [
        'Kept the local media helper running while the browser is idle or the computer is asleep, so card and media preferences remain saveable.',
        'Made Exit Kinship Atlas close normally only after attempting to save preferences, with a confirmation option when the helper is unavailable.',
        'Limited the Media Library to 60 items per page to improve scrolling in large libraries, while keeping search and filters across all pages.',
        'Removed the idle Saved indicator from the top bar; Save to GEDCOM now appears only when there are changes to save.'
      ]
    },
    {
      version: '1.16.1',
      date: '2026-11-19',
      changes: [
        'Fixed offline MediaPipe face scanning in the packaged app and local helper by serving and installing the detector runtime, WASM files and face model.',
        'Scan Faces now rechecks the currently shown media list with progress feedback, ignores obsolete zero-face results, and opens a review before individually or bulk applying the Portrait label.',
        'Improved detection sensitivity and image resolution for small faces in historical portraits and group photographs.',
        'Fixed launcher-provided media files so face scanning uses the same readable local URL as the image preview.',
        'Reduced false face matches on written records and scans by requiring stronger detector confidence and rejecting weak page-edge detections.',
        'Added a face icon to Scan faces and Select all / Deselect all controls to the face results review, with readable enabled and disabled states.',
        'Profile card image review now finds attached Portrait media whose current hero is not a Portrait, then supports individual and bulk selection before updating.',
        'Changed hero images on person records, Relationship Map and Pedigree to square crops, and updated Reframe photo so the default square fills the full image width.'
      ]
    },
    {
      version: '1.16.0',
      date: '2026-11-14',
      changes: [
        'Replaced Search WikiTree with Search Public Records: one dialog that queries Open Archives, WikiTree, Europeana, Digital Public Library of America, Internet Archive and Find A Grave.',
        'Added Search All Sources, which runs every provider in parallel and streams results as each finishes.',
        'Per-service status shows Ready, Searching, Results found, No matching results found, or an error message; links open each original record in a new tab.',
        'Updated the Help, About privacy notes and README for the new services.'
      ]
    },
    {
      version: '1.15.0',
      date: '2026-11-13',
      changes: [
        'Added a View selector for Tree, Map, Pedigree, Reports and Media, including an ancestor pedigree chart.',
        'Added dark and light appearance controls and a tool to review and remove duplicate relationships.',
        'Updated the in-app Help and README with the available views and Settings options.'
      ]
    },
    {
      version: '1.14.1',
      date: '2026-11-08',
      changes: [
        'Made the duplicate-name warning when adding a relative bold and red so it is easier to notice.',
        'Fixed missing siblings in person records and the tree view when children share recorded parents across separate family records.',
        'Kept the selected person and partners together in the tree view, with siblings outside the couple on their relative\'s side rather than between them.'
      ]
    },
    {
      version: '1.14.0',
      date: '2026-11-08',
      changes: [
        'Added Naturalization as a life event type.',
        'Click Parent not identified in a person record to create a new parent or select an existing person for that family.'
      ]
    },
    {
      version: '1.13.0',
      date: '2026-11-07',
      changes: [
        'World Map now distinguishes father\'s side (blue), mother\'s side (pink), both sides (purple), the primary person and descendants (gold), and others (green), with colour swatches in the bottom legend and segmented mixed clusters.',
        'Added a family-tree icon beside the Bloodline only slider.',
        'Added icon sliders below Bloodline only for Mother\'s side, Father\'s side and Descendants. All start off; enabled groups combine and respect Directory filters.',
        'Alphabetized media classifications and added Religious as a life event type.'
      ]
    },
    {
      version: '1.12.0',
      date: '2026-11-06',
      changes: [
        'World Map highlights the primary person and blood relatives in purple, including mixed-group indicators and a legend. Unspecified parent relationships are presumed biological.',
        'Added a Bloodline only map slider switch, off by default, to hide people outside the primary person\'s bloodline.',
        'Removed the separate starred Home person option from person records, retaining primary-person controls and existing saved startup preferences.'
      ]
    },
    {
      version: '1.11.2',
      date: '2026-11-06',
      changes: [
        'Fixed a Directory rendering error introduced by the middle-name search change that prevented trees from opening.'
      ]
    },
    {
      version: '1.11.1',
      date: '2026-11-06',
      changes: [
        'Directory searches now match first and last names even when recorded middle names are omitted.'
      ]
    },
    {
      version: '1.11.0',
      date: '2026-11-06',
      changes: [
        'Life events can now link media already attached to the person, reusing the same file across multiple events without uploading it again.'
      ]
    },
    {
      version: '1.10.1',
      date: '2026-11-06',
      changes: [
        'Made the existing-person selection list taller and full-width so matching people are easier to read and select.'
      ]
    },
    {
      version: '1.10.0',
      date: '2026-11-06',
      changes: [
        'Add relative can now search and link existing GEDCOM people as parents or partners/spouses without creating duplicate people.'
      ]
    },
    {
      version: '1.9.3',
      date: '2026-11-06',
      changes: [
        'Date entry now clearly supports year-only or month-and-year dates alongside exact-date pickers, including new trees and relatives.'
      ]
    },
    {
      version: '1.9.2',
      date: '2026-11-06',
      changes: [
        'Failed update checks and incomplete setup now explain how to manually update the installation folder and provide the latest GitHub release link.'
      ]
    },
    {
      version: '1.9.1',
      date: '2026-11-06',
      changes: [
        'Person records now show the recorded birth country beside the hero image, and the death country when it differs.'
      ]
    },
    {
      version: '1.9.0',
      date: '2026-11-06',
      changes: [
        'Replaced browser file-writing updates with GitHub release checks and a portable-folder Windows installer distributed with checksums and Sigstore provenance.'
      ]
    },
    {
      version: '1.8.2',
      date: '2026-11-06',
      changes: [
        'Added an icon to Check for application updates and a subtle repeating family-tree background to the welcome page.'
      ]
    },
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
