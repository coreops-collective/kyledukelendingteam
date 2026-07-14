import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOANS } from '../data/loans.js';
import { PARTNERS } from '../data/partners.js';
import { USERS } from '../data/users.js';
import { getWorkflows } from '../lib/workflows.js';

// Substring scoring — case-insensitive. Prefix match beats mid-string
// match. Every matched item comes back with a numeric score; higher =
// better. Non-matches return -1.
function scoreOne(haystack, needle) {
  if (!haystack) return -1;
  const h = String(haystack).toLowerCase();
  const n = needle.toLowerCase();
  const idx = h.indexOf(n);
  if (idx < 0) return -1;
  if (idx === 0) return 100 - Math.max(0, h.length - n.length);
  return 60 - idx;
}
function bestScore(fields, needle) {
  let best = -1;
  for (const f of fields) {
    const s = scoreOne(f, needle);
    if (s > best) best = s;
  }
  return best;
}

// Search all in-memory stores for a needle. Returns up to `perGroup`
// hits per category, ordered by score descending. Groups: Loans,
// Partners, Team, Workflows.
function search(needle, perGroup = 6) {
  if (!needle || needle.length < 2) return { groups: [] };
  const groups = [];

  const loanHits = LOANS.filter((l) => !l.archived)
    .map((l) => ({
      score: bestScore([l.borrower, l.property, l.id, l.email, l.phone, l.agent], needle),
      item: l,
    }))
    .filter((h) => h.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perGroup);
  if (loanHits.length) groups.push({ kind: 'loans', label: 'Loans', hits: loanHits });

  const partnerHits = PARTNERS
    .map((p) => ({
      score: bestScore([p.name, p.brokerage, p.email, p.phone], needle),
      item: p,
    }))
    .filter((h) => h.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perGroup);
  if (partnerHits.length) groups.push({ kind: 'partners', label: 'Partners', hits: partnerHits });

  const userHits = USERS
    .map((u) => ({
      score: bestScore([u.name, u.email, u.role, u.initials], needle),
      item: u,
    }))
    .filter((h) => h.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perGroup);
  if (userHits.length) groups.push({ kind: 'team', label: 'Team', hits: userHits });

  const workflowHits = getWorkflows()
    .map((w) => ({
      score: bestScore([w.name, w.category, w.description], needle),
      item: w,
    }))
    .filter((h) => h.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perGroup);
  if (workflowHits.length) groups.push({ kind: 'workflows', label: 'Workflows', hits: workflowHits });

  return { groups };
}

// Flatten the groups into a single indexable list so arrow keys can
// walk across category boundaries. Each entry carries its group kind
// so the click / navigate handler knows what to do.
function flattenGroups(groups) {
  const flat = [];
  for (const g of groups) {
    for (const h of g.hits) {
      flat.push({ kind: g.kind, item: h.item });
    }
  }
  return flat;
}

// Cmd+K / Ctrl+K global fuzzy search across loans, partners, team,
// and workflows. Renders as a modal; ESC closes; arrows navigate;
// Enter opens the highlighted result. Clicking a loan navigates to
// /loanmgmt and appends ?loan=<id> as a signal for LoanManagement to
// open the drawer for that loan (kept simple: LoanManagement listens
// for the query and opens on mount if present).
export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const results = useMemo(() => search(query), [query]);
  const flat = useMemo(() => flattenGroups(results.groups), [results]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(flat.length - 1, c + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = flat[cursor];
        if (picked) openHit(picked);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, cursor, flat, onClose]);

  const openHit = (hit) => {
    if (hit.kind === 'loans') {
      navigate(`/loanmgmt?loan=${encodeURIComponent(hit.item.id)}`);
    } else if (hit.kind === 'partners') {
      navigate(`/partners?partner=${encodeURIComponent(hit.item.name || '')}`);
    } else if (hit.kind === 'team') {
      navigate('/team');
    } else if (hit.kind === 'workflows') {
      navigate(`/workflows?wf=${encodeURIComponent(hit.item.id)}`);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,10,.55)',
        zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 20px 0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, background: '#fff',
          borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,.25)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #eee' }}>
          <span aria-hidden style={{ fontSize: 18, color: '#888' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loans, partners, team, workflows…"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              background: 'transparent', padding: '4px 0',
            }}
          />
          <span style={{
            fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.5px',
            color: '#888', border: '1px solid #ddd', borderRadius: 4,
            padding: '3px 6px',
          }}>ESC</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {query.length < 2 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}>
              Type at least 2 characters to search.
            </div>
          ) : flat.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}>
              No matches for "{query}".
            </div>
          ) : (
            results.groups.map((g) => (
              <div key={g.kind}>
                <div style={{
                  padding: '8px 18px 4px', fontSize: 10, fontWeight: 700,
                  fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase',
                  letterSpacing: '.7px', color: '#888',
                }}>
                  {g.label}
                </div>
                {g.hits.map((h) => {
                  const flatIdx = flat.findIndex((f) => f.item === h.item && f.kind === g.kind);
                  const on = flatIdx === cursor;
                  return (
                    <div
                      key={g.kind + (h.item.id || h.item.name || '')}
                      onMouseEnter={() => setCursor(flatIdx)}
                      onClick={() => openHit({ kind: g.kind, item: h.item })}
                      style={{
                        padding: '10px 18px', cursor: 'pointer',
                        background: on ? '#fdecea' : 'transparent',
                        borderLeft: `3px solid ${on ? '#C8102E' : 'transparent'}`,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>
                        {g.kind === 'loans'
                          ? h.item.borrower
                          : g.kind === 'partners'
                          ? h.item.name
                          : g.kind === 'team'
                          ? h.item.name
                          : h.item.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {g.kind === 'loans'
                          ? `${h.item.property || h.item.id || '—'} · ${h.item.status || h.item.stage || '—'} · ${h.item.lo || '—'}`
                          : g.kind === 'partners'
                          ? h.item.brokerage || h.item.email || ''
                          : g.kind === 'team'
                          ? `${h.item.role || ''} · ${h.item.email || ''}`
                          : `${h.item.category || ''} · ${h.item.description || ''}`.slice(0, 80)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '10px 18px', borderTop: '1px solid #eee',
          display: 'flex', gap: 14, fontSize: 10, color: '#888',
          fontFamily: "'Oswald',sans-serif", letterSpacing: '.5px', textTransform: 'uppercase',
        }}>
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>ESC</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}
