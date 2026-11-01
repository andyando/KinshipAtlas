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

Open [Kinship Atlas](tree-app/index.html) directly in a browser; no server or installation is required. Choose **Open GEDCOM** and select the GEDCOM export from RootsMagic. After it loads, choose **Link media** and select the matching media folder. The app matches GEDCOM file references to files in that folder, displays the first matched image on each person card, and lists attached images and documents in the person details. Unmatched files are reported in the app.

The app reads the selected GEDCOM and media files in the browser tab only. It does not upload the files or save imported data. Use the directory search or click a person/relationship to recenter the map; recorded life events, places, occupations, partners, parents, siblings, children, and linked media appear in the detail panel. The view reflects GEDCOM entries and is not an independent verification of them.

Country flags use locally stored SVGs from [flag-icons](https://github.com/lipis/flag-icons), released under the MIT license included in `tree-app/flags/LICENSE`; the app makes no remote requests to render them.

## Suggested private folders

The archive already has folders for people, records, photos, DNA, research, and processed material. Keep its existing organization; do not create a parallel archive under `private/` unless requested.

## Important limitation

Git ignore rules reduce accidental commits within this workspace; they do not apply to `G:\Family`, encrypt files, prevent cloud sync, or secure backups. Review sync and backup settings and use encrypted storage for sensitive material. Do not publish the workspace or archive contents without reviewing every file and export.
