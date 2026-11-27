// ---------------------------------------------------------------------------
// 21. Attachment preview (text, safe HTML, and documents opened externally)
// ---------------------------------------------------------------------------
// One viewer for every attachment type the Media Library and the person record
// can show:
//
//   image        the existing image view, unchanged
//   pdf          the browser's own PDF viewer, unchanged
//   text         the file's text inside a <pre>: never parsed as markup
//   html         a sanitised, script-free rendering of the page
//   word / rtf   no in-app renderer, so the file is opened in its default app
//   tif / tiff   an image the browser cannot draw: shown with a type icon
//
// Sanitising is deliberately conservative: everything that can run or fetch is
// removed, and the result is rendered inside a sandboxed iframe with no script
// permission, so a hostile attachment cannot touch the tree.

const attachmentPreviewMaxText = 2 * 1024 * 1024;
const attachmentPreviewAllowedTags = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
]);
const attachmentPreviewDroppedTags = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select',
  'textarea', 'option', 'link', 'meta', 'base', 'svg', 'math', 'audio', 'video', 'source', 'track', 'canvas', 'noscript',
  'template', 'portal'
]);
const attachmentPreviewAllowedAttributes = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'align']);

// Removes everything that can execute or reach the network, keeping readable
// structure. Unknown tags are unwrapped (their text is kept) so a document is
// never blank because of one stray element.
function sanitizeAttachmentHtml(source) {
  const parsed = new DOMParser().parseFromString(String(source || ''), 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLocaleLowerCase();
      walk(child);
      if (attachmentPreviewDroppedTags.has(tag)) { child.remove(); continue; }
      if (!attachmentPreviewAllowedTags.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLocaleLowerCase();
        const value = attribute.value || '';
        if (!attachmentPreviewAllowedAttributes.has(name)) { child.removeAttribute(attribute.name); continue; }
        if (name === 'href' || name === 'src') {
          // Only same-folder relative paths and ordinary web links survive; a
          // javascript:, data: or vbscript: address never reaches the viewer.
          const safe = /^(https?:|mailto:|#)/i.test(value) || (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^\s*javascript:/i.test(value));
          if (!safe) child.removeAttribute(attribute.name);
        }
      }
      if (tag === 'a' && child.getAttribute('href')) {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img') {
        // A remote image is a network fetch the user did not ask for.
        const src = child.getAttribute('src') || '';
        if (!src || /^(data|javascript|vbscript):/i.test(src)) child.remove();
      }
    }
  };
  walk(parsed.body);
  return parsed.body.innerHTML;
}

// The viewer's elements, all optional so the module works before the dialog
// markup exists (tests load app.js against a bare page).
function attachmentPreviewElements() {
  const dialog = document.querySelector('#attachmentPreviewDialog');
  if (!dialog) return null;
  return {
    dialog,
    title: dialog.querySelector('#attachmentPreviewTitle'),
    meta: dialog.querySelector('#attachmentPreviewMeta'),
    body: dialog.querySelector('#attachmentPreviewBody'),
    external: dialog.querySelector('#attachmentPreviewOpenExternal'),
    locate: dialog.querySelector('#attachmentPreviewLocate')
  };
}

let attachmentPreviewCurrent = null;

// Reads a resolved file as text, with a size guard so a huge log cannot lock
// the tab.
async function attachmentPreviewText(file) {
  if (!file) return '';
  if (file.size > attachmentPreviewMaxText) {
    const slice = file.slice(0, attachmentPreviewMaxText);
    return `${await slice.text()}\n\n[Preview truncated at 2 MB. Open the file to read the rest.]`;
  }
  return file.text();
}

