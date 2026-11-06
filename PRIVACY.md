# Privacy and Data Handling

Genealogy can expose sensitive information about people who are alive, including people who are not the subject of the research. Apply privacy protections before collecting, sharing, or asking an AI tool to process information.

## Living people

- Do not create identifiable profiles for living relatives in this workspace by default. Use a neutral label such as `Living relative A` only when needed to explain a relationship.
- Do not record or share a living person's full date of birth, current address, contact details, account identifiers, or sensitive medical, legal, financial, or family information unless it is necessary, lawful, and the person has given informed consent.
- Redact or generalize details in notes, screenshots, citations, transcripts, family trees, and exports. Check indirect identifiers too: a combination of location, dates, and relationships can identify someone.
- Treat a person's status as living unless reliable evidence establishes otherwise. Do not infer death from silence or an old record.
- Obtain permission before sharing identifiable information about living people. Respect a request to remove or restrict information.

## Storage and sharing

- Keep your family archive (records, scans, photos, DNA results and research notes) in a folder of your choice outside this repository. Work there in place; do not copy, move, or reorganize existing archive files unless explicitly asked.
- Kinship Atlas caches the active GEDCOM text, unsaved state, and supported media-folder handle in the browser tab's IndexedDB to restore across refresh/navigation. The top-level **Clear** action deletes this active session record. This local browser storage is not encrypted by the app and is separate from the GEDCOM file and archive.
- Save new research notes and reports in the archive's research folder by default, or in another matching archive folder (for example people, records, photos or DNA) when the output belongs there.
- Do not overwrite or rename an existing archive file unless explicitly asked. Check the target folder and choose a distinct filename for new work.
- Keep any temporary working files under this repository's `private/`; that directory is excluded from Git by default. Completed work should normally be saved in the archive.
- Do not commit private records, scans, GEDCOM files, exports, or notes. Kinship Atlas's local files (`primary-data.js`, `Primary Media Library`, `*_media` folders, `kinship-defaults.json` and `kinship-selections.json`) contain names or family data and are ignored by Git. Inspect `git status` and review every staged file before any commit.
- Git ignore applies only within this repository; it does not cover your archive folder, provide encryption or access control, or protect against cloud synchronization, backups, malware, or accidental sharing. Use encrypted storage and review sync, backup, and device-sharing settings for both locations.
- Before using an external website, AI service, or shared drive, check its privacy terms and whether you have permission to disclose the material. Prefer anonymized excerpts and omit unnecessary identifiers.
- Kinship Atlas's WikiTree search is an explicit external-sharing step: it is available only for people with recorded death details, previews the name, years, and countries that will be sent, and requires consent. The search is sent to WikiTree. Review those details before continuing.
- Remove identifying metadata from files intended for sharing and inspect the final export, not just the source document.

## Corrections and retention

Record the reason and date when a private record is corrected or removed. Keep only information that serves a defined research purpose, and follow applicable laws, repository terms, and the wishes of living relatives.
