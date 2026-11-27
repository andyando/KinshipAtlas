/**
 * Kinship Atlas supported attachment types.
 *
 * One list for the whole application: the folder scanner, the GEDCOM import,
 * the Media Library, Media Validation, the organiser, server.js, the Windows
 * launcher and the tests all derive from these two arrays. A new file type is
 * added here and nowhere else (`helpers/media-organise.js` and the C# launcher
 * read the same arrays through `attachment-types.json`, so the lists cannot
 * drift).
 *
 * TIF/TIFF are images that browsers cannot decode: they are counted, listed and
 * validated like other attachments but shown with a type icon instead of a
 * thumbnail, rather than as a broken image.
 */
const KINSHIP_ATTACHMENT_TYPES = Object.freeze({
  images: Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff']),
  documents: Object.freeze(['pdf', 'txt', 'doc', 'docx', 'rtf', 'html', 'htm'])
});

const kinshipAttachmentTypeConfig = Object.freeze({
  // Which family each type belongs to. Anything not listed is unsupported.
  kinds: Object.freeze({
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', tif: 'image', tiff: 'image',
    pdf: 'pdf', txt: 'text', doc: 'word', docx: 'word', rtf: 'document', html: 'html', htm: 'html'
  }),
  // Images a browser can show as a picture. TIF/TIFF are images but get an icon.
  renderableImages: Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']),
  // How a card describes the type: "Type: HTML Document".
  kindLabels: Object.freeze({
    image: 'Image', pdf: 'PDF Document', text: 'Text File', word: 'Word Document',
    document: 'Rich Text Document', html: 'HTML Document'
  }),
  // Short badge text for a card or list row.
  badges: Object.freeze({
    jpg: 'JPG', jpeg: 'JPG', png: 'PNG', gif: 'GIF', webp: 'WEBP', bmp: 'BMP', tif: 'TIF', tiff: 'TIF',
    pdf: 'PDF', txt: 'TXT', doc: 'DOC', docx: 'DOCX', rtf: 'RTF', html: 'HTML', htm: 'HTM'
  }),
  // The icon drawn for each kind (see buttonIcons in module 10).
  kindIcons: Object.freeze({ image: 'photo', pdf: 'document', text: 'document', word: 'wordDoc', document: 'document', html: 'webPage' }),
  // "All / Images / PDF / Word documents / …" for the library's type filter.
  filters: Object.freeze([
    { value: '', label: 'All file types' },
    { value: 'image', label: 'Images' },
    { value: 'pdf', label: 'PDF' },
    { value: 'word', label: 'Word documents' },
    { value: 'text', label: 'Text files' },
    { value: 'html', label: 'HTML files' },
    { value: 'document', label: 'Other documents' }
  ])
});

function attachmentExtension(value) {
  const name = String(value || '').split(/[?#]/)[0].trim().replace(/^"|"$/g, '');
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLocaleLowerCase() : '';
}

// Every supported extension, lower-case, as a Set for quick membership tests.
const supportedAttachmentExtensions = new Set([...KINSHIP_ATTACHMENT_TYPES.images, ...KINSHIP_ATTACHMENT_TYPES.documents]);

function attachmentExtensionOf(value) {
  return attachmentExtension(value);
}

// 'image' | 'pdf' | 'text' | 'word' | 'document' | 'html', or '' when unsupported.
function attachmentKind(value) {
  return kinshipAttachmentTypeConfig.kinds[attachmentExtension(value)] || '';
}

function isSupportedAttachment(value) {
  return supportedAttachmentExtensions.has(attachmentExtension(value));
}

// True only for images a browser can actually draw (so TIF/TIFF are excluded).
function isRenderableImage(value) {
  return kinshipAttachmentTypeConfig.renderableImages.includes(attachmentExtension(value));
}

function attachmentKindLabel(value) {
  const kind = attachmentKind(value);
  return kind ? kinshipAttachmentTypeConfig.kindLabels[kind] : 'Unsupported file';
}

function attachmentBadge(value) {
  return kinshipAttachmentTypeConfig.badges[attachmentExtension(value)] || attachmentExtension(value).toLocaleUpperCase().slice(0, 4) || 'FILE';
}

function attachmentKindIcon(value) {
  return kinshipAttachmentTypeConfig.kindIcons[attachmentKind(value)] || 'document';
}

// True for a file that can be shown inline in the attachment viewer.
function attachmentHasInlinePreview(value) {
  return ['text', 'html'].includes(attachmentKind(value));
}

window.KINSHIP_ATTACHMENT_TYPES = KINSHIP_ATTACHMENT_TYPES;
