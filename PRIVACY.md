# Privacy and Data Handling

Genealogy can expose sensitive information about people who are alive, including people who are not the subject of the research. Apply privacy protections before collecting, sharing, or asking an AI tool to process information.

## Living people

- Do not create identifiable profiles for living relatives in this workspace by default. Use a neutral label such as `Living relative A` only when needed to explain a relationship.
- Do not record or share a living person's full date of birth, current address, contact details, account identifiers, or sensitive medical, legal, financial, or family information unless it is necessary, lawful, and the person has given informed consent.
- Redact or generalize details in notes, screenshots, citations, transcripts, family trees, and exports. Check indirect identifiers too: a combination of location, dates, and relationships can identify someone.
- Treat a person's status as living unless reliable evidence establishes otherwise. Do not infer death from silence or an old record.
- Obtain permission before sharing identifiable information about living people. Respect a request to remove or restrict information.

## Storage and sharing

- The canonical archive is `G:\Family`, outside this project workspace. Work there in place; do not copy, move, or reorganize existing archive files unless explicitly asked.
- Kinship Atlas caches the active GEDCOM text, unsaved state, and supported media-folder handle in the browser tab's IndexedDB to restore across refresh/navigation. The top-level **Clear** action deletes this active session record. This local browser storage is not encrypted by the app and is separate from the GEDCOM file and archive.
- Save new research notes and reports to `G:\Family\08_Research` by default. Use the existing `01_People`, `04_Records`, `05_Photos`, `06_DNA`, or other matching archive folders only when the requested output belongs there.
- Do not overwrite or rename an existing archive file unless explicitly asked. Check the target folder and choose a distinct filename for new work.
- Keep any temporary working files under this workspace's `private/`; that directory is excluded from this workspace's Git by default. Completed work should normally be saved in the canonical archive.
- Do not commit private records, scans, GEDCOM files, exports, or notes. Inspect `git status` and review every staged file before any commit.
- Git ignore applies only within this workspace; it does not cover `G:\Family`, provide encryption or access control, or protect against cloud synchronization, backups, malware, or accidental sharing. Use encrypted storage and review sync, backup, and device-sharing settings for both locations.
- Before using an external website, AI service, or shared drive, check its privacy terms and whether you have permission to disclose the material. Prefer anonymized excerpts and omit unnecessary identifiers.
- Kinship Atlas's Perplexity action is an explicit external-sharing step: it is available only for people with recorded death details, previews the exact prompt, requires consent, and copies the prompt for the user to paste and submit. It excludes relatives without recorded death details. Review and remove details that should not be shared before submission.
- Remove identifying metadata from files intended for sharing and inspect the final export, not just the source document.

## Corrections and retention

Record the reason and date when a private record is corrected or removed. Keep only information that serves a defined research purpose, and follow applicable laws, repository terms, and the wishes of living relatives.
