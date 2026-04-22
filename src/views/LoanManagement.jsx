import { useMemo, useState, useCallback } from 'react';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES, STATUS_TO_STAGE } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';

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
  return l.status || l.stage || '';
}
function statusSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

const STATUSES = ['All','New Contract','Disclosed','Processing','Underwriting','CTC Required','CTC','BTP','Approved','Funded'];
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

// ── Table view (spreadsheet) ────────────────────────────────────
function TableView({ loans, onEdit, onEditStatus, onOpenNotes, onOpenLoan }) {
  const agentOpts = [...PARTNERS].map(p => p.name).sort((a,b) => a.localeCompare(b));
  return (
    <div className="lm-wrap">
      <div className="lm-scroll">
        <table className="lm-table">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Client</th>
              <th style={{ width: 120 }}>Closing Date</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 240 }}>Notes</th>
              <th style={{ width: 90 }}>LO</th>
              <th style={{ width: 120 }}>Sale Type</th>
              <th style={{ width: 60 }}>Appr Ord</th>
              <th style={{ width: 120 }}>Appr Deadline</th>
              <th style={{ width: 60 }}>Appr Rcvd</th>
              <th style={{ width: 60 }}>Title Rcvd</th>
              <th style={{ width: 120 }}>Lock Expires</th>
              <th style={{ width: 120 }}>ICD Deadline</th>
              <th style={{ width: 60 }}>ICD Sent</th>
              <th style={{ width: 60 }}>ICD Signed</th>
              <th style={{ width: 240 }}>Property</th>
              <th style={{ width: 120 }}>Purchase Price</th>
              <th style={{ width: 120 }}>Loan Amount</th>
              <th style={{ width: 80 }}>Type</th>
              <th style={{ width: 80 }}>Rate</th>
              <th style={{ width: 170 }}>Agent</th>
              <th style={{ width: 140 }}>Lead Source</th>
              <th style={{ width: 130 }}>Phone</th>
              <th style={{ width: 180 }}>Email</th>
              <th style={{ width: 120 }}>Co-Borrower First</th>
              <th style={{ width: 120 }}>Co-Borrower Last</th>
              <th style={{ width: 130 }}>Co-Borrower Phone</th>
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
                  <td><EditSelect value={l.saleType || ''} options={SALE_TYPES.filter(x => x !== 'All')} empty="—" onChange={(v) => onEdit(l.id, 'saleType', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprOrdered} onChange={(v) => onEdit(l.id, 'apprOrdered', v)} /></td>
                  <td className={`date ${dateClass(l.apprDeadline)}`}><EditInput type="date" value={l.apprDeadline} onChange={(v) => onEdit(l.id, 'apprDeadline', v)} /></td>
                  <td className="cb"><EditCheck value={l.apprReceived} onChange={(v) => onEdit(l.id, 'apprReceived', v)} /></td>
                  <td className="cb"><EditCheck value={l.titleReceived} onChange={(v) => onEdit(l.id, 'titleReceived', v)} /></td>
                  <td className={`date ${dateClass(l.lockExp)}`}><EditInput type="date" value={l.lockExp} onChange={(v) => onEdit(l.id, 'lockExp', v)} /></td>
                  <td className={`date ${dateClass(l.icdDeadline)}`}><EditInput type="date" value={l.icdDeadline} onChange={(v) => onEdit(l.id, 'icdDeadline', v)} /></td>
                  <td className="cb"><EditCheck value={l.icdSent} onChange={(v) => onEdit(l.id, 'icdSent', v)} /></td>
                  <td className="cb"><EditCheck value={l.icdSigned} onChange={(v) => onEdit(l.id, 'icdSigned', v)} /></td>
                  <td><EditInput value={l.property} onChange={(v) => onEdit(l.id, 'property', v)} /></td>
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
                  <td><EditInput type="tel" value={l.phone} onChange={(v) => onEdit(l.id, 'phone', v)} /></td>
                  <td><EditInput type="email" value={l.email} onChange={(v) => onEdit(l.id, 'email', v)} /></td>
                  <td><EditInput value={l.c2first} onChange={(v) => onEdit(l.id, 'c2first', v)} /></td>
                  <td><EditInput value={l.c2last} onChange={(v) => onEdit(l.id, 'c2last', v)} /></td>
                  <td><EditInput type="tel" value={l.c2phone} onChange={(v) => onEdit(l.id, 'c2phone', v)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

  const [filters, setFilters] = useState({
    year: 'All', month: 'All', status: 'All', lo: 'All', type: 'All', saleType: 'All',
  });

  const losLoans = useMemo(
    () => LOANS.filter((l) => LOS_STAGES.includes(l.stage)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const filtered = losLoans.filter((r) => {
    const ry = getYearFromDate(r.closeDate);
    const rm = getMonthFromDate(r.closeDate);
    if (filters.year !== 'All' && ry !== filters.year) return false;
    if (filters.month !== 'All' && rm !== filters.month) return false;
    if (filters.status !== 'All' && (r.status || '') !== filters.status) return false;
    if (filters.lo !== 'All' && r.lo !== filters.lo) return false;
    if (filters.type !== 'All' && r.type !== filters.type) return false;
    if (filters.saleType !== 'All' && r.saleType !== filters.saleType) return false;
    return true;
  });

  const years = ['All', ...new Set(losLoans.map(r => getYearFromDate(r.closeDate)).filter(Boolean))]
    .sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : Number(b) - Number(a));

  // Mutate the shared LOANS array (same pattern as legacy) + force re-render
  const handleEdit = useCallback((id, key, value) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan[key] = value;
    bump();
  }, [bump]);

  const handleEditStatus = useCallback((id, statusValue) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan.status = statusValue;
    const nextStage = STATUS_TO_STAGE[statusValue];
    if (nextStage) loan.stage = nextStage;
    bump();
  }, [bump]);

  const handleSaveNotes = useCallback((value) => {
    if (!notesFor) return;
    const loan = LOANS.find((l) => l.id === notesFor);
    if (loan) loan.notes = value;
    bump();
  }, [notesFor, bump]);

  const handleOpenLoan = useCallback(() => {
    // TODO: full loan drawer (next increment). For now notes drawer doubles as quick edit.
  }, []);

  const cycle = (key, opts) => setFilters((f) => {
    const i = opts.indexOf(f[key]);
    return { ...f, [key]: opts[(i + 1) % opts.length] };
  });

  const notesLoan = notesFor ? LOANS.find((l) => l.id === notesFor) : null;

  return (
    <div>
      <div className="page-title">Loan Management</div>
      <div className="section-sub" style={{ marginBottom: 14 }}>
        Spreadsheet view · LOS pipeline · edits save live (session only for now)
      </div>

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
        </div>
      </div>

      <DeadlinesPanel loans={losLoans} onOpen={handleOpenLoan} />

      <div className="income-filters">
        <div className="income-filter" onClick={() => cycle('year', years)}>
          <span className="income-filter-label">Year</span>
          <span className="income-filter-val">{filters.year}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('month', MONTHS_FULL)}>
          <span className="income-filter-label">Month</span>
          <span className="income-filter-val">{filters.month}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('status', STATUSES)}>
          <span className="income-filter-label">Status</span>
          <span className="income-filter-val">{filters.status}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('lo', LOS_LIST)}>
          <span className="income-filter-label">LO</span>
          <span className="income-filter-val">{filters.lo}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('type', TYPES)}>
          <span className="income-filter-label">Type</span>
          <span className="income-filter-val">{filters.type}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('saleType', SALE_TYPES)}>
          <span className="income-filter-label">Sale</span>
          <span className="income-filter-val">{filters.saleType}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
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
        ? <TableView loans={filtered} onEdit={handleEdit} onEditStatus={handleEditStatus} onOpenNotes={setNotesFor} onOpenLoan={handleOpenLoan} />
        : <CardsView loans={filtered} onOpenNotes={setNotesFor} onOpenLoan={handleOpenLoan} />}

      {notesLoan && (
        <NotesDrawer
          loan={notesLoan}
          onSave={handleSaveNotes}
          onClose={() => setNotesFor(null)}
        />
      )}
    </div>
  );
}
