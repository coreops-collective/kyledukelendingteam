// Small, defensive markdown → HTML converter used across the app for
// rendering AI-generated content in the rich text editor and the PDF
// export. Intentionally minimal — handles the subset the AI Suggest
// prompt emits: paragraphs, bold, italic, bullets, numbered lists.
//
// Anything unsupported stays as escaped text so a stray `<script>` in
// AI output can't execute.

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormatting(line) {
  return line
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// Convert markdown text to a small HTML fragment. Returns HTML string.
// - Blank lines separate paragraphs.
// - Lines starting with "- " or "* " become <ul><li>.
// - Lines starting with "1. " (or any digit + period) become <ol><li>.
// - Everything else wraps in <p>.
export function markdownToHtml(md) {
  const safe = escapeHtml(md || '');
  const lines = safe.split(/\r?\n/);
  const out = [];
  let listType = null; // 'ul' | 'ol' | null
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  for (const raw of lines) {
    const line = inlineFormatting(raw);
    const isBullet = /^\s*[-*]\s+/.test(line);
    const isNumbered = /^\s*\d+\.\s+/.test(line);
    if (isBullet) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`);
    } else if (isNumbered) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${line.replace(/^\s*\d+\.\s+/, '')}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  return out.join('');
}

// True if the string is already HTML (contains any tag). Used to decide
// whether to run markdown conversion on incoming content.
export function looksLikeHtml(s) {
  return /<[a-z][\s\S]*>/i.test(String(s || ''));
}

// Normalize any content (plain text, markdown, or HTML) to a safe HTML
// fragment for the rich text editor. HTML passes through untouched.
export function toEditorHtml(content) {
  if (!content) return '';
  return looksLikeHtml(content) ? content : markdownToHtml(content);
}
