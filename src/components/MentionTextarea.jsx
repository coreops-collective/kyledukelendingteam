import { useEffect, useRef, useState } from 'react';
import { USERS } from '../data/users.js';

// Textarea with @-typeahead. Wraps a plain <textarea>. As the user
// types "@", a floating list of matching teammates appears; Enter or
// Tab (or click) inserts the picked name. Otherwise behaves exactly
// like a normal textarea — same value / defaultValue / onChange /
// onBlur props. No visual change to the field itself.
export default function MentionTextarea({
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  style,
  minHeight = 160,
  ariaLabel,
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? '');
  const text = controlled ? value : internal;

  const [menu, setMenu] = useState(null); // { start, query, index } | null
  const taRef = useRef(null);

  const emit = (next) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  const handleInput = (ev) => {
    const el = ev.target;
    const next = el.value;
    emit(next);

    // Look backward from the caret for a live @-mention token.
    const caret = el.selectionStart ?? next.length;
    const upToCaret = next.slice(0, caret);
    const at = upToCaret.lastIndexOf('@');
    if (at < 0) { setMenu(null); return; }
    // Only treat as an @-mention if @ is at start-of-input or is
    // preceded by whitespace / newline (avoids matching email addresses).
    const preChar = at === 0 ? '' : upToCaret[at - 1];
    if (preChar && !/\s/.test(preChar)) { setMenu(null); return; }
    const token = upToCaret.slice(at + 1);
    if (/\s/.test(token)) { setMenu(null); return; }
    setMenu({ start: at, query: token, index: 0 });
  };

  const matches = (() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    if (!q) return USERS.slice(0, 5);
    return USERS
      .filter((u) => {
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 5);
  })();

  const insertMention = (user) => {
    if (!user || !menu) return;
    const el = taRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const handle = (user.name || '').split(/\s+/)[0].replace(/[^A-Za-z0-9._-]/g, '');
    const before = text.slice(0, menu.start);
    const after = text.slice(caret);
    const inserted = `@${handle} `;
    const next = before + inserted + after;
    emit(next);
    setMenu(null);
    // Move caret to just after the inserted mention.
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el.focus();
      el.selectionStart = el.selectionEnd = pos;
    });
  };

  const handleKeyDown = (ev) => {
    if (!menu || !matches.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setMenu((m) => m && ({ ...m, index: Math.min(matches.length - 1, m.index + 1) }));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setMenu((m) => m && ({ ...m, index: Math.max(0, m.index - 1) }));
    } else if (ev.key === 'Enter' || ev.key === 'Tab') {
      ev.preventDefault();
      insertMention(matches[menu.index]);
    } else if (ev.key === 'Escape') {
      setMenu(null);
    }
  };

  useEffect(() => {
    if (controlled) return;
    // If parent changed defaultValue between mounts, resync uncontrolled state.
    setInternal(defaultValue ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Small delay so a click on the menu can complete before blur
          // hides it — otherwise the mention insert never runs.
          setTimeout(() => setMenu(null), 100);
          onBlur?.(e);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          width: '100%', minHeight, padding: 12, fontFamily: 'inherit',
          fontSize: 13, lineHeight: 1.55, border: '1px solid #d0d0d0',
          borderRadius: 6, resize: 'both', boxSizing: 'border-box',
          ...style,
        }}
      />
      {menu && matches.length > 0 && (
        <div style={{
          position: 'absolute', left: 12, top: '100%', marginTop: 4,
          background: '#fff', border: '1px solid #d0d0d0',
          borderRadius: 6, boxShadow: '0 8px 20px rgba(0,0,0,.12)',
          zIndex: 10, minWidth: 220, overflow: 'hidden',
        }}>
          {matches.map((u, i) => {
            const on = i === menu.index;
            return (
              <div
                key={u.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                onMouseEnter={() => setMenu((m) => m && ({ ...m, index: i }))}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  background: on ? '#fdecea' : 'transparent',
                  borderLeft: `3px solid ${on ? '#C8102E' : 'transparent'}`,
                  display: 'flex', gap: 10, alignItems: 'center',
                }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: 999, background: '#0A0A0A',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{(u.initials || '??').toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#222' }}>{u.name}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>{u.email}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
