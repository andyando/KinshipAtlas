# Anderson Ancestry Research

A private, evidence-led workspace for documenting family history. No family facts have been pre-filled. The existing family archive lives at `G:\Family`; work with it in place and do not duplicate or move its contents.

## Start here

1. Read [Privacy](PRIVACY.md) and [Research standards](RESEARCH_STANDARDS.md).
2. Treat `G:\Family` as the canonical archive. Save newly authored research notes and reports under `G:\Family\08_Research` by default; use `01_People`, `04_Records`, or other existing folders when the requested output belongs there.
3. Use a template from `templates/` when creating a person profile, source record, research question, or research log. Write the completed file to the appropriate folder in `G:\Family` unless asked otherwise.
4. Give each source a stable ID (for example, `S-0001`) and cite that ID wherever its evidence is discussed.
5. Keep the claim, evidence, reasoning, confidence, conflicts, and next steps distinct. Record unsuccessful searches as well as useful results.

## Workspace map

- `templates/`: blank, reusable research forms; keep them free of personal data.
- `G:\Family`: existing local archive, used in place and outside this workspace's Git boundary.
- `private/`: optional local staging area; ignored by Git. Prefer the canonical archive for completed work.
- `PRIVACY.md`: handling rules, especially for living relatives.
- `RESEARCH_STANDARDS.md`: evidence, citation, and confidence conventions.
- `.github/copilot-instructions.md`: rules for AI-assisted work in this workspace.

## Local Tree App

Open [Kinship Atlas](tree-app/index.html) directly in a browser; no server or installation is required. Choose **Open GEDCOM** and select the GEDCOM export from RootsMagic. **Link media** lets you select an existing folder or create a sibling `<GEDCOM name>_media` folder inside a parent folder you choose. The app matches GEDCOM file references to files in that folder, displays the primary image on each person card, and lists attached images and documents in the person details. Unmatched files are reported in the app.

Use the directory’s birth/death country selectors and year-range sliders to filter people. Results are grouped by surname; expand or collapse each surname to browse its people. Filter options are derived from recognized country names and dates present in the loaded GEDCOM.

From the start page, choose **Create new GEDCOM** to enter a first person and optional birth details. Kinship Atlas creates a one-person starter, asks where to save it when the browser supports a save picker (otherwise it downloads the file), and opens the new tree in the app.

In a person’s details, choose **Edit person details** to update the displayed name, sex, birth/death dates, and birth/death locations, or **Edit GEDCOM fields** to edit every field line in that individual record, including custom tags, by level, tag, and value. Enter dates in GEDCOM format (for example, `12 MAR 1883` or `ABT 1883`), or use the calendar picker for an exact date. **Add field** inserts another GEDCOM field; **Save changes** applies the edit to the current tree and **Cancel** discards it. **Add relative** creates a new person linked as a parent, child, sibling, or partner, with duplicate-name confirmation when needed. Use **Save GEDCOM** to write the edited records to a file; unrelated records and tags are preserved.

The app does not upload or modify the selected GEDCOM unless you explicitly save edits with **Save GEDCOM**. To restore the current tree across refresh or browser back/forward, its GEDCOM text, unsaved state, and supported media-folder handle are cached in this browser tab’s IndexedDB. **Clear** deletes that active session; it does not delete media files or per-tree image/link preferences. **Link media** can select an existing folder or create a sibling `<GEDCOM name>_media` folder inside a parent folder you choose. In a person’s details, add photos or PDFs to the selected folder; the app writes them there with collision-safe filenames. Use the trash icon on a media item to unlink it from that person; the file itself remains in the folder. Primary-image choices and links to added media are saved in this browser, keyed to the GEDCOM contents; only person IDs and media paths are stored in browser storage. If browser permission for a restored folder is no longer granted, select it again. Use the directory search or click a person/relationship to recenter the map; recorded life events, places, occupations, partners, parents, siblings, children, and linked media appear in the detail panel. The view reflects GEDCOM entries and is not an independent verification of them.

Country flags use locally stored SVGs from [flag-icons](https://github.com/lipis/flag-icons), released under the MIT license included in `tree-app/flags/LICENSE`; the app makes no remote requests to render them.

For a person with recorded death details, **Search WikiTree** sends available first name, last name, birth year, death year, and birth and death countries to WikiTree. Review those details and check the consent box first. When Kinship Atlas is opened as a local file, it submits the search to WikiTree in a new tab to avoid browser restrictions on API requests from local files; a fallback link remains available if the new tab is blocked. When the WikiTree API is available, matches appear in the dialog with links to profiles. This is an external disclosure, so review the details before searching.

## Suggested private folders

The archive already has folders for people, records, photos, DNA, research, and processed material. Keep its existing organization; do not create a parallel archive under `private/` unless requested.

## Important limitation

Git ignore rules reduce accidental commits within this workspace; they do not apply to `G:\Family`, encrypt files, prevent cloud sync, or secure backups. Review sync and backup settings and use encrypted storage for sensitive material. Do not publish the workspace or archive contents without reviewing every file and export.
