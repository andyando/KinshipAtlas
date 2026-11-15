# Backlog: app.js Modular Refactor (PRD)
Status as of 2026-11-15. All items start as TODO.

## Phase 1 — Safety and Backup
- [x] B1.1 Verify existing backup `backups/2026-11-15-1234/` covers all files that may be modified (app.js, index.html, styles.css, map.js, public-records.js, version.js, run-tests.ps1, tests/, launcher scripts, icon) — no backup is ever overwritten. — DONE (contents verified against live directory; MANIFEST.md written)
- [x] B1.2 Record backup inventory + integrity instructions in `backups/2026-11-15-1234/MANIFEST.md`. — DONE
- [x] B1.3 Confirm rollback plan document exists and matches the backup directory. — DONE (`tree-app/docs/ROLLBACK.md` reviewed and updated with backup inventory pointer and no-overwrite rule)

## Phase 2 — Codebase Analysis
- [ ] B2.1 Size analysis: confirm app.js current size (9,916 lines) and record largest functions/sections. — TODO
- [ ] B2.2 Responsibility analysis: categorise all code by domain (genealogy, relationships, traversal, atlas, graph, search, utils, state, events, API, data models, config, UI controllers, rendering) using the 14 section banners. — TODO
- [ ] B2.3 Code-quality analysis: duplicate code, dead code, unused functions/imports, unreachable code, oversized/high-complexity functions, circular-dependency risks, tight coupling. — TODO
- [ ] B2.4 Write analysis report into docs/ (Codebase Analysis Report). — TODO

## Phase 3 — Dependency Mapping
- [ ] B3.1 Generate function-level dependency graph for app.js. — TODO
- [ ] B3.2 Map shared state usage (state object, DOM caches, storage keys) across sections. — TODO
- [ ] B3.3 Map event dependencies (DOM events, cross-module calls) and external library usage. — TODO
- [ ] B3.4 Identify circular-dependency risks and candidate extraction groups. — TODO
- [ ] B3.5 Determine and document safest extraction sequence (genealogy → visualisation → atlas → search → utils → state → UI). — TODO
- [ ] B3.6 Write Dependency Analysis Report into docs/. — TODO

## Phase 4 — Extraction (domain priorities)
- [ ] B4.1 Priority 1 — Genealogical relationship engine: extract kinship graph, relationship terms, ancestor/descendant/common-ancestor/cousin/degree-removal calculations, kinship pathfinding, traversal algorithms → modules/genealogy/. — TODO
- [ ] B4.2 Validation round 1: node --check all touched files; run run-tests.ps1; browser QA (console errors); stop and roll back on failure. — TODO
- [ ] B4.3 Priority 2 — Graph/tree rendering: extract tree render, SVG generation, layout, node positioning, edge generation, zoom/pan → modules/visualisation/. — TODO
- [ ] B4.4 Validation round 2 (same gate as B4.2). — TODO
- [ ] B4.5 Priority 3 — Atlas/geography: extract map render, migration timeline, location processing, geographic helpers → modules/atlas/. — TODO
- [ ] B4.6 Validation round 3. — TODO
- [ ] B4.7 Priority 4 — Search/indexing: extract search engine, fuzzy matching, filters, ranking, caching → modules/search/. — TODO
- [ ] B4.8 Validation round 4. — TODO
- [ ] B4.9 Priority 5 — Shared utilities: date/string/format/parsing/validation/storage/API wrappers → modules/utils/. — TODO
- [ ] B4.10 Validation round 5. — TODO
- [ ] B4.11 Priority 6 — State management: global state, caches, persistence, event bus → modules/state/. — TODO
- [ ] B4.12 Validation round 6. — TODO
- [ ] B4.13 Priority 7 — UI controllers: extract dialogs, editors, menus, directory UI last, once all logic layers are isolated. — TODO
- [ ] B4.14 Validation round 7. — TODO

## Phase 5 — Target Architecture
- [ ] B5.1 Reduce app.js to lightweight coordinator (startup, module init, event registration, wiring); target under 1,000 lines. — TODO
- [ ] B5.2 Update index.html to load modules in correct order; verify no broken script references. — TODO

## Phase 6 — Refactoring Rules Compliance
- [ ] B6.1 Confirm each extraction moved one logical group at a time, preserving public interfaces and signatures. — TODO
- [ ] B6.2 Confirm no circular dependencies introduced; naming consistent with codebase; no orphaned references. — TODO

## Phase 7 — Continuous Validation (each round)
- [ ] B7.1 Lint/static analysis run and clean. — TODO
- [ ] B7.2 Unit tests (run-tests.ps1, node --test) all pass after every extraction. — TODO
- [ ] B7.3 Browser QA: console errors, network errors, runtime warnings checked after every extraction. — TODO

## Phase 8 — Full Regression Testing
- [ ] B8.1 Startup: initial load, config, data loading (GEDCOM import path). — TODO
- [ ] B8.2 Genealogy: person lookup, relationship calcs, ancestor/descendant views, cousin calcs, labels, pathfinding. — TODO
- [ ] B8.3 Atlas: maps, migration paths, geographic lookups. — TODO
- [ ] B8.4 Tree: generation, rendering, zoom, pan, node interactions. — TODO
- [ ] B8.5 Search: filtering, autocomplete, index lookups. — TODO
- [ ] B8.6 Data: imports, exports, save, load, editing, persistence (IndexedDB). — TODO
- [ ] B8.7 UI: navigation, menus, dialogs, forms, event handlers (person record sections, media UI, pedigree). — TODO
- [ ] B8.8 Confirm no performance regressions; write Regression Test Report. — TODO

## Phase 9 — Dead Code Review
- [ ] B9.1 Detect unused functions, imports, exports, unreachable code, duplicate utilities, obsolete sections. — TODO
- [ ] B9.2 Document each finding (why unused, evidence, risk) before any removal; write Dead Code Report. — TODO

## Phase 10 — Documentation Updates
- [ ] B10.1 Update README.md with new module/folder structure and setup/build instructions. — TODO
- [ ] B10.2 Write architecture/developer docs: module responsibilities, dependency relationships, extraction decisions, import conventions, rationale. — TODO

## Phase 11 — Final Deliverables
- [ ] B11.1 Refactoring Summary. — TODO
- [ ] B11.2 Dependency Analysis Report (final). — TODO
- [ ] B11.3 File Movement Report (created/modified/deleted lists). — TODO
- [ ] B11.4 Architecture Report. — TODO
- [ ] B11.5 Regression Test Report. — TODO
- [ ] B11.6 Dead Code Report. — TODO
- [ ] B11.7 Backup location + rollback instructions in final summary. — TODO

## Constraints (apply to every item)
- No functional changes; app.js remains the entry point/coordinator.
- No public proxies for CORS; backend fallback stays via launcher/KinshipAtlas.cs routes.
- Hero image reframe feature (separate request) must not regress; it is not part of this backlog.
