import { useMemo, useState, useCallback, useEffect } from 'react';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES, STATUS_TO_STAGE, STAGE_TO_STATUS } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import LoanDrawer from '../components/LoanDrawer.jsx';
import NewLoanDrawer from '../components/NewLoanDrawer.jsx';
import { markLoansDirty, subscribeLoans } from '../lib/loansStore.js';

const MONTHS_FULL = ['All','January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function dateClass(s) {
  const d = parseDate(s);
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((d - today) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return '';
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

const STATUSES = ['All','New Contract','Disclosed','Processing','Underwriting','CTC Required','CTC','BTP','Approved','Funded','Adversed'];
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
    <div className="card" style={{ marginBottom: 18 }}>
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
  const [notes, setNotes] = useState(loan.notes || '');
  if (!loan) return null;
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 620, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Notes</div>
          <div className="drawer-borrower">{loan.borrower}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{loan.property || ''}</div>
        </div>
        <div className="drawer-body">
          <div className="form-field">
            <label>Loan Notes · all text visible and editable</label>
            <textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                minHeight: 420, width: '100%', padding: 14,
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6,
                border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 10, fontStyle: 'italic' }}>
            Supports line breaks. Saves back to the loan record and reflects everywhere.
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Cancel</button>
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
function SortHeader({ field, label, width, sort, onSort }) {
  const active = sort && sort.key === field;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      style={{ width, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onSort && onSort(field)}
      title={`Sort by ${label}`}
    >
      {label}{arrow}
    </th>
  );
}

function TableView({ loans, onEdit, onEditStatus, onOpenNotes, onOpenLoan, sort, onSort }) {
  const agentOpts = [...PARTNERS].map(p => p.name).sort((a,b) => a.localeCompare(b));
  const SH = (field, label, width) => (
    <SortHeader field={field} label={label} width={width} sort={sort} onSort={onSort} />
  );
  return (
    <>
    <ColorLegend />
    <div className="lm-wrap">
      <div className="lm-scroll">
        <table className="lm-table">
          <thead>
            <tr>
              {SH('borrower', 'Client', 180)}
              {SH('closeDate', 'Closing Date', 130)}
              {SH('status', 'Status', 150)}
              <th style={{ width: 260 }}>Notes</th>
              {SH('lo', 'LO', 100)}
              {SH('loa', 'LOA', 110)}
              {SH('saleType', 'Sale Type', 140)}
              <th style={{ width: 80 }}>Appr Ord</th>
              {SH('apprDeadline', 'Appr Deadline', 140)}
              <th style={{ width: 80 }}>Appr Rcvd</th>
              <th style={{ width: 80 }}>Title Rcvd</th>
              {SH('lockExp', 'Lock Expires', 140)}
              {SH('icdDeadline', 'ICD Deadline', 140)}
              <th style={{ width: 80 }}>ICD Sent</th>
              <th style={{ width: 80 }}>ICD Signed</th>
              {SH('property', 'Property', 280)}
              {SH('price', 'Purchase Price', 140)}
              {SH('amount', 'Loan Amount', 140)}
              {SH('type', 'Type', 100)}
              {SH('rate', 'Rate', 100)}
              {SH('agent', 'Agent', 200)}
              {SH('leadSource', 'Lead Source', 160)}
              <th style={{ width: 150 }}>Phone</th>
              <th style={{ width: 220 }}>Email</th>
              <th style={{ width: 140 }}>Co-Borrower First</th>
              <th style={{ width: 140 }}>Co-Borrower Last</th>
              <th style={{ width: 150 }}>Co-Borrower Phone</th>
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
                    style={{ cursor: 'pointer' }}
                    title="Click to edit full notes"
                  >
                    <div style={{ padding: '8px 10px', fontSize: 11, color: l.notes ? '#5a4a1a' : '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                      {l.notes ? l.notes.replace(/\n/g, ' · ') : 'Click to add notes'}
                    </div>
                  </td>
                  <td><EditSelect value={l.lo || ''} options={LOS_LIST.filter(x => x !== 'All')} onChange={(v) => onEdit(l.id, 'lo', v)} /></td>
                  <td><EditSelect value={l.loa || ''} options={['Kim', 'Abel']} empty="—" onChange={(v) => onEdit(l.id, 'loa', v)} /></td>
                  <td><EditSelect value={l.saleType || ''} options={SALE_TYPES.filter(x => x !== 'All')} empty="—" onChange={(v) => onEdit(l.id, 'saleType', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprOrdered} onChange={(v) => onEdit(l.id, 'apprOrdered', v)} /></td>
                  <td className={`date ${dateClass(l.apprDeadline)}`}><EditInput type="date" value={l.apprDeadline} onChange={(v) => onEdit(l.id, 'apprDeadline', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprReceived} onChange={(v) => onEdit(l.id, 'apprReceived', v)} /></td>
                  <td className="cb"><EditCheck value={l.titleReceived} onChange={(v) => onEdit(l.id, 'titleReceived', v)} /></td>
                  <td className={`date ${dateClass(l.lockExp)}`}><EditInput type="date" value={l.lockExp} onChange={(v) => onEdit(l.id, 'lockExp', v)} /></td>
                  <td className={`date ${dateClass(l.icdDeadline)}`}><EditInput type="date" value={l.icdDeadline} onChange={(v) => onEdit(l.id, 'icdDeadline', v)} /></td>
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
                  <td><ZoomEditCell label="Co-Borrower First" value={l.c2first} onChange={(v) => onEdit(l.id, 'c2first', v)} /></td>
                  <td><ZoomEditCell label="Co-Borrower Last" value={l.c2last} onChange={(v) => onEdit(l.id, 'c2last', v)} /></td>
                  <td><ZoomEditCell label="Co-Borrower Phone" type="tel" value={l.c2phone} onChange={(v) => onEdit(l.id, 'c2phone', v)} /></td>
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

  useEffect(() => subscribeLoans(bump), [bump]);

  const [filters, setFilters] = useState({
    year: 'All', month: 'All', status: 'All', lo: 'All', type: 'All', saleType: 'All',
  });

  // Adversed loans are kept in the underlying set so the Adversed status
  // filter can find them, but hidden by default.
  const losLoans = useMemo(
    () => LOANS.filter((l) => !l.archived && (LOS_STAGES.includes(l.stage) || (l.status || '') === 'Adversed')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const filtered = losLoans.filter((r) => {
    const ry = getYearFromDate(r.closeDate);
    const rm = getMonthFromDate(r.closeDate);
    if ((r.status || '') === 'Adversed' && filters.status !== 'Adversed') return false;
    if (filters.year !== 'All' && ry !== filters.year) return false;
    if (filters.month !== 'All' && rm !== filters.month) return false;
    if (filters.status !== 'All' && (r.status || '') !== filters.status) return false;
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
        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        if (isNaN(ad)) return 1;
        if (isNaN(bd)) return -1;
        return sign * (ad - bd);
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

  // Mutate the shared LOANS array (same pattern as legacy) + force re-render
  const handleEdit = useCallback((id, key, value) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan[key] = value;
    markLoansDirty(loan);
    bump();
  }, [bump]);

  const handleEditStatus = useCallback((id, statusValue) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan.status = statusValue;
    const nextStage = STATUS_TO_STAGE[statusValue];
    if (nextStage) loan.stage = nextStage;
    markLoansDirty(loan);
    bump();
  }, [bump]);

  const handleSaveNotes = useCallback((value) => {
    if (!notesFor) return;
    const loan = LOANS.find((l) => l.id === notesFor);
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
    </div>
  );
}
