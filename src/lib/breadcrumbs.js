// Small in-memory ring buffer of the user's last N interactions,
// captured by global listeners so any surface (esp. the Report an
// Issue dialog) can attach a "what were they doing before this went
// wrong" trail without needing per-view instrumentation.
//
// Privacy: we NEVER capture the text a user typed into an input,
// textarea, contenteditable, or select. For click events we walk up
// from the target and record a visible identifier (aria-label →
// data-tour → title → visible text stripped to 80 chars → tag/role).
// If the target itself is an editable element, we skip the click
// entirely — the label would be the pre-existing value and could
// leak content.
//
// initBreadcrumbs() is safe to call multiple times; it self-guards.

const MAX = 20;
const buffer = [];
let initialized = false;

function trim(s, max = 80) {
  if (!s) return '';
  const clean = String(s).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function push(entry) {
  buffer.push({ at: new Date().toISOString(), ...entry });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
}

// Find the closest useful identifier for a clicked element without
// pulling any user-typed text. Order of preference:
//   1. aria-label on this or a wrapping element (buttons, links, chips)
//   2. data-tour attribute (existing convention across the app)
//   3. title attribute
//   4. visible text content, trimmed to 80 chars
//   5. tag[role]
function describeClickTarget(el) {
  let cur = el;
  const walk = [];
  while (cur && cur.nodeType === 1 && walk.length < 8) {
    if (isEditable(cur)) return null; // privacy: skip clicks inside editable
    const aria = cur.getAttribute && cur.getAttribute('aria-label');
    if (aria) return trim(aria);
    const dataTour = cur.getAttribute && cur.getAttribute('data-tour');
    if (dataTour) return `[data-tour=${trim(dataTour, 40)}]`;
    const title = cur.getAttribute && cur.getAttribute('title');
    if (title) return trim(title);
    walk.push(cur);
    cur = cur.parentElement;
  }
  // Fall back to visible text on the innermost hit. Buttons often
  // have their label as textContent (e.g. "Save Now", "Send report").
  const text = el.textContent || '';
  if (text.trim()) return trim(text);
  // Last-resort structural fallback.
  const role = el.getAttribute && el.getAttribute('role');
  return `<${(el.tagName || 'node').toLowerCase()}${role ? ` role=${role}` : ''}>`;
}

function onClick(e) {
  try {
    const label = describeClickTarget(e.target);
    if (!label) return; // click was inside an editable, skipped
    push({ kind: 'click', label });
  } catch { /* swallow — breadcrumb collection must never break the UI */ }
}

function onNav() {
  try {
    push({ kind: 'nav', label: window.location.pathname + window.location.search });
  } catch { /* swallow */ }
}

// react-router pushes/replaces don't emit popstate on their own. We
// wrap history.pushState / replaceState once so client-side route
// changes generate a breadcrumb the same way a back/forward does.
function patchHistory() {
  const orig = { pushState: history.pushState, replaceState: history.replaceState };
  history.pushState = function () {
    const r = orig.pushState.apply(this, arguments);
    onNav();
    return r;
  };
  history.replaceState = function () {
    const r = orig.replaceState.apply(this, arguments);
    onNav();
    return r;
  };
}

function argsToLine(args) {
  return args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

function patchConsole() {
  ['error', 'warn'].forEach((level) => {
    const orig = console[level];
    console[level] = function (...args) {
      try {
        push({ kind: `console-${level}`, label: trim(argsToLine(args), 200) });
      } catch { /* swallow */ }
      return orig.apply(this, args);
    };
  });
}

function wireGlobalErrors() {
  window.addEventListener('error', (e) => {
    try {
      const src = e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno || 0}` : '';
      push({ kind: 'window-error', label: trim(`${e.message || 'Error'}${src}`, 200) });
    } catch { /* swallow */ }
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const r = e.reason;
      const msg = r instanceof Error ? `${r.name}: ${r.message}` : (typeof r === 'string' ? r : JSON.stringify(r));
      push({ kind: 'unhandled-rejection', label: trim(msg, 200) });
    } catch { /* swallow */ }
  });
}

export function initBreadcrumbs() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  // Use capture phase so we get the click even if a handler stops
  // propagation (very common with drawers / dialogs).
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onNav);
  patchHistory();
  patchConsole();
  wireGlobalErrors();
  // Seed with the initial route so a session-start report isn't
  // just an empty trail.
  onNav();
}

export function getBreadcrumbs() {
  return buffer.slice();
}