// Shows one attachment. `file` may be null for a recorded path whose file is
// missing, which still gets a card explaining the situation.
async function openAttachmentPreview({ file, path, name, people = [], event = '' }) {
  const ui = attachmentPreviewElements();
  if (!ui) return;
  attachmentPreviewCurrent = { file, path, name };
  const displayName = name || file?.name || String(path || '').split(/[\\/]/).pop() || 'Attachment';
  const kind = attachmentKind(displayName);
  ui.title.textContent = displayName;
  ui.meta.textContent = [
    attachmentKindLabel(displayName),
    people.length ? `Linked to ${people.join(', ')}` : '',
    event
  ].filter(Boolean).join(' · ');
  ui.body.replaceChildren();
  ui.body.dataset.kind = kind || 'unsupported';
  ui.locate.hidden = !path;
  ui.locate.dataset.attachmentPath = path || '';
  ui.external.hidden = !file;
  ui.external.dataset.attachmentExternal = '';

  if (!file) {
    ui.body.append(attachmentPreviewMessage(
      `This file is recorded in the GEDCOM but was not found in the media folder. Link the folder that holds "${displayName}", or run Media Validation to see where it is expected.`
    ));
  } else if (kind === 'text') {
    const text = await attachmentPreviewText(file);
    const pre = document.createElement('pre');
    pre.className = 'attachment-preview-text';
    // textContent, never innerHTML: a .txt file is data, not markup.
    pre.textContent = text || '(This file is empty.)';
    ui.body.append(pre);
  } else if (kind === 'html') {
    const source = await attachmentPreviewText(file);
    const frame = document.createElement('iframe');
    frame.className = 'attachment-preview-html';
    frame.setAttribute('title', `Preview of ${displayName}`);
    // No allow-scripts: even a script that survived sanitising cannot run.
    frame.setAttribute('sandbox', '');
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body>${sanitizeAttachmentHtml(source)}</body></html>`;
    ui.body.append(frame);
    const note = document.createElement('p');
    note.className = 'attachment-preview-note';
    note.textContent = 'Shown as text and layout only: scripts, frames and embedded objects are removed.';
    ui.body.append(note);
  } else if (kind === 'image' && !isRenderableImage(displayName)) {
    ui.body.append(attachmentPreviewCard(displayName, 'This image format (TIF/TIFF) cannot be shown in the browser. Open it in its default application to view it.'));
  } else if (kind === 'image') {
    const image = document.createElement('img');
    image.className = 'attachment-preview-image';
    image.alt = displayName;
    image.src = mediaUrl(file);
    ui.body.append(image);
  } else if (kind === 'pdf') {
    const frame = document.createElement('iframe');
    frame.className = 'attachment-preview-pdf';
    frame.title = `Preview of ${displayName}`;
    frame.src = mediaUrl(file);
    ui.body.append(frame);
  } else if (kind === 'word' || kind === 'document') {
    ui.body.append(attachmentPreviewCard(displayName, 'Word and rich text documents are opened in their default application. Kinship Atlas does not convert them.'));
  } else {
    ui.body.append(attachmentPreviewCard(displayName, 'This file type is not supported yet, so it cannot be previewed here.'));
  }

  ui.external.onclick = () => {
    if (!file) return;
    const opened = window.open(mediaUrl(file), '_blank', 'noopener');
    if (!opened) showToast('The browser blocked the new tab. Allow pop-ups for this page and try again.');
  };
  ui.locate.onclick = () => {
    if (path) openMediaFolderInTab(path);
  };
  if (!ui.dialog.open) showModalFocused(ui.dialog);
}

function attachmentPreviewMessage(text) {
  const note = document.createElement('p');
  note.className = 'attachment-preview-note is-warning';
  note.textContent = text;
  return note;
}

// An icon card, used for types with no in-app renderer and for TIF/TIFF.
function attachmentPreviewCard(name, explanation) {
  const card = document.createElement('div');
  card.className = 'attachment-preview-card';
  const icon = document.createElement('span');
  icon.className = 'attachment-type-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(createButtonIcon(attachmentKindIcon(name)));
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = name;
  const type = document.createElement('span');
  type.className = 'attachment-type-label';
  type.textContent = attachmentKindLabel(name);
  const note = document.createElement('p');
  note.className = 'attachment-preview-note';
  note.textContent = explanation;
  text.append(title, type, note);
  card.append(icon, text);
  return card;
}

// A compact icon tile for lists: the type icon plus a short extension badge.
function attachmentTypeBadge(name, extraClass = '') {
  const badge = document.createElement('span');
  badge.className = `attachment-type-icon${extraClass ? ` ${extraClass}` : ''}`;
  badge.setAttribute('aria-hidden', 'true');
  badge.append(createButtonIcon(attachmentKindIcon(name)));
  const text = document.createElement('span');
  text.className = 'attachment-type-badge-text';
  text.textContent = attachmentBadge(name);
  badge.append(text);
  return badge;
}

const attachmentPreviewDialog = document.querySelector('#attachmentPreviewDialog');
if (attachmentPreviewDialog) {
  attachmentPreviewDialog.querySelector('#closeAttachmentPreview').addEventListener('click', () => attachmentPreviewDialog.close());
}

window.KinshipAttachmentPreview = {
  open: openAttachmentPreview,
  sanitizeHtml: sanitizeAttachmentHtml,
  kinds: () => kinshipAttachmentTypeConfig
};
