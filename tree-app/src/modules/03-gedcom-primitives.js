  // ---------------------------------------------------------------------------
  // 3. GEDCOM primitives (parsing, serialising, record helpers)
  // ---------------------------------------------------------------------------

  function splitXref(value) {
    return value ? value.replace(/^@|@$/g, '') : '';
  }

  // Opens a <dialog> as modal and moves focus to its quiet (cancel-style) button so
  // Enter/Space is safe and the dialog closes cleanly with keyboard navigation.
  function showModalFocused(dialog) {
    dialog.showModal();
    dialog.querySelector('.dialog-button-quiet')?.focus();
  }

  function normalizeDirectoryName(value) {
    return String(value || '').toLocaleLowerCase();
  }

  function createEvent(type, value = '') {
    return { type, value: cleanEventDisplayText(value), date: '', place: '', detail: '', notes: [], sources: [], mediaPaths: [], ordinal: -1 };
  }

  function cleanGedcomValue(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanEventDisplayText(value) {
    const decodeEntities = (text) => text.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value) => {
      const normalized = value.toLowerCase();
      if (normalized === 'amp') return '&';
      if (normalized === 'lt') return '<';
      if (normalized === 'gt') return '>';
      if (normalized === 'quot') return '"';
      if (normalized === 'apos') return "'";
      if (normalized === 'nbsp') return ' ';
      const codePoint = normalized.startsWith('#x')
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : entity;
    });
    const decoded = decodeEntities(decodeEntities(String(value || '')));
    return decoded
      .replace(/<\?[^>]*\?>|<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatGedcomDate(value) {
    const [year, month, day] = value.split('-');
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return year && monthNames[Number(month) - 1] ? `${Number(day)} ${monthNames[Number(month) - 1]} ${year}` : '';
  }

  function datePickerValue(gedcomDate) {
    const value = String(gedcomDate || '').trim();
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const gedcomDateMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    let year;
    let month;
    let day;
    if (isoDate) {
      [, year, month, day] = isoDate;
    } else if (gedcomDateMatch) {
      const monthIndex = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
        .indexOf(gedcomDateMatch[2].toUpperCase());
      if (monthIndex < 0) return '';
      day = gedcomDateMatch[1].padStart(2, '0');
      month = String(monthIndex + 1).padStart(2, '0');
      year = gedcomDateMatch[3];
    } else {
      return '';
    }

    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 ||
        date.getUTCDate() !== Number(day)) return '';
    return `${year}-${month}-${day}`;
  }

  function enteredGedcomDate(value) {
    const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    return datePickerValue(text) && /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? formatGedcomDate(text) : text;
  }

  function splitGedcomRecords(text) {
    const records = [];
    let active = null;
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const start = line.match(/^0\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (start) {
        if (active) records.push(active);
        active = { xref: splitXref(start[1]), tag: start[2].toUpperCase(), lines: [line] };
      } else if (active) {
        active.lines.push(line);
      }
    }
    if (active) records.push(active);
    return records;
  }

  function parseGedcomField(line) {
    const match = line.match(/^(\d+)\s+([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    // Single place that knows the field shape shared by every consumer below.
    return match ? { level: Number(match[1]), tag: match[2].toUpperCase(), value: match[3] || '' } : null;
  }

  // Index of the first `n TAG` line at or after `from`. Line 0 of a record is the
  // header ("0 @X@ INDI"), so callers scanning record bodies start at 1.
  function gedcomLineIndexOf(lines, tag, level = 1, from = 1) {
    for (let index = from; index < lines.length; index++) {
      const field = parseGedcomField(lines[index]);
      if (field?.level === level && field.tag === tag) return index;
    }
    return -1;
  }

  function serializeGedcomRecords(records) {
    return `${records.flatMap((record) => record.lines).join('\r\n').replace(/\r?\n*$/, '')}\r\n`;
  }

  // Maps each top-level "0 @X@ OBJE" media record to its FILE paths, so "n OBJE @X@" pointers can be resolved.
  function mediaRecordFiles(records) {
    const files = new Map();
    for (const record of records) {
      if (record.tag !== 'OBJE' || !record.xref) continue;
      const paths = record.lines.slice(1).map(parseGedcomField)
        .filter((field) => field?.tag === 'FILE' && field.value.trim())
        .map((field) => field.value.trim());
      if (paths.length) files.set(record.xref, paths);
    }
    return files;
  }

