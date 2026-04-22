import { useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES, STAGE_TO_STATUS } from '../data/stages.js';

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

function parseDate(s) {
  if (!s) return null;
  // Accept M/D/YYYY or YYYY-MM-DD
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

// Derive a fine-grained status from stage (legacy merges in LOAN_MGMT status,
// but for read-only parity we fall back to the stage label).
function statusOf(l) {
  return l.status || STAGE_TO_STATUS[l.stage] || l.stage || '';
}
function statusSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function DeadlinesPanel({ loans }) {
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
    <div key={d.loan.id + d.type} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      background: '#fff', border: '1px solid #e5e5e5', borderLeft: `4px solid ${accent}`,
      borderRadius: 6, marginBottom: 6,
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

function CardsView({ loans }) {
  if (!loans.length) {
    return <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No loans match those filters</div>;
  }
  return (
    <div className="lm-cards">
      {loans.map((l) => {
        const status = statusOf(l);
        return (
          <div key={l.id} className={`lm-card ${statusSlug(status)}`}>
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
              <div><div className="lbl">LO</div><div className="val">{l.lo || '—'}</div></div>
              <div><div className="lbl">Type</div><div className="val">{l.type || '—'}</div></div>
              <div><div className="lbl">Purpose</div><div className="val">{l.purpose || '—'}</div></div>
              <div><div className="lbl">Rate</div><div className="val">{l.rate ? l.rate + '%' : '—'}</div></div>
              <div><div className="lbl">Close</div><div className="val">{l.closeDate || '—'}</div></div>
              <div><div className="lbl">Agent</div><div className="val">{l.agent || '—'}</div></div>
            </div>
            {l.notes ? <div className="lm-card-notes">{l.notes}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ loans }) {
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
              <th style={{ width: 120 }}>Purpose</th>
              <th style={{ width: 240 }}>Property</th>
              <th style={{ width: 120 }}>Loan Amount</th>
              <th style={{ width: 80 }}>Type</th>
              <th style={{ width: 80 }}>Rate</th>
              <th style={{ width: 170 }}>Agent</th>
              <th style={{ width: 130 }}>Phone</th>
              <th style={{ width: 200 }}>Email</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => {
              const status = statusOf(l);
              return (
                <tr key={l.id} className={`lm-row ${statusSlug(status)}`}>
                  <td>{l.borrower}</td>
                  <td className={`date ${dateClass(l.closeDate)}`}>{l.closeDate || '—'}</td>
                  <td><span className="lm-status-badge">{status}</span></td>
                  <td className="notes" style={{ padding: '8px 10px', fontSize: 11, color: l.notes ? '#5a4a1a' : '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                    {l.notes ? l.notes.replace(/\n/g, ' · ') : '—'}
                  </td>
                  <td>{l.lo || '—'}</td>
                  <td>{l.purpose || '—'}</td>
                  <td>{l.property || '—'}</td>
                  <td className="money">{l.amount ? Math.round(l.amount).toLocaleString() : '—'}</td>
                  <td>{l.type || '—'}</td>
                  <td>{l.rate ? l.rate + '%' : '—'}</td>
                  <td>{l.agent || '—'}</td>
                  <td>{l.phone || '—'}</td>
                  <td>{l.email || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LoanManagement() {
  const [layout, setLayout] = useState('cards');
  const [filters, setFilters] = useState({
    status: 'All', lo: 'All', type: 'All', purpose: 'All',
  });

  const losLoans = useMemo(
    () => LOANS.filter((l) => LOS_STAGES.includes(l.stage)),
    []
  );

  const filtered = useMemo(() => losLoans.filter((r) => {
    if (filters.status !== 'All' && statusOf(r) !== filters.status) return false;
    if (filters.lo !== 'All' && r.lo !== filters.lo) return false;
    if (filters.type !== 'All' && r.type !== filters.type) return false;
    if (filters.purpose !== 'All' && r.purpose !== filters.purpose) return false;
    return true;
  }), [losLoans, filters]);

  const statuses = ['All', 'New Contract', 'Disclosed', 'Processing', 'Underwriting', 'CTC Required', 'CTC', 'Approved', 'Funded'];
  const los = ['All', 'Kyle', 'Missy'];
  const types = ['All', 'CONV', 'FHA', 'VA', 'Jumbo'];
  const purposes = ['All', 'Purchase', 'Refi'];

  const cycle = (key, opts) => setFilters((f) => {
    const i = opts.indexOf(f[key]);
    return { ...f, [key]: opts[(i + 1) % opts.length] };
  });

  return (
    <div>
      <div className="page-title">Loan Management</div>
      <div className="section-sub" style={{ marginBottom: 14 }}>
        Spreadsheet view · LOS pipeline · read-only for now
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
          <button className="form-btn primary" type="button">+ New Loan Intake</button>
        </div>
      </div>

      <DeadlinesPanel loans={losLoans} />

      <div className="income-filters">
        <div className="income-filter" onClick={() => cycle('status', statuses)}>
          <span className="income-filter-label">Status</span>
          <span className="income-filter-val">{filters.status}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('lo', los)}>
          <span className="income-filter-label">LO</span>
          <span className="income-filter-val">{filters.lo}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('type', types)}>
          <span className="income-filter-label">Type</span>
          <span className="income-filter-val">{filters.type}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div className="income-filter" onClick={() => cycle('purpose', purposes)}>
          <span className="income-filter-label">Purpose</span>
          <span className="income-filter-val">{filters.purpose}</span>
          <span className="income-filter-arrow">▾</span>
        </div>
        <div
          className="income-filter"
          style={{ background: '#5a0e1a' }}
          onClick={() => setFilters({ status: 'All', lo: 'All', type: 'All', purpose: 'All' })}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {losLoans.length} loans
        </div>
      </div>

      {layout === 'table' ? <TableView loans={filtered} /> : <CardsView loans={filtered} />}

      <div style={{
        marginTop: 14, padding: '10px 14px', background: '#f0f7ff',
        border: '1px solid #bfd9f0', color: '#1976d2', borderRadius: 6,
        fontSize: 11, fontStyle: 'italic',
      }}>
        Read-only port — inline editing and loan detail drawer come next.
      </div>
    </div>
  );
}
