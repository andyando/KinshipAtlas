# Rollback Plan — Module Extraction (2026-11-15)

## What is being changed
`app.js` (single-file browser script, 9,436 lines) is being split into module source files under
`src/modules/`, reassembled into `app.js` by `build.js` at the byte level. `index.html` continues
to load `app.js` only, so the running application is unchanged.

## Backups
Location: `backups/2026-11-15-0500-modules/`
- `app.js` — original application script (never overwritten)
- `index.html` — original page
- `styles.css` — original stylesheet
- `run-tests.ps1` — original test runner

## Files to restore
| File                      | Restore from                                 |
| ------------------------- | -------------------------------------------- |
| `app.js`                  | `backups/2026-11-15-0500-modules/app.js`     |
| `index.html` (if touched) | `backups/2026-11-15-0500-modules/index.html` |
| `styles.css` (if touched) | `backups/2026-11-15-0500-modules/styles.css` |

## Restoration procedure
1. Stop the local server (`node server.js` or the Kinship Atlas helper) if running.
2. Copy the backup files over the working copies:
   ```powershell
   Copy-Item backups\2026-11-15-0500-modules\app.js app.js -Force
   Copy-Item backups\2026-11-15-0500-modules\index.html index.html -Force
   Copy-Item backups\2026-11-15-0500-modules\styles.css styles.css -Force
   ```
3. Delete the generated artefacts if desired: `src/modules/*`, `build.js` (they are additive and
   harmless, but removing them returns the tree to the exact pre-refactor state).

## Validation procedure after rollback
1. `node --check app.js` → exit code 0.
2. Start the server and load `http://127.0.0.1:<port>/index.html`.
3. Load the primary GEDCOM; confirm the people count populates, no console errors.
4. Run `run-tests.ps1` if present, or the project's Playwright QA scripts.
