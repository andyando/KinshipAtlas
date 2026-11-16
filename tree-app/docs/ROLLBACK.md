# Rollback Plan — app.js modularisation refactor

## Backup location
`g:\Git\Kinship_Experimental\backups\2026-11-15-1234\`

Contains copies of:
- `app.js`, `styles.css`, `index.html`, `map.js`, `public-records.js`, `version.js`
- `tests/run-tests.ps1`, `tests/`
- Launcher build files (`KinshipAtlas.cs`, `build-launcher.ps1`, `make-icon.ps1`, `kinship-atlas.ico`)

Inventory and integrity instructions: see `backups/2026-11-15-1234/MANIFEST.md`.
Rule: this backup directory is never overwritten — any new backup pass creates a fresh timestamped folder.

## Files that the refactor may modify
- `tree-app/app.js` (functions moved out)
- `tree-app/index.html` (new `<script>` tags for extracted modules)
- New files under `tree-app/src/modules/`

## Restoration procedure
If any regression is detected after an extraction step:

1. Stop all further edits.
2. Restore files from backup:
   ```powershell
   Copy-Item 'g:\Git\Kinship_Experimental\backups\2026-11-15-1234\app.js' 'g:\Git\Kinship_Experimental\tree-app\app.js' -Force
   Copy-Item 'g:\Git\Kinship_Experimental\backups\2026-11-15-1234\index.html' 'g:\Git\Kinship_Experimental\tree-app\index.html' -Force
   # repeat for any other modified file
   ```
   Optional: delete `tree-app\src\modules\` to return fully to pre-refactor state.
3. Verify checksums match backup hashes (`Get-FileHash`).
4. Re-run validation (below).

## Validation procedure after rollback
1. `powershell -NoProfile -ExecutionPolicy Bypass -File tree-app\tests\run-tests.ps1`
   — expect: 130 passing, 0 failing (baseline recorded 2026-11-15).
2. Browser smoke test: load the app via the launcher (`Kinship Atlas.exe`, port 8765)
   or any static server, load the GEDCOM, select a person, switch views
   (graph / pedigree / map / media / reports), and confirm no console errors.
