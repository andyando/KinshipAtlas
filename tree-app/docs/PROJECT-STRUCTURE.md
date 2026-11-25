# Kinship Atlas project layout
`tree-app` is both the portable runtime folder and the application source project. Keep the runtime entry points at its root so `index.html`, the Windows launcher, the Node helper, and portable installs continue to work without a build or path rewrite.

## Runtime files
- `index.html` — browser entry page.
- `app.js` — generated deployable application script. Edit its canonical sources under `src/modules/`, then run `node tree-app/tools/build-app.js` from the repository root.
- `styles.css`, `map.js`, `public-records.js`, `release-check.js`, `version.js` — runtime styles, map layer, public-record providers, update checker, and version history.
- `server.js` — optional local Node helper; `Kinship Atlas.exe` — optional Windows launcher.
- `favicon.svg`, `welcome-pattern.svg`, `data/`, `flags/`, and `launcher/kinship-atlas.ico` — runtime assets.
- `primary-data.js`, `kinship-defaults.json`, `kinship-selections.json`, GEDCOMs, and media folders — local/user data; do not move, publish, or package them.

## Maintainer files
- `src/modules/`, `src/modules.json` — canonical ordered application sources and build manifest.
- `tests/` — Node tests and the PowerShell runner. Run `node --test tree-app/tests/*.test.js` or `powershell -NoProfile -ExecutionPolicy Bypass -File tree-app/tests/run-tests.ps1` from the repository root.
- `data/historical-gazetteer.json`, `data/place-aliases.json`, `data/historical-regions.json` — editable source tables for the offline Historical Gazetteer; `node data/build-historical-gazetteer.js` regenerates `data/historical-gazetteer.js` from them.
- `installer/` — fixed runtime packaging list and installer build inputs.
- `launcher/` — C# launcher source and its build scripts.
- `docs/` — project guidance and design notes; superseded and one-off documents are kept under `docs/archive/`.
- `tools/maintenance/scratch/` — archived one-off debug scripts and logs; nothing here is loaded or packaged.
- `backups/` — immutable dated snapshots used for rollback; do not edit existing snapshots.
- `tools/build-app.js` — rebuilds deployable `app.js` from the canonical modules. `tools/analysis/`, `tools/qa/`, `tools/maintenance/`, and `tools/artifacts/` hold non-runtime analysis scripts, QA probes, historical maintenance scripts, and saved diagnostic output; none are packaged or loaded by the application. Local scripts originally kept in `tree-app/` have been grouped here; no executable application files or user data were moved.

Keep runtime files at the root: moving the application entry files into a `src/` or `public/` directory would break the current portable-folder contract and the launcher's fixed paths.
