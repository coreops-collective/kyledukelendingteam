import { useEffect, useRef, useState } from 'react';

// Lightweight contenteditable rich text editor. Supports:
//   - Bold, italic, underline
//   - Bulleted + numbered lists
//   - Inserting links
//   - Sanitized HTML paste (strips styles, scripts)
//
// Uses document.execCommand for formatting — deprecated by MDN but still
// supported everywhere and requires zero dependencies. The parent stores
// the current HTML string in `value` and gets updates via `onChange`.
// Merge tags like {{client_name}} are preserved verbatim through
// formatting operations because they're just plain text characters.

const TOOLBAR_BUTTONS = [
  { cmd: 'bold', label: 'B', title: 'Bold (Cmd+B)', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italic (Cmd+I)', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline (Cmd+U)', style: { textDecoration: 'underline' } },
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
];

function sanitizeHtml(html) {
  // Strip <script>, on* attributes, and inline style attributes to keep
  // the editor content safe if it's ever rendered elsewhere. Paste-cleaning
  // is more thorough than what execCommand's built-in insertHTML does.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  let node = walker.nextNode();
  while (node) {
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'META' || node.tagName === 'LINK') {
      toRemove.push(node);
    } else {
      [...node.attributes].forEach((attr) => {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on') || n === 'style' || n === 'class') node.removeAttribute(attr.name);
      });
    }
    node = walker.nextNode();
  }
  toRemove.forEach((n) => n.remove());
  return doc.body.innerHTML;
}

export default function RichTextEditor({ value, onChange, onBlur, placeholder, minHeight = 220, ariaLabel }) {
  const ref = useRef(null);
  const lastValueRef = useRef(value);
  const [hasFocus, setHasFocus] = useState(false);

  // Sync external value → editor only when value actually differs from
  // what we last committed — otherwise React re-renders during typing
  // would keep resetting cursor position to the start.
  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastValueRef.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
      lastValueRef.current = value;
    }
  }, [value]);

  const commit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastValueRef.current = html;
    onChange?.(html);
  };

  const exec = (cmd, arg) => {
    // Editor must be focused for execCommand to act on the right selection.
    ref.current?.focus();
    // eslint-disable-next-line no-undef -- execCommand is available on document
    document.execCommand(cmd, false, arg);
    commit();
  };

  const insertLink = () => {
    const url = window.prompt('Link URL:', 'https://');
    if (!url) return;
    exec('createLink', url);
    // Add target=_blank to any freshly created anchor so preview clicks
    // don't nav away from the editor context.
    if (ref.current) {
      ref.current.querySelectorAll('a[href]').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
      commit();
    }
  };

  const onPaste = (e) => {
    // Prefer the plain-text version of a paste. If HTML is present we
    // sanitize before insertion. This kills Google Docs / Word style
    // pollution that otherwise makes emails look terrible.
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      const clean = sanitizeHtml(html);
      document.execCommand('insertHTML', false, clean);
      commit();
      return;
    }
    // Plain text path: let default happen so line breaks work.
  };

  return (
    <div style={{
      border: '1px solid #ddd', borderRadius: 6, background: '#fff',
      boxShadow: hasFocus ? '0 0 0 3px rgba(200,16,46,.12)' : 'none',
      transition: 'box-shadow .12s',
    }}>
      <div style={{
        display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid #eee',
        background: '#fafafa', borderTopLeftRadius: 6, borderTopRightRadius: 6,
        flexWrap: 'wrap',
      }}>
        {TOOLBAR_BUTTONS.map((b) => (
          <button
            key={b.cmd}
            type="button"
            title={b.title}
            onMouseDown={(e) => e.preventDefault()} // don't blur editor
            onClick={() => exec(b.cmd)}
            style={{
              minWidth: 30, height: 26, padding: '0 8px', fontSize: 12,
              background: '#fff', border: '1px solid #d0d0d0', borderRadius: 4,
              cursor: 'pointer', color: '#333', ...(b.style || {}),
            }}
          >{b.label}</button>
        ))}
        <button
          type="button"
          title="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
          style={{
            minWidth: 30, height: 26, padding: '0 10px', fontSize: 12,
            background: '#fff', border: '1px solid #d0d0d0', borderRadius: 4,
            cursor: 'pointer', color: '#c62828', fontWeight: 700,
          }}
        >🔗 Link</button>
        <button
          type="button"
          title="Remove formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('removeFormat')}
          style={{
            marginLeft: 'auto', height: 26, padding: '0 8px', fontSize: 11,
            background: '#fff', border: '1px solid #d0d0d0', borderRadius: 4,
            cursor: 'pointer', color: '#666',
          }}
        >Clear formatting</button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel || 'Rich text editor'}
        onInput={commit}
        onBlur={() => { setHasFocus(false); commit(); onBlur?.(); }}
        onFocus={() => setHasFocus(true)}
        onPaste={onPaste}
        suppressContentEditableWarning
        style={{
          minHeight, padding: '12px 14px', outline: 'none',
          fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, color: '#222',
        }}
        data-placeholder={placeholder || ''}
      />
      <style>{`
        [contenteditable]:empty::before { content: attr(data-placeholder); color: #aaa; }
        [contenteditable] a { color: #c62828; text-decoration: underline; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 22px; margin: 4px 0; }
        [contenteditable] li { margin-bottom: 3px; }
      `}</style>
    </div>
  );
}
