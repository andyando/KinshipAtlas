# Kinship Atlas

Kinship Atlas is a private, local family-tree viewer and editor for GEDCOM files. It runs in your web browser on your own device: your GEDCOM file and media are read from folders you choose and are never uploaded. The repository also includes an evidence-led research workspace (templates, research standards and privacy rules) for documenting family history.

No family data is included in this repository. Version history is shown in the app under **Help > About Kinship Atlas** and recorded in [tree-app/version.js](tree-app/version.js).

## Install

Kinship Atlas does not need installing system-wide and can live in any folder you choose: a local drive, a synced folder, or a USB stick. All of its paths are relative to its own folder.

1. Copy the `tree-app` folder to the location you want, and rename it if you like.
2. Keep these together in that folder: `index.html`, `app.js`, `updater.js`, `map.js`, `styles.css`, `version.js`, `favicon.svg`, `data/`, `flags/` and `launcher/kinship-atlas.ico`, plus `Kinship Atlas.exe` on Windows and `server.js` if you use the Node.js helper.
3. Keep your GEDCOM file and media folder wherever suits you. They do not need to be inside the app folder unless you use the optional `Primary GEDCOM` and `Primary Media Library` folders described below.

Requirements:

- A current browser. Edge and Chrome can write edits straight back to the GEDCOM file and media folder you open. Browsers without local folder access, such as Brave or Firefox, ask where to save or download a copy, unless the app is run through the launcher or the Node.js helper.
- Optional: Windows, for `Kinship Atlas.exe`. Optional: [Node.js](https://nodejs.org/), for `server.js` and the tests.

## Run

Choose one of these:

- **Open `index.html` directly** in a browser. Choose **Open GEDCOM** and select a GEDCOM export (for example from RootsMagic), or **Create new GEDCOM** to start a new tree.
- **Windows launcher: `Kinship Atlas.exe`.** Beside the program, you can optionally add a `Primary GEDCOM` folder (the first `.ged` file in it opens automatically) and a `Primary Media Library` folder containing one media folder (for example `<GEDCOM name>_media`). At start-up the launcher writes `primary-data.js` from these folders. If a media folder is present, it starts a local helper on `127.0.0.1` (ports 8765–8769), which can add and delete media, save the GEDCOM (keeping the previous version in `Primary GEDCOM\Backups`) and save preferences; otherwise it just opens `index.html`. Use **Settings > Exit Kinship Atlas** to stop the helper.
- **Node.js helper:** run `node server.js "<media folder>" [port]` from the app folder, then open `http://127.0.0.1:8765/` (or the port you chose). This is useful for browsers without folder-write access, such as Brave.

To open the same tree every time, use **Settings > Update defaults** to choose a default GEDCOM, media folder and home person. They are saved in `kinship-defaults.json` beside the app.

### Updating the application

In Edge or Chrome, choose **Settings > Check for application updates**. Updates are downloaded only from published, numbered GitHub Releases. The repository must be public and the release version must be listed in the app's version history. When prompted, select the installed `tree-app` folder and allow write access. The updater verifies files against GitHub's release tree, updates application files only, and does not change GEDCOM files, media folders, `primary-data.js`, `kinship-defaults.json` or `kinship-selections.json`. It also excludes any currently selected media folder inside the application folder. Save GEDCOM edits before updating, then refresh the tab when the update finishes. The Windows launcher executable is not replaced by the in-app updater.

## Using the app

### Opening, creating and importing trees

From the start page, choose **Create new GEDCOM** to enter a first person and optional birth details. Kinship Atlas creates a one-person starter, asks where to save it when the browser supports a save picker (otherwise it downloads the file), and opens the new tree in the app.

**Settings > Import new GEDCOM records** adds people from another GEDCOM who are related to the open tree; its preview can also optionally merge extra details (missing life events, places, sources, notes and media) into people already in the tree with the same first name, last name and birth date. Merging is chosen per person, only adds what is missing, and keeps the tree's value wherever the file differs. See **Help > Opening & importing GEDCOM files** for details.

### Exploring the family tree

Use the directory search or click a person/relationship to recenter the map; recorded life events, places, occupations, partners, parents, siblings, children, and linked media appear in the detail panel. The view reflects GEDCOM entries and is not an independent verification of them.

Set a primary person in their details to enable **Home Person**, which always returns to that person in Relationship View, including from Map View, Reports, or the Media library. Relationship cards wrap full names on a separate row so photos and country flags do not truncate them.

Enable **Show siblings** above the Relationship map to include the selected person's recorded siblings alongside them and their partners. Sibling cards are labelled and can be clicked to recenter the map; the children and grandchildren remain those of the selected person. The option starts on and applies as you browse people until you turn it off; **Start Again** turns it back on.

When the selected person has no recorded children, the Relationship map includes their recorded great-grandparents as an additional ancestor row. Each couple is stacked with the recorded wife above the husband and one connector from the pair to each grandparent child; a lone recorded parent is shown without an empty placeholder. People with children keep the usual grandparents-to-grandchildren layout.

Child-to-grandchild connector lines are hidden when the grandchildren occupy multiple rows, keeping large families readable. The lines return when the grandchildren fit on one row.

Use the directory’s birth/death country selectors, **Occupation Type** selector, and year-range sliders to filter people. Occupation Type uses the same 27 inferred categories as Reports and matches anyone with at least one occupation entry in the chosen category; it combines with name, surname, country, and year filters. **All occupation types** removes that restriction. Unknown / Miscellaneous matches unmapped nonblank occupation entries, not people without occupation entries. Results are grouped by surname; expand or collapse each surname to browse its people. Country and year options are derived from recognized country names and dates present in the loaded GEDCOM.

### Editing people and saving

In a person’s details, choose **Edit person details** to update the displayed name, sex, birth/death dates, and birth/death locations, or **Edit GEDCOM fields** to edit every field line in that individual record, including custom tags, by level, tag, and value. Enter dates in GEDCOM format (for example, `12 MAR 1883` or `ABT 1883`), or use the calendar picker for an exact date. **Add field** inserts another GEDCOM field; **Save changes** applies the edit to the current tree and **Cancel** discards it. **Add relative** creates a new person linked as a parent, child, sibling, or partner, with duplicate-name confirmation when needed. Use **Save GEDCOM** to write the edited records to a file; unrelated records and tags are preserved.

### Photos, documents and media

**Link media** lets you select an existing folder or create a sibling `<GEDCOM name>_media` folder inside a parent folder you choose. The app matches GEDCOM file references to files in that folder and displays the primary image on each person card. Use **Media** or **Settings > Media library** to review media referenced anywhere in the GEDCOM, preview files, classify them, see linked people and primary-card selections, choose another linked image as a card image, or permanently delete a file and its GEDCOM links. Missing files are listed but cannot be previewed or deleted until found in a linked media folder. In a person’s details, add photos or PDFs to the selected folder; the app writes them there with collision-safe filenames. Use the trash icon on a media item to unlink it from that person; the file itself remains in the folder.

### Reports and data checks

**Map View** plots people on a world map using the places recorded in the tree; click a pin to open that person. **Reports** summarises the tree, including media coverage and how many people have or do not have a birth country and a death country. The death country count only includes people with a recorded death date, so anyone who may be living is left out. Use the printer button to print the reports.

**Reports > Most popular occupations** uses 27 controlled categories and counts each person once per category. These are report-only keyword inferences: original GEDCOM wording is preserved, a standard occupation is derived, and a category is assigned. Hover over a bar to review **original description -> standard occupation**. Specific roles take priority: Bank Clerk is Finance, Merchants Clerk is Clerical, Marine Engineer is Engineering, Printing Director is Printing, and Commercial Traveller is Sales. Text after the first comma is treated as supplementary detail rather than matched as an occupation. Laborer/Labourer spellings are combined. Unmapped nonblank entries go to **Unknown / Miscellaneous**, not assumed to be non-occupations. **Spinster** is grouped under Domestic / Unpaid as requested but remains a recorded status, not proof of an occupation. Multiple categories per person are possible, so chart totals may exceed the number of people. The top ten appear initially; **Show all** expands the list, and printed reports include every populated category.

The categories are Agriculture & Farming; Engineering & Technical; Education & Academia; Healthcare & Medical; Science & Research; Government & Public Service; Law & Judiciary; Finance & Banking; Clerical & Administration; Printing & Publishing; Construction & Building Trades; Manufacturing & Industrial; Mining & Resources; Transport & Railways; Maritime & Shipping; Retail & Commerce; Merchants, Import & Export; Hospitality & Tourism; Sales & Business Development; Management & Executive; Trades & Craftsmanship; Protective Services; Arts, Music & Media; Labouring & General Work; Religious Occupations; Domestic / Unpaid; and Unknown / Miscellaneous.

**Settings > People without a birth country** lists everyone whose birth place is blank or does not contain a recognized country name, using the same matching as the directory's birth country selector. Type a new or corrected birth location for one or more people; each row previews the detected country as you type. **Save changes** writes the edited birth places to the GEDCOM (adding a birth event when none exists) and refreshes the list, so only people still without a recognized country remain. Filter the list by name or place, or click a name to close the list and open that person. Unsaved edits prompt before the list is closed.

Within that list, **Suggest countries with GeoNames** looks up each existing birth location on [GeoNames](https://www.geonames.org/) and offers up to three countries to append (United Kingdom results are shown as England, Scotland, Wales or Northern Ireland). It needs a free GeoNames account with free web services enabled on the account's "Manage account" page; the username is remembered in this browser only. The lookup is off until you tick the consent box each time the list is opened, and it sends only the birth-location text over HTTPS, without names, dates, or other details. GeoNames uses modern country names, so check historical places before accepting. Clicking a suggestion fills in the field as an unsaved edit; nothing is written to the GEDCOM until **Save changes**.

### Help and version history

The **Help** menu opens built-in guides (Getting started; Opening & importing GEDCOM files; Exploring the family tree; Editing people & saving; Photos, documents & media; Map View, Reports & data checks; Defaults & home person), covering each part of the app. **Help > About Kinship Atlas** shows the app's version and version history.

### Where the app stores information

The app does not upload or modify the selected GEDCOM unless you explicitly save edits with **Save GEDCOM**. To restore the current tree across refresh or browser back/forward, its GEDCOM text, unsaved state, and supported media-folder handle are cached in this browser tab’s IndexedDB. **Clear** deletes that active session; it does not delete media files or per-tree image/link preferences. Card-image choices, added-media links, and media classifications are saved in browser storage keyed to the GEDCOM contents. When using the local helper, those preferences are also mirrored to `kinship-selections.json` beside the app so they can travel with a copied app folder; the file stores person IDs/names, media paths, and classifications, not GEDCOM text or media contents. If browser permission for a restored folder is no longer granted, select it again.

The helper's selections file is read directly into memory rather than copied wholesale into browser storage, so a full browser quota does not prevent saved preferences from loading. Saving GEDCOM edits moves the current preferences to the new content key instead of duplicating them for every revision. Helper read/write failures are reported, an unreadable selections file is not overwritten, and **Exit Kinship Atlas** waits for pending preference saves. Keep `kinship-selections.json` with the app when copying it; do not delete browser storage to troubleshoot unless this file has been backed up.

### External services

For a person with recorded death details, **Search WikiTree** sends available first name, last name, birth year, death year, and birth and death countries to WikiTree. Review those details and check the consent box first. When Kinship Atlas is opened as a local file, it submits the search to WikiTree in a new tab to avoid browser restrictions on API requests from local files; a fallback link remains available if the new tab is blocked. When the WikiTree API is available, matches appear in the dialog with links to profiles. This is an external disclosure, so review the details before searching.

Country flags and map data are stored locally; the app makes no remote requests to render them. Apart from the opt-in WikiTree and GeoNames lookups, nothing leaves your device.

## Development

Run the tests with `node --test tree-app/tests/*.test.js` from the repository root. Tests use only made-up data.

Versions are recorded in [tree-app/version.js](tree-app/version.js) as `MAJOR.MINOR.PATCH`, newest first. For each release, add a new entry at the top with its date and a plain-language list of changes. Increase PATCH for small fixes and adjustments, MINOR (resetting PATCH to 0) for new features, or MAJOR (resetting MINOR and PATCH to 0) for large or incompatible changes. `node --test tree-app/tests/*.test.js` checks that entries are well formed and in order.

The Help guides are written into `tree-app/index.html` as `#helpDialog` articles; when a feature changes, update its guide too. After editing `tree-app/launcher/KinshipAtlas.cs`, rebuild `Kinship Atlas.exe` with `tree-app/launcher/build-launcher.ps1`, which uses the C# compiler included with Windows.

Third-party assets and data sources, including the Wikimedia Commons flag licenses and required GeoNames attribution, are documented in [Third-party notices](tree-app/THIRD-PARTY-NOTICES.md).

## Research workspace

Alongside the app, this repository provides a framework for careful, evidence-led genealogy research. It contains no family facts.

1. Read [Privacy](PRIVACY.md) and [Research standards](RESEARCH_STANDARDS.md).
2. Keep your family archive (records, scans, photos, DNA results and research notes) in a folder of your choice, outside this repository. Work with its files in place, keep its existing organisation, and save new research notes in its research folder.
3. Use a template from `templates/` for a person profile, source record, research question or research log, and save the completed file in your archive.
4. Give each source a stable ID (for example, `S-0001`) and cite that ID wherever its evidence is discussed.
5. Keep the claim, evidence, reasoning, confidence, conflicts and next steps distinct. Record unsuccessful searches as well as useful results.

Repository map:

- `tree-app/`: the Kinship Atlas app, launcher source and tests.
- `templates/`: blank, reusable research forms; keep them free of personal data.
- `private/`: optional local staging area for working files; ignored by Git.
- `PRIVACY.md`: handling rules, especially for living relatives.
- `RESEARCH_STANDARDS.md`: evidence, citation and confidence conventions.
- `.github/copilot-instructions.md`: rules for AI-assisted work in this repository.

## Keeping your data private

Git is set to ignore GEDCOM files (`*.ged`, `*.gedcom`), the launcher's generated `primary-data.js`, the `Primary Media Library` folder and other `*_media` folders, `kinship-defaults.json`, `kinship-selections.json` and the `private/` folder. Do not store family records inside the repository folder, and run `git status` and review every staged file before committing.

Git ignore rules only reduce accidental commits; they do not apply to folders outside the repository, encrypt files, prevent cloud sync, or secure backups. Review sync and backup settings and use encrypted storage for sensitive material. Do not publish the repository, your archive or any export without reviewing every file.
