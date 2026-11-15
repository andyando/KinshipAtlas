/* Kinship Atlas runs entirely in this browser tab. It does not upload or persist imported GEDCOM data.
 *
 * This file is intentionally a single, no-build browser script (loaded directly by index.html).
 * It is organised into labelled sections so it can be navigated like modules:
 *
 *   1. Constants and application state
 *   2. Cached DOM elements
 *   3. GEDCOM primitives (parsing, serialising, record helpers)
 *   4. Session persistence (IndexedDB)
 *   5. GEDCOM parsing
 *   6. Kinship graph and relationship terms
 *   7. WikiTree research integration
 *   8. Media handling (index, storage, resolution)
 *   9. Selections and per-tree storage keys
 *  10. Rendering (tree, roster, details, media library, reports)
 *  11. Editors and dialogs (person, life events, relationships, deletion)
 *  12. Directory, duplicate finder and birth-country suggestions
 *  13. GEDCOM import, merging and saving
 *  14. Map, print, defaults, about/help and startup wiring
 *
 * Section banners below match this list. Functions within a section keep their historical
 * ordering because the automated test suite locates some helpers by exact source position.
 */
(() => {
  'use strict';

