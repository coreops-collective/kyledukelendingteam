import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES, STATUS_TO_STAGE, STAGE_TO_STATUS } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import LoanDrawer from '../components/LoanDrawer.jsx';
import NewLoanDrawer from '../components/NewLoanDrawer.jsx';
import { markLoansDirty, saveLoansNow, subscribeLoans } from '../lib/loansStore.js';
import { fireWebhooks } from '../lib/webhooks.js';
import { appendNotesHistory, loadNotesHistory } from '../lib/notesHistory.js';
import { parseLocalDate } from '../lib/clientDates.js';
import Tour from '../components/Tour.jsx';

const MONTHS_FULL = ['All','January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

function parseDate(s) {
  return parseLocalDate(s);
}
function dateClass(s, done) {
  const d = parseDate(s);
  if (!d) return '';
  // If the deadline has been satisfied (e.g. ICD signed), color it yellow
  // instead of red so it reads "complete, no longer urgent" rather than
  // "you missed it".
  if (done) return 'done';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((d - today) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return '';
}

// Compute the ICD deadline as 3 business days before close date — Mon-Fri
// only. Weekends are skipped because the team can't send ICDs on Sat/Sun.
// Returns YYYY-MM-DD or '' if the close date is missing / invalid.
function computeIcdDeadline(closeDate) {
  const d = parseDate(closeDate);
  if (!d) return '';
  const out = new Date(d);
  let counted = 0;
  while (counted < 3) {
    out.setDate(out.getDate() - 1);
    const dow = out.getDay();
    if (dow !== 0 && dow !== 6) counted++; // 0=Sun, 6=Sat
  }
  return out.toISOString().slice(0, 10);
}
function getYearFromDate(s) {
  const d = parseDate(s);
  return d ? String(d.getFullYear()) : '';
}
function getMonthFromDate(s) {
  const d = parseDate(s);
  return d ? MONTHS_FULL[d.getMonth() + 1] : '';
}

function statusOf(l) {
  return l.status || STAGE_TO_STATUS[l.stage] || l.stage || '';
}
function statusSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

const STATUSES = ['All','New Contract','Disclosed','Processing','Underwriting','CTC Required','CTC','BTP','Approved','Funded','Adversed','Archived'];
const LOS_LIST = ['All','Kyle','Missy'];
const TYPES = ['All','CONV','FHA','VA','Jumbo'];
const SALE_TYPES = ['All','PURCHASE','REFINANCE'];
const LEAD_SOURCES = ['Realtor Referral','Self-Generated','Past Client','Veteran Network','Zillow','Other'];

// ── Deadlines panel ─────────────────────────────────────────────
function DeadlinesPanel({ loans, onOpen }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const items = [];
  loans.forEach((l) => {
    const checks = [
      { type: 'Appraisal Deadline', date: l.apprDeadline, done: l.apprReceived },
      { type: 'Lock Expires', date: l.lockExp, done: l.stage === 'funded' },
      { type: 'ICD Deadline', date: l.icdDeadline, done: l.icdSigned },
    ];
    checks.forEach((ch) => {
      const d = parseDate(ch.date);
      if (!d || ch.done) return;
      const daysAway = Math.ceil((d - today) / 86400000);
      if (daysAway > 30) return;
      items.push({ loan: l, type: ch.type, date: ch.date, daysAway });
    });
  });
  items.sort((a, b) => a.daysAway - b.daysAway);
  const overdue = items.filter((d) => d.daysAway < 0);
  const thisWeek = items.filter((d) => d.daysAway >= 0 && d.daysAway <= 7);
  const later = items.filter((d) => d.daysAway > 7);
  if (!items.length) return null;

  const row = (d, accent) => (
    <div key={d.loan.id + d.type}
      onClick={() => onOpen(d.loan.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        background: '#fff', border: '1px solid #e5e5e5', borderLeft: `4px solid ${accent}`,
        borderRadius: 6, marginBottom: 6, cursor: 'pointer',
      }}>
      <div style={{
        background: accent, color: '#fff', fontFamily: "'Oswald',sans-serif",
        fontWeight: 700, fontSize: 10, padding: '4px 9px', borderRadius: 10,
        minWidth: 50, textAlign: 'center',
      }}>
        {d.daysAway < 0 ? (-d.daysAway + 'd late') : d.daysAway === 0 ? 'TODAY' : (d.daysAway + 'd')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#222' }}>{d.loan.borrower}</div>
        <div style={{ fontSize: 10, color: '#888' }}>{d.type}</div>
      </div>
      <div style={{ fontSize: 10, color: '#888', fontFamily: 'Menlo,monospace' }}>{d.date}</div>
    </div>
  );

  const col = (label, color, arr) => (
    <div>
      <div style={{
        fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.5px', color, marginBottom: 8,
      }}>
        {label} ({arr.length})
      </div>
      {arr.length ? arr.map((d) => row(d, color))
        : <div style={{ color: '#bbb', fontSize: 11, fontStyle: 'italic' }}>None</div>}
    </div>
  );

  return (
    <div className="card" data-tour="deadlines-panel" style={{ marginBottom: 18 }}>
      <div className="section-header">
        <div className="section-title">Deadlines</div>
        <div className="section-sub">
          {overdue.length} overdue · {thisWeek.length} this week · {later.length} upcoming
        </div>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {col('Overdue', '#c62828', overdue)}
          {col('This Week', '#e65100', thisWeek)}
          {col('8–30 Days', '#666', later)}
        </div>
      </div>
    </div>
  );
}

// ── Notes drawer ────────────────────────────────────────────────
function NotesDrawer({ loan, onSave, onClose }) {
  const initialNotes = loan.notes || '';
  const [notes, setNotes] = useState(initialNotes);
  const [history, setHistory] = useState(null); // null = not loaded, [] = empty, [...] = loaded
  const [showHistory, setShowHistory] = useState(false);

  // Prevent accidental loss of a paragraph of notes: if the text has
  // been changed since open and the user tries to close (overlay,
  // ×, Cancel), confirm before dropping it on the floor.
  const isDirty = notes !== initialNotes;
  const safeClose = () => {
    if (isDirty && !window.confirm('Discard unsaved notes changes?')) return;
    onClose();
  };

  // Drawer width is drag-resizable from the left edge and persists so the
  // team can keep it as wide as they like across sessions. Default 720px,
  // min 420 (still readable on phones), max 95vw.
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem('kdt-notes-drawer-width') || '', 10);
    return Number.isFinite(stored) && stored >= 420 ? stored : 720;
  });
  const drawerWidthRef = useRef(drawerWidth);
  useEffect(() => { drawerWidthRef.current = drawerWidth; }, [drawerWidth]);
  const startDrawerResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = drawerWidth;
    const maxW = Math.floor(window.innerWidth * 0.95);
    const onMove = (ev) => {
      // Dragging LEFT (clientX decreasing) makes the drawer wider, since
      // the drawer is anchored to the right edge.
      const next = Math.min(maxW, Math.max(420, startW + (startX - ev.clientX)));
      setDrawerWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('kdt-notes-drawer-width', String(drawerWidthRef.current)); } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    if (history === null) {
      const rows = await loadNotesHistory(loan.id);
      setHistory(rows);
    }
    setShowHistory(true);
  };

  if (!loan) return null;
  return (
    <>
      <div className="drawer-overlay open" onClick={safeClose} />
      <aside className="drawer open" style={{ width: drawerWidth, maxWidth: '95vw' }}>
        <span
          onMouseDown={startDrawerResize}
          title="Drag to resize"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 2,
            background: 'linear-gradient(to right, rgba(0,0,0,.06), transparent)',
          }}
        />
        <div className="drawer-head">
          <button className="drawer-close" onClick={safeClose} aria-label="Close">×</button>
          <div className="drawer-stage">Notes</div>
          <div className="drawer-borrower">{loan.borrower}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{loan.property || ''}</div>
        </div>
        <div className="drawer-body">
          <div className="form-field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Loan Notes · all text visible and editable</span>
              <button
                type="button"
                onClick={toggleHistory}
                style={{ background: 'transparent', border: '1px solid #d0d0d0', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {showHistory ? 'Hide history' : 'View history'}
              </button>
            </label>
            <textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                minHeight: 420, width: '100%', padding: 14,
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6,
                border: '1px solid var(--border)', borderRadius: 8, resize: 'both',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {showHistory && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee' }}>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10 }}>
                Previous Versions
              </div>
              {history && history.length === 0 ? (
                <div style={{ color: '#888', fontSize: 12, fontStyle: 'italic' }}>
                  No prior versions yet. Future edits will appear here.
                </div>
              ) : history ? (
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {history.map((h) => (
                    <div key={h.id} style={{ marginBottom: 12, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#555' }}>
                          {new Date(h.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          {h.edited_by ? ` · ${h.edited_by}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotes(h.notes || '')}
                          style={{ background: '#fff', border: '1px solid #d0d0d0', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}
                          title="Restore this version into the editor (save to commit)"
                        >
                          Restore
                        </button>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#222', lineHeight: 1.5 }}>
                        {h.notes || '(empty)'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: 12 }}>Loading…</div>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, color: '#888', marginTop: 10, fontStyle: 'italic' }}>
            Supports line breaks. Saves back to the loan record and reflects everywhere. Each save snapshots the previous notes so accidental clears can be recovered.
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={safeClose}>Cancel</button>
          <button className="drawer-btn primary" onClick={() => { onSave(notes); onClose(); }}>Save Notes</button>
        </div>
      </aside>
    </>
  );
}

// ── Editable cells ──────────────────────────────────────────────
const cellInputStyle = {
  width: '100%', padding: '6px 8px', border: '1px solid transparent',
  background: 'transparent', fontSize: 12, fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function EditInput({ value, onChange, type = 'text', ...rest }) {
  return (
    <input
      type={type}
      defaultValue={value ?? ''}
      onBlur={(e) => onChange(type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={cellInputStyle}
      {...rest}
    />
  );
}
function EditSelect({ value, options, onChange, empty }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={cellInputStyle}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function EditCheck({ value, onChange }) {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

// ── Click-to-zoom text cell ──────────────────────────────────────
// Cells in the spreadsheet are narrow, so phone numbers / emails /
// property addresses / co-borrower fields get truncated to "..." and are
// hard to read. Clicking opens a centered modal with the value rendered
// large enough to actually see, plus an editable input for changes.
function ZoomEditCell({ label, value, onChange, type = 'text', multiline = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const handleOpen = () => { setDraft(value ?? ''); setOpen(true); };
  const handleSave = () => { onChange(draft); setOpen(false); };
  const handleCancel = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'Enter' && !multiline && !e.shiftKey) {
        onChange(draft);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, draft, multiline, onChange]);

  const link = (type === 'tel' && value) ? `tel:${value}`
            : (type === 'email' && value) ? `mailto:${value}`
            : null;

  return (
    <>
      <div
        onClick={handleOpen}
        title={value || `Click to edit ${label}`}
        style={{
          padding: '6px 10px', fontSize: 11,
          color: value ? '#222' : '#bbb',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center',
        }}
      >
        {value || `Click to add ${label.toLowerCase()}`}
      </div>
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 'min(560px, 92vw)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#666', marginBottom: 10 }}>
              {label}
            </div>
            {multiline ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                style={{ width: '100%', fontSize: 16, padding: 12, border: '1px solid #d0d0d0', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            ) : (
              <input
                autoFocus
                type={type === 'tel' || type === 'email' ? 'text' : type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ width: '100%', fontSize: 20, padding: '12px 14px', border: '1px solid #d0d0d0', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            )}
            {link && (
              <div style={{ marginTop: 12 }}>
                <a href={link} style={{ fontSize: 14, color: '#1976d2', textDecoration: 'underline' }}>
                  {type === 'tel' ? `Call ${value}` : `Email ${value}`}
                </a>
              </div>
            )}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={handleCancel} style={{ padding: '8px 16px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: 'var(--brand-red, #c62828)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Color legend ────────────────────────────────────────────────
function ColorLegend() {
  const [open, setOpen] = useState(false);
  const swatches = [
    { label: 'Disclosed', bg: '#e1bee7', bar: '#7b1fa2' },
    { label: 'Processing', bg: '#bbdefb', bar: '#1976d2' },
    { label: 'Underwriting', bg: '#bbdefb', bar: '#1976d2' },
    { label: 'CTC Required', bg: '#ffe082', bar: '#f57c00' },
    { label: 'CTC', bg: '#fff3c4', bar: '#f5c518' },
    { label: 'Approved', bg: '#dcedc8', bar: '#2e7d32' },
    { label: 'Funded', bg: '#a5d6a7', bar: '#2e7d32' },
    { label: 'BTP / Adversed', bg: '#ffcdd2', bar: '#c62828' },
  ];
  const dateSwatches = [
    { label: 'Date overdue', bg: '#ffebee', color: '#c62828' },
    { label: 'Due within 7 days', bg: '#fff8e1', color: '#e65100' },
  ];
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 14, fontSize: 11, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', padding: '10px 14px', background: 'transparent',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 10, fontFamily: "'Oswald',sans-serif", fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.6px', color: '#555',
          fontSize: 11, textAlign: 'left',
        }}
      >
        <span style={{ transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
        Color Key
        {!open && <span style={{ color: '#999', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>(click to show)</span>}
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          {swatches.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 18, height: 14, background: s.bg, borderLeft: `3px solid ${s.bar}`, borderRadius: 2 }} />
              {s.label}
            </div>
          ))}
          <div style={{ width: 1, height: 18, background: '#e5e5e5', margin: '0 4px' }} />
          {dateSwatches.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: s.bg, color: s.color, fontFamily: 'Menlo,monospace', fontWeight: 700, fontSize: 10, padding: '2px 6px', borderRadius: 3 }}>
                MM/DD
              </span>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table view (spreadsheet) ────────────────────────────────────
function SortHeader({ field, label, width, onAdjustWidth, sort, onSort }) {
  const active = sort && sort.key === field;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      style={{ width, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'relative' }}
      onClick={() => onSort && onSort(field)}
      title={`Sort by ${label}`}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span>{label}{arrow}</span>
        {onAdjustWidth && <ColWidthButtons onAdjust={(d) => onAdjustWidth(field, d)} />}
      </span>
    </th>
  );
}

// Spreadsheet-style column resize handle. Uses pointer events with
// setPointerCapture so the drag stays bound to this element even if the
// cursor leaves the table, and writes the new width directly to the
// parent th's DOM style during the drag for instant visual feedback —
// then commits to React state + localStorage on pointer up.
//
// Why direct DOM during drag: setState every mousemove rebuilds the
// table on each frame, which was lagging hard enough that some users
// thought the drag wasn't working at all.
// Plus / minus buttons next to a column header label. Each click bumps
// that column's width by 50px (clamped 60–1200). The drag-resize handle
// approach was flaky enough across browsers / trackpads that the team
// gave up on it; explicit buttons work everywhere.
//
// Shift-click multiplies the step by 4 (200px) for big jumps.
function ColWidthButtons({ onAdjust }) {
  const btn = (sign) => (e) => {
    e.stopPropagation(); // don't trigger column sort
    const step = e.shiftKey ? 200 : 50;
    onAdjust(sign * step);
  };
  const style = {
    background: 'rgba(255,255,255,.18)',
    border: '1px solid rgba(255,255,255,.35)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: 0,
    width: 20,
    height: 18,
    borderRadius: 3,
    cursor: 'pointer',
    lineHeight: 1,
    fontFamily: 'inherit',
  };
  return (
    <span style={{ display: 'inline-flex', gap: 2, marginLeft: 4 }}>
      <button type="button" onClick={btn(-1)} title="Narrower (−50px · Shift = −200)" style={style}>−</button>
      <button type="button" onClick={btn(+1)} title="Wider (+50px · Shift = +200)" style={style}>+</button>
    </span>
  );
}

// Plain (non-sortable) header with the same +/− width buttons.
function ResizableHeader({ colKey, label, width, onAdjustWidth }) {
  return (
    <th style={{ width, position: 'relative', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span>{label}</span>
        {onAdjustWidth && <ColWidthButtons onAdjust={(d) => onAdjustWidth(colKey, d)} />}
      </span>
    </th>
  );
}

// Default starting width for every column in the Loan Management table.
// User-edited widths layer on top of these via localStorage.
const COL_DEFAULTS = {
  borrower: 180, closeDate: 130, status: 150, notes: 500, lo: 100, loa: 110,
  saleType: 140, apprOrdered: 80, apprDeadline: 140, apprReceived: 80, titleReceived: 80,
  lockExp: 140, icdDeadline: 140, icdSent: 80, icdSigned: 80, property: 280,
  price: 140, amount: 140, type: 100, rate: 100, agent: 200, leadSource: 160,
  phone: 150, email: 220, coFirst: 140, coLast: 140, coPhone: 150,
};


function TableView({ loans, onEdit, onEditStatus, onOpenNotes, onOpenLoan, sort, onSort }) {
  const agentOpts = [...PARTNERS].map(p => p.name).sort((a,b) => a.localeCompare(b));

  // ── Spreadsheet column widths ──────────────────────────────────
  // Every column header has [−] / [+] buttons. Click [+] to widen by
  // 50px, [−] to shrink. Shift-click multiplies the step by 4. Widths
  // persist per user via localStorage. Drag-based resize was unreliable
  // across browsers / trackpads, so we use explicit buttons instead.
  const [colWidths, setColWidths] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('kdt-col-widths') || '{}');
      // Sanity check: if a previous (broken) iteration of the resize
      // code saved unreasonably-narrow values, ignore them and reset to
      // defaults. Otherwise the user can never escape "Notes is too
      // skinny" no matter how many times they click [+] (because their
      // saved value was 80px and they're clicking up from there).
      const sanitized = {};
      Object.entries(stored).forEach(([k, v]) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 80) sanitized[k] = n;
      });
      return { ...COL_DEFAULTS, ...sanitized };
    } catch { return { ...COL_DEFAULTS }; }
  });
  const adjustColWidth = useCallback((key, delta) => {
    setColWidths((prev) => {
      const current = prev[key] ?? COL_DEFAULTS[key] ?? 120;
      const newW = Math.min(1200, Math.max(60, current + delta));
      const next = { ...prev, [key]: newW };
      try { localStorage.setItem('kdt-col-widths', JSON.stringify(next)); } catch {}
      // Belt-and-suspenders: directly mutate the DOM in case React's
      // re-render path isn't actually changing the rendered column for
      // some reason (table-layout: fixed quirk, browser caching, etc.).
      // This guarantees a visible change on every click.
      try {
        const colEl = document.querySelector(`col[data-col-key="${key}"]`);
        if (colEl) colEl.style.width = newW + 'px';
        const ths = document.querySelectorAll('.lm-table thead th');
        const idx = COL_ORDER.indexOf(key);
        if (idx >= 0 && ths[idx]) ths[idx].style.width = newW + 'px';
      } catch {}
      // Brief toast so the user gets visible confirmation that the click
      // registered and what the new width is.
      window.dispatchEvent(new CustomEvent('kdt-col-width-changed', { detail: { key, width: newW } }));
      return next;
    });
  }, []);
  const w = (key) => colWidths[key] || COL_DEFAULTS[key];
  const SH = (field, label) => (
    <SortHeader
      field={field}
      label={label}
      width={w(field)}
      onAdjustWidth={adjustColWidth}
      sort={sort}
      onSort={onSort}
    />
  );
  const RH = (key, label) => (
    <ResizableHeader colKey={key} label={label} width={w(key)} onAdjustWidth={adjustColWidth} />
  );

  // Order of columns in the table — used to render the <colgroup> below
  // so column widths are controlled at the COL element level (most
  // reliable cross-browser anchor for table-layout: fixed) in addition
  // to the th width. Direct DOM updates during drag target both.
  const COL_ORDER = [
    'borrower', 'closeDate', 'status', 'notes', 'lo', 'loa', 'saleType',
    'apprOrdered', 'apprDeadline', 'apprReceived', 'titleReceived',
    'lockExp', 'icdDeadline', 'icdSent', 'icdSigned',
    'property', 'price', 'amount', 'type', 'rate', 'agent', 'leadSource',
    'phone', 'email', 'coFirst', 'coLast', 'coPhone',
  ];

  return (
    <>
    <ColorLegend />
    <div className="lm-wrap">
      <div className="lm-scroll">
        <table
          className="lm-table"
          style={{
            // Inline styles override any cached CSS file. Forces auto
            // layout so col widths actually drive column sizing, and
            // pins the total table width to the sum of column widths so
            // browsers can't quietly shrink/expand columns away from
            // what we asked for.
            tableLayout: 'auto',
            width: COL_ORDER.reduce((sum, k) => sum + w(k), 0),
            minWidth: 'unset',
          }}
        >
          <colgroup>
            {COL_ORDER.map((key) => (
              <col key={key} data-col-key={key} style={{ width: w(key) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {SH('borrower', 'Client')}
              {SH('closeDate', 'Closing Date')}
              {SH('status', 'Status')}
              {RH('notes', 'Notes')}
              {SH('lo', 'LO')}
              {SH('loa', 'LOA')}
              {SH('saleType', 'Sale Type')}
              {RH('apprOrdered', 'Appr Ord')}
              {SH('apprDeadline', 'Appr Deadline')}
              {RH('apprReceived', 'Appr Rcvd')}
              {RH('titleReceived', 'Title Rcvd')}
              {SH('lockExp', 'Lock Expires')}
              {SH('icdDeadline', 'ICD Deadline')}
              {RH('icdSent', 'ICD Sent')}
              {RH('icdSigned', 'ICD Signed')}
              {SH('property', 'Property')}
              {SH('price', 'Purchase Price')}
              {SH('amount', 'Loan Amount')}
              {SH('type', 'Type')}
              {SH('rate', 'Rate')}
              {SH('agent', 'Agent')}
              {SH('leadSource', 'Lead Source')}
              {RH('phone', 'Phone')}
              {RH('email', 'Email')}
              {RH('coFirst', 'Co-Borrower First')}
              {RH('coLast', 'Co-Borrower Last')}
              {RH('coPhone', 'Co-Borrower Phone')}
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => {
              const st = statusOf(l);
              return (
                <tr key={l.id} className={`lm-row ${statusSlug(st)}`}>
                  <td onClick={() => onOpenLoan(l.id)} style={{ cursor: 'pointer', fontWeight: 600 }}>{l.borrower}</td>
                  <td className={`date ${dateClass(l.closeDate)}`}>
                    <EditInput type="date" value={l.closeDate} onChange={(v) => onEdit(l.id, 'closeDate', v)} />
                  </td>
                  <td>
                    <EditSelect value={l.status || ''} options={STATUSES.filter(s => s !== 'All')} onChange={(v) => onEditStatus(l.id, v)} />
                  </td>
                  <td
                    onClick={(e) => { e.stopPropagation(); onOpenNotes(l.id); }}
                    style={{ cursor: 'pointer', verticalAlign: 'top' }}
                    title="Click to edit full notes"
                  >
                    <div style={{ padding: '8px 10px', fontSize: 11, color: l.notes ? '#5a4a1a' : '#bbb', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.35, maxHeight: 160, overflowY: 'auto' }}>
                      {l.notes || 'Click to add notes'}
                    </div>
                  </td>
                  <td><EditSelect value={l.lo || ''} options={LOS_LIST.filter(x => x !== 'All')} onChange={(v) => onEdit(l.id, 'lo', v)} /></td>
                  <td><EditSelect value={l.loa || ''} options={['Kim', 'Abel']} empty="—" onChange={(v) => onEdit(l.id, 'loa', v)} /></td>
                  <td><EditSelect value={l.saleType || ''} options={SALE_TYPES.filter(x => x !== 'All')} empty="—" onChange={(v) => onEdit(l.id, 'saleType', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprOrdered} onChange={(v) => onEdit(l.id, 'apprOrdered', v)} /></td>
                  <td className={`date ${dateClass(l.apprDeadline, l.apprReceived)}`}><EditInput type="date" value={l.apprDeadline} onChange={(v) => onEdit(l.id, 'apprDeadline', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprReceived} onChange={(v) => onEdit(l.id, 'apprReceived', v)} /></td>
                  <td className="cb"><EditCheck value={l.titleReceived} onChange={(v) => onEdit(l.id, 'titleReceived', v)} /></td>
                  <td className={`date ${dateClass(l.lockExp, l.stage === 'funded' || l.status === 'Funded')}`}><EditInput type="date" value={l.lockExp} onChange={(v) => onEdit(l.id, 'lockExp', v)} /></td>
                  <td className={`date ${dateClass(l.icdDeadline, l.icdSigned)}`}><EditInput type="date" value={l.icdDeadline} onChange={(v) => onEdit(l.id, 'icdDeadline', v)} /></td>
                  <td className="cb"><EditCheck value={l.icdSent} onChange={(v) => onEdit(l.id, 'icdSent', v)} /></td>
                  <td className="cb"><EditCheck value={l.icdSigned} onChange={(v) => onEdit(l.id, 'icdSigned', v)} /></td>
                  <td><ZoomEditCell label="Property" value={l.property} onChange={(v) => onEdit(l.id, 'property', v)} /></td>
                  <td className="money"><EditInput type="number" value={l.price} onChange={(v) => onEdit(l.id, 'price', v)} /></td>
                  <td className="money"><EditInput type="number" value={l.amount} onChange={(v) => onEdit(l.id, 'amount', v)} /></td>
                  <td><EditSelect value={l.type || ''} options={TYPES.filter(x => x !== 'All')} empty="—" onChange={(v) => onEdit(l.id, 'type', v)} /></td>
                  <td><EditInput type="number" value={l.rate} onChange={(v) => onEdit(l.id, 'rate', v)} step="0.001" /></td>
                  <td>
                    <EditSelect
                      value={l.agent || ''}
                      options={(l.agent && !agentOpts.includes(l.agent)) ? [...agentOpts, l.agent] : agentOpts}
                      empty="—"
                      onChange={(v) => onEdit(l.id, 'agent', v)}
                    />
                  </td>
                  <td><EditSelect value={l.leadSource || ''} options={LEAD_SOURCES} empty="—" onChange={(v) => onEdit(l.id, 'leadSource', v)} /></td>
                  <td><ZoomEditCell label="Phone" type="tel" value={l.phone} onChange={(v) => onEdit(l.id, 'phone', v)} /></td>
                  <td><ZoomEditCell label="Email" type="email" value={l.email} onChange={(v) => onEdit(l.id, 'email', v)} /></td>
                  <td><ZoomEditCell label="Co-Borrower First" value={l.c2first || l.coFirst} onChange={(v) => onEdit(l.id, 'coFirst', v)} /></td>
                  <td><ZoomEditCell label="Co-Borrower Last" value={l.c2last || l.coLast} onChange={(v) => onEdit(l.id, 'coLast', v)} /></td>
                  <td><ZoomEditCell label="Co-Borrower Phone" type="tel" value={l.c2phone || l.coPhone} onChange={(v) => onEdit(l.id, 'coPhone', v)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

// ── Cards view ──────────────────────────────────────────────────
function CardsView({ loans, onOpenNotes, onOpenLoan }) {
  if (!loans.length) {
    return <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No loans match those filters</div>;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dateStatus = (dateStr, done) => {
    if (done) return 'done';
    const d = parseDate(dateStr);
    if (!d) return '';
    const days = Math.ceil((d - today) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= 7) return 'soon';
    return '';
  };
  return (
    <div className="lm-cards">
      {loans.map((l) => {
        const status = statusOf(l);
        const apprCls = dateStatus(l.apprDeadline, l.apprReceived);
        const lockCls = dateStatus(l.lockExp, l.stage === 'funded');
        const icdCls = dateStatus(l.icdDeadline, l.icdSigned);
        return (
          <div key={l.id} className={`lm-card ${statusSlug(status)}`} onClick={() => onOpenLoan(l.id)} style={{ cursor: 'pointer' }}>
            <div className="lm-card-head">
              <div>
                <div className="lm-card-name">{l.borrower}</div>
                <div className="lm-card-prop">{l.property || '—'}</div>
              </div>
              <div className="lm-card-stat">
                <div className="lm-card-amount">{fmt$(l.amount)}</div>
                <div className="lm-card-status">{status}</div>
              </div>
            </div>
            <div className="lm-card-grid">
              <div><div className="lbl">Closing</div><div className="val">{l.closeDate || '—'}</div></div>
              <div><div className="lbl">Sale / Type</div><div className="val">{(l.saleType || '—') + ' · ' + (l.type || '—')}</div></div>
              <div><div className="lbl">LO</div><div className="val"><span className="lm-card-lo-pill">{l.lo || '—'}</span></div></div>
              <div><div className="lbl">Rate</div><div className="val">{l.rate ? l.rate + '%' : '—'}</div></div>
              <div><div className="lbl">Agent</div><div className="val">{l.agent || '—'}</div></div>
              <div><div className="lbl">Lock Expires</div><div className="val" style={{ color: lockCls === 'overdue' ? '#c62828' : lockCls === 'soon' ? '#e65100' : '#222' }}>{l.lockExp || '—'}</div></div>
            </div>
            <div className="lm-card-checks">
              <span className={`lm-card-check ${l.apprOrdered ? 'done' : ''}`}>{l.apprOrdered ? '✓' : '○'} Appr Ordered</span>
              <span className={`lm-card-check ${apprCls}`}>{l.apprReceived ? '✓ Appr Rcvd' : 'Appr due ' + (l.apprDeadline || '—')}</span>
              <span className={`lm-card-check ${l.titleReceived ? 'done' : ''}`}>{l.titleReceived ? '✓' : '○'} Title Rcvd</span>
              <span className={`lm-card-check ${l.icdSent ? 'done' : ''}`}>{l.icdSent ? '✓' : '○'} ICD Sent</span>
              <span className={`lm-card-check ${l.icdSigned ? 'done' : icdCls}`}>{l.icdSigned ? '✓ ICD Signed' : 'ICD due ' + (l.icdDeadline || '—')}</span>
            </div>
            <div
              className="lm-card-notes"
              onClick={(e) => { e.stopPropagation(); onOpenNotes(l.id); }}
              style={{ cursor: 'pointer' }}
            >
              {l.notes ? l.notes.split('\n').map((line, i) => <div key={i}>{line}</div>) : <span style={{ color: '#bbb' }}>+ Click to add notes</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────
export default function LoanManagement() {
  const [layout, setLayout] = useState('cards');
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [notesFor, setNotesFor] = useState(null);
  const [loanFor, setLoanFor] = useState(null);
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  // Listen for column-width-changed events so the user gets a brief toast
  // confirming each click on the column +/- buttons actually fires.
  useEffect(() => {
    const onWidthChange = (e) => {
      const { key, width } = e.detail || {};
      if (!key) return;
      setSaveToast(`${key}: ${width}px`);
      const t = setTimeout(() => setSaveToast(null), 900);
      return () => clearTimeout(t);
    };
    window.addEventListener('kdt-col-width-changed', onWidthChange);
    return () => window.removeEventListener('kdt-col-width-changed', onWidthChange);
  }, []);

  useEffect(() => subscribeLoans(bump), [bump]);

  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const LM_TOUR_STEPS = [
    {
      title: 'Loan Management',
      body: 'Every active loan in LOS — New Contract through Approved / Funded. This is where the team lives day to day: deadlines, appraisal + title status, ICD workflow, lock expiration, and notes all in one place.',
    },
    {
      target: '[data-tour="deadlines-panel"]',
      title: 'Deadlines panel',
      body: 'The Deadlines panel highlights every Appraisal Deadline, Lock Expiration, and ICD Deadline in the next 30 days.\n\nOverdue = red · This Week = orange · Later = green. Click any row to jump straight to the loan.',
    },
    {
      target: '.lm-view-toggle',
      title: 'Cards vs Spreadsheet',
      body: 'Cards view is the quick, skimmable read — one card per loan with the key fields. Spreadsheet view is the workhorse: every field in a scrollable table with per-column resize.\n\nSpreadsheet is the fastest way to edit multiple loans in a row — every cell is inline-editable and saves on blur.',
    },
    {
      target: '.income-filters',
      title: 'Filters',
      body: 'Filter by year, month, status, LO, loan type, and sale type. Layer as many as you need to drill into a specific slice — "all of Missy\'s CTC files closing this month," etc.\n\nReset (dark red chip) blows all filters back to All in one click.',
    },
    {
      title: 'Save Now + reset columns',
      body: 'Edits auto-save on blur, but Save Now flushes any pending edits to Supabase immediately if you want to force it before closing the tab.\n\nIf you ever break the column widths in Spreadsheet view, Reset Columns puts them all back to the default in one click.',
    },
    {
      title: 'Click any loan for the drawer',
      body: 'Click a card or a row to open the full Loan Drawer — every field editable, notes history preserved, archive/unarchive available.\n\nStatus changes made anywhere (drawer, spreadsheet, Pipeline drag) sync in real time across the app.',
    },
  ];

  // One-time backfill: any loan with a close date but no ICD deadline gets
  // the auto-computed value (3 days back, skipping Sundays). Existing
  // manual ICD deadlines are left alone.
  useEffect(() => {
    let changed = false;
    LOANS.forEach((l) => {
      if (l.closeDate && !l.icdDeadline) {
        const auto = computeIcdDeadline(l.closeDate);
        if (auto) {
          l.icdDeadline = auto;
          markLoansDirty(l);
          changed = true;
        }
      }
    });
    if (changed) bump();
  }, [bump]);

  const [filters, setFilters] = useState({
    year: 'All', month: 'All', status: 'All', lo: 'All', type: 'All', saleType: 'All',
  });

  // Adversed and Archived loans are kept available so the Status filter
  // can surface them on demand, but hidden by default. Recomputed every
  // render so realtime echoes that swap loan references in LOANS are
  // picked up.
  const losLoans = LOANS.filter((l) => {
    if (filters.status === 'Archived') return l.archived;
    if (l.archived) return false;
    // Funded loans are usually hidden here (they live in All Loans), but
    // the team explicitly picking the Funded filter surfaces them so
    // Kimberly can fix name spellings + backfill co-borrowers on
    // already-closed files without dropping into All Loans.
    if (filters.status === 'Funded') return l.stage === 'funded' || (l.status || '') === 'Funded';
    return LOS_STAGES.includes(l.stage) || (l.status || '') === 'Adversed';
  });

  const filtered = losLoans.filter((r) => {
    const ry = getYearFromDate(r.closeDate);
    const rm = getMonthFromDate(r.closeDate);
    if ((r.status || '') === 'Adversed' && filters.status !== 'Adversed') return false;
    if (filters.year !== 'All' && ry !== filters.year) return false;
    if (filters.month !== 'All' && rm !== filters.month) return false;
    if (filters.status !== 'All' && filters.status !== 'Archived') {
      // Funded matches on stage OR status because historical loans
      // (marked funded via stage) sometimes never had a status field
      // set. Without this, picking the Funded filter turns up an empty
      // list even though loans exist.
      if (filters.status === 'Funded') {
        if (r.stage !== 'funded' && (r.status || '') !== 'Funded') return false;
      } else if ((r.status || '') !== filters.status) return false;
    }
    if (filters.lo !== 'All' && r.lo !== filters.lo) return false;
    if (filters.type !== 'All' && r.type !== filters.type) return false;
    if (filters.saleType !== 'All' && r.saleType !== filters.saleType) return false;
    return true;
  });

  // Sort state for the spreadsheet table. Click a column header to toggle
  // through asc → desc → unsorted. Default is close date ascending so the
  // soonest-closing loans float to the top.
  const [sort, setSort] = useState({ key: 'closeDate', dir: 'asc' });

  const sortedFiltered = useMemo(() => {
    const { key, dir } = sort;
    if (!key) return filtered;
    const sign = dir === 'asc' ? 1 : -1;
    const arr = [...filtered];
    const isDate = ['closeDate', 'apprDeadline', 'lockExp', 'icdDeadline'].includes(key);
    const isNumber = ['price', 'amount', 'rate'].includes(key);
    const statusOrder = STATUSES.filter((s) => s !== 'All');
    arr.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      const aMissing = av === undefined || av === null || av === '';
      const bMissing = bv === undefined || bv === null || bv === '';
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;   // empty values always sort to the bottom
      if (bMissing) return -1;
      if (isDate) {
        const ap = parseLocalDate(av);
        const bp = parseLocalDate(bv);
        if (!ap) return 1;
        if (!bp) return -1;
        return sign * (ap.getTime() - bp.getTime());
      }
      if (key === 'status') {
        const ai = statusOrder.indexOf(av);
        const bi = statusOrder.indexOf(bv);
        if (ai === -1 && bi === -1) return sign * String(av).localeCompare(String(bv));
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return sign * (ai - bi);
      }
      if (isNumber) return sign * ((Number(av) || 0) - (Number(bv) || 0));
      return sign * String(av).localeCompare(String(bv));
    });
    return arr;
  }, [filtered, sort]);

  const onSort = useCallback((key) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }, []);

  const years = ['All', ...new Set(losLoans.map(r => getYearFromDate(r.closeDate)).filter(Boolean))]
    .sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : Number(b) - Number(a));

  // Mutate the shared LOANS array (same pattern as legacy) + force re-render.
  // Editing the close date auto-recomputes the ICD deadline (3 days back,
  // skipping Sundays) so the team doesn't have to do the math by hand.
  // Co-borrower fields have two legacy names in the data (c2* and
  // co*) — mirror every edit to both so the drawer, the past-client
  // editor, and this spreadsheet all see the same value.
  const CO_ALIASES = {
    c2first: 'coFirst', c2last: 'coLast', c2phone: 'coPhone', c2email: 'coEmail',
    coFirst: 'c2first', coLast: 'c2last', coPhone: 'c2phone', coEmail: 'c2email',
  };
  const handleEdit = useCallback((id, key, value) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan[key] = value;
    if (CO_ALIASES[key]) loan[CO_ALIASES[key]] = value;
    if (key === 'closeDate') {
      const auto = computeIcdDeadline(value);
      if (auto) loan.icdDeadline = auto;
    }
    markLoansDirty(loan);
    bump();
  }, [bump]);

  const handleEditStatus = useCallback((id, statusValue) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    const prevStatus = loan.status || '';
    loan.status = statusValue;
    const nextStage = STATUS_TO_STAGE[statusValue];
    if (nextStage) loan.stage = nextStage;
    markLoansDirty(loan);
    // Fire GHL webhook subscriptions listening for status changes.
    // Payload matches the shape GHL expects for their contact-update
    // webhook — full loan record plus the transition details.
    if (prevStatus !== statusValue) {
      fireWebhooks('loan.status_changed', {
        loan_id: loan.id,
        borrower: loan.borrower,
        phone: loan.phone,
        email: loan.email,
        agent: loan.agent,
        lo: loan.lo,
        property: loan.property,
        amount: loan.amount,
        close_date: loan.closeDate,
        old_status: prevStatus,
        new_status: statusValue,
        status: statusValue, // duplicate for filter-matching convenience
      });
    }
    bump();
  }, [bump]);

  const handleSaveNotes = useCallback((value) => {
    if (!notesFor) return;
    const loan = LOANS.find((l) => l.id === notesFor);
    // Snapshot the prior notes before overwriting so the team can recover.
    // Fire-and-forget — never block the local save on the history insert.
    if (loan && (loan.notes || '') !== (value || '')) {
      appendNotesHistory(loan.id, loan.notes || '');
    }
    if (loan) {
      loan.notes = value;
      markLoansDirty(loan);
    }
    bump();
  }, [notesFor, bump]);

  const handleOpenLoan = useCallback((id) => {
    setLoanFor(id);
  }, []);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const notesLoan = notesFor ? LOANS.find((l) => l.id === notesFor) : null;

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 18, padding: '14px 18px', background: '#fff',
        border: '1px solid #e5e5e5', borderRadius: 10, gap: 14, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {losLoans.length} Active Files in LOS
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Changes auto-sync with Loan Pipeline
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="lm-view-toggle">
            <button className={layout === 'cards' ? 'active' : ''} onClick={() => setLayout('cards')}>Cards</button>
            <button className={layout === 'table' ? 'active' : ''} onClick={() => setLayout('table')}>Spreadsheet</button>
          </div>
          <button
            type="button"
            className="form-btn"
            title="Force-save any pending changes to Supabase right now"
            onClick={async () => {
              await saveLoansNow();
              setSaveToast('Saved');
              setTimeout(() => setSaveToast(null), 1800);
            }}
          >
            Save Now
          </button>
          {layout === 'table' && (
            <button
              type="button"
              className="form-btn"
              title="Put every column back to the default width"
              onClick={() => {
                localStorage.removeItem('kdt-col-widths');
                window.location.reload();
              }}
            >
              Reset Columns
            </button>
          )}
          <button type="button" onClick={() => setNewLoanOpen(true)} className="form-btn primary">+ New Loan Intake</button>
        </div>
      </div>

      <DeadlinesPanel loans={losLoans} onOpen={handleOpenLoan} />

      <div className="income-filters">
        <FilterDropdown label="Year" value={filters.year} options={years} onChange={(v) => setFilter('year', v)} />
        <FilterDropdown label="Month" value={filters.month} options={MONTHS_FULL} onChange={(v) => setFilter('month', v)} />
        <FilterDropdown label="Status" value={filters.status} options={STATUSES} onChange={(v) => setFilter('status', v)} />
        <FilterDropdown label="LO" value={filters.lo} options={LOS_LIST} onChange={(v) => setFilter('lo', v)} />
        <FilterDropdown label="Type" value={filters.type} options={TYPES} onChange={(v) => setFilter('type', v)} />
        <FilterDropdown label="Sale" value={filters.saleType} options={SALE_TYPES} onChange={(v) => setFilter('saleType', v)} />
        <div
          className="income-filter"
          style={{ background: '#5a0e1a', cursor: 'pointer' }}
          onClick={() => setFilters({ year: 'All', month: 'All', status: 'All', lo: 'All', type: 'All', saleType: 'All' })}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {losLoans.length} loans
        </div>
      </div>

      {layout === 'table'
        ? <TableView loans={sortedFiltered} onEdit={handleEdit} onEditStatus={handleEditStatus} onOpenNotes={setNotesFor} onOpenLoan={handleOpenLoan} sort={sort} onSort={onSort} />
        : <CardsView loans={filtered} onOpenNotes={setNotesFor} onOpenLoan={handleOpenLoan} />}

      {saveToast && (
        <div className="toast" onClick={() => setSaveToast(null)}>
          <strong>Saved</strong>
          <div>{saveToast === 'Saved' ? 'All pending edits flushed to Supabase.' : saveToast}</div>
        </div>
      )}

      {notesLoan && (
        <NotesDrawer
          loan={notesLoan}
          onSave={handleSaveNotes}
          onClose={() => setNotesFor(null)}
        />
      )}

      {loanFor && (
        <LoanDrawer
          loan={LOANS.find((l) => l.id === loanFor)}
          onSaved={bump}
          onClose={() => setLoanFor(null)}
        />
      )}

      {newLoanOpen && <NewLoanDrawer onClose={() => setNewLoanOpen(false)} />}
      {tourOpen && <Tour steps={LM_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
