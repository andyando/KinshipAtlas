# Refactor Backup Manifest — 2026-11-15-1234

Backup created per PRD Phase 1 ("Safety and Backup"). Directory: `backups/2026-11-15-1234/`.

Rule honoured: an existing backup directory is **never overwritten** — a new timestamped folder
(e.g. `backups/2026-11-15-HHMM/`) is created for any subsequent backup pass.

## Files in this backup
| File               | Size (bytes) | Purpose                                           |
| ------------------ | ------------ | ------------------------------------------------- |
| app.js             | 491784       | Main application source (subject of the refactor) |
| index.html         | 81370        | Shell markup / script ordering                    |
| styles.css         | 129681       | Styles referenced by extracted modules            |
| map.js             | 38046        | Atlas/map feature source                          |
| public-records.js  | 23193        | Public records providers source                   |
| version.js         | 10746        | Version/build info                                |
| KinshipAtlas.cs    | 27693        | Launcher backend (public-records fallback routes) |
| run-tests.ps1      | 529          | Test runner entry point                           |
| build-launcher.ps1 | 568          | Launcher build script                             |
| make-icon.ps1      | 2492         | Icon build script                                 |
| kinship-atlas.ico  | 6077         | App icon                                          |
| tests/             | (directory)  | Full test suite copied wholesale                  |

## Integrity
Verify with PowerShell before restoring:

```powershell
Get-FileHash backups\2026-11-15-1234\app.js -Algorithm SHA256
```

Compare against the hash recorded when this manifest was written; any mismatch means the
backup itself is compromised and restore must not proceed.

## Rollback pointer
Restoration procedure and post-rollback validation live in `tree-app/docs/ROLLBACK.md`.
