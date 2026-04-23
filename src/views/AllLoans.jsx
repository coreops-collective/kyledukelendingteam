import { useMemo, useState } from 'react';
import { PAST_CLIENTS } from '../data/pastClients.js';
import FilterDropdown from '../components/FilterDropdown.jsx';

const MONTHS_FULL = ['All','January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

export default function AllLoans() {
  const [filters, setFilters] = useState({ year: 'All', month: 'All', lo: 'All', type: 'All', saleType: 'All', agent: 'All' });
  const [q, setQ] = useState('');
  const [todaysRate, setTodaysRate] = useState('');
  const [minDrop, setMinDrop] = useState('0.5');
  const [openClient, setOpenClient] = useState(null);
  const [layout, setLayout] = useState('cards'); // cards | table
  const refiMode = todaysRate !== '' && !isNaN(parseFloat(todaysRate));

  const years = useMemo(
    () => ['All', ...new Set(PAST_CLIENTS.map((c) => String(c.year || '')).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : Number(b) - Number(a)),
    []
  );
  const los = useMemo(() => ['All', ...new Set(PAST_CLIENTS.map((c) => c.lo).filter(Boolean))], []);
  const types = useMemo(() => ['All', ...new Set(PAST_CLIENTS.map((c) => c.type).filter(Boolean))], []);
  const saleTypes = useMemo(() => ['All', ...new Set(PAST_CLIENTS.map((c) => c.saleType).filter(Boolean))], []);
  const agents = useMemo(() => ['All', ...new Set(PAST_CLIENTS.map((c) => c.agent).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b)), []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PAST_CLIENTS.filter((c) => {
      if (filters.year !== 'All' && String(c.year || '') !== filters.year) return false;
      if (filters.month !== 'All' && c.month !== filters.month) return false;
      if (filters.lo !== 'All' && c.lo !== filters.lo) return false;
      if (filters.type !== 'All' && c.type !== filters.type) return false;
      if (filters.saleType !== 'All' && c.saleType !== filters.saleType) return false;
      if (filters.agent !== 'All' && c.agent !== filters.agent) return false;
      if (needle) {
        const hay = [c.name, c.property, c.agent, c.email, c.phone].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (refiMode) {
        if (c.rate == null) return false;
        const drop = c.rate - parseFloat(todaysRate);
        if (drop < parseFloat(minDrop || '0')) return false;
      }
      return true;
    });
  }, [filters, q, refiMode, todaysRate, minDrop]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const totalVolume = filtered.reduce((a, c) => a + (c.amount || 0), 0);

  // Rough monthly payment (P&I only) for a 30-yr fixed at given rate.
  const monthlyPI = (principal, ratePct) => {
    if (!principal || !ratePct) return 0;
    const r = ratePct / 100 / 12;
    const n = 360;
    return (principal * r) / (1 - Math.pow(1 + r, -n));
  };

  return (
    <div>
      <div className="page-title">All Loans</div>
      <div className="section-sub" style={{ marginBottom: 14 }}>
        Historical closings · {PAST_CLIENTS.length} past clients on record
      </div>

      <div style={{
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 18, padding: '14px 18px', background: '#fff',
        border: '1px solid #e5e5e5', borderRadius: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {filtered.length} of {PAST_CLIENTS.length} closings
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Volume: {fmt$(totalVolume)}
          </div>
        </div>
        <input
          type="search"
          placeholder="Search borrower, property, agent, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            flex: 1, minWidth: 260, padding: '8px 12px', fontSize: 13,
            border: '1px solid #d0d0d0', borderRadius: 8,
          }}
        />
      </div>

      {/* Refi Opportunity */}
      <div style={{
        marginBottom: 18, padding: '14px 18px', background: '#fff8e8',
        border: '1px solid #e8c97a', borderRadius: 10,
      }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>
          Refinance Opportunity Finder
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            Today's rate (%):
            <input
              type="number" step="0.125" value={todaysRate}
              onChange={(e) => setTodaysRate(e.target.value)}
              placeholder="e.g. 6.25"
              style={{ width: 100, padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            Min rate drop (%):
            <input
              type="number" step="0.25" value={minDrop}
              onChange={(e) => setMinDrop(e.target.value)}
              style={{ width: 80, padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, fontSize: 13 }}
            />
          </label>
          {refiMode && (
            <div style={{ fontSize: 12, color: '#5a4a1a' }}>
              Showing {filtered.length} past clients whose rate is ≥ {minDrop}% above {todaysRate}%.
            </div>
          )}
          {!refiMode && (
            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
              Enter today's rate to filter past clients who would benefit from refinancing.
            </div>
          )}
        </div>
      </div>

      <div className="income-filters">
        <FilterDropdown label="Year" value={filters.year} options={years} onChange={(v) => set('year', v)} />
        <FilterDropdown label="Month" value={filters.month} options={MONTHS_FULL} onChange={(v) => set('month', v)} />
        <FilterDropdown label="LO" value={filters.lo} options={los} onChange={(v) => set('lo', v)} />
        <FilterDropdown label="Type" value={filters.type} options={types} onChange={(v) => set('type', v)} />
        <FilterDropdown label="Sale" value={filters.saleType} options={saleTypes} onChange={(v) => set('saleType', v)} />
        <FilterDropdown label="Agent" value={filters.agent} options={agents} onChange={(v) => set('agent', v)} width={220} />
        <div
          className="income-filter"
          style={{ background: '#5a0e1a', cursor: 'pointer' }}
          onClick={() => { setFilters({ year: 'All', month: 'All', lo: 'All', type: 'All', saleType: 'All', agent: 'All' }); setQ(''); }}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="lm-view-toggle" style={{ marginLeft: 'auto' }}>
          <button className={layout === 'cards' ? 'active' : ''} onClick={() => setLayout('cards')}>Cards</button>
          <button className={layout === 'table' ? 'active' : ''} onClick={() => setLayout('table')}>Spreadsheet</button>
        </div>
      </div>

      {layout === 'cards' ? (
        <div className="lm-cards">
          {filtered.map((c, i) => {
            const savings = refiMode ? monthlyPI(c.amount, c.rate) - monthlyPI(c.amount, parseFloat(todaysRate)) : 0;
            return (
              <div
                key={(c.name || '') + '|' + (c.closeDate || '') + '|' + i}
                className="lm-card funded"
                onClick={() => setOpenClient(c)}
                style={{ cursor: 'pointer' }}
              >
                <div className="lm-card-head">
                  <div>
                    <div className="lm-card-name">{c.name}</div>
                    <div className="lm-card-prop">{c.property || '—'}</div>
                  </div>
                  <div className="lm-card-stat">
                    <div className="lm-card-amount">{fmt$(c.amount)}</div>
                    <div className="lm-card-status">{c.saleType || 'FUNDED'}</div>
                  </div>
                </div>
                <div className="lm-card-grid">
                  <div><div className="lbl">Closed</div><div className="val">{c.closeDate || '—'}</div></div>
                  <div><div className="lbl">Rate</div><div className="val">{c.rate ? c.rate + '%' : '—'}</div></div>
                  <div><div className="lbl">Type</div><div className="val">{c.type || '—'}</div></div>
                  <div><div className="lbl">LO</div><div className="val">{c.lo || '—'}</div></div>
                  <div><div className="lbl">Agent</div><div className="val">{c.agent || '—'}</div></div>
                  {refiMode && savings > 0 && (
                    <div><div className="lbl" style={{ color: '#1a6b4a' }}>Refi Savings</div><div className="val" style={{ color: '#1a6b4a', fontWeight: 700 }}>{fmt$(savings)}/mo</div></div>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No matches</div>}
        </div>
      ) : (
      <div className="lm-wrap">
        <div className="lm-scroll">
          <table className="lm-table">
            <thead>
              <tr>
                <th style={{ width: 190 }}>Client</th>
                <th style={{ width: 110 }}>Close Date</th>
                <th style={{ width: 110 }}>Sale</th>
                <th style={{ width: 260 }}>Property</th>
                <th style={{ width: 110 }}>Price</th>
                <th style={{ width: 110 }}>Loan Amount</th>
                <th style={{ width: 80 }}>Type</th>
                <th style={{ width: 80 }}>Rate</th>
                {refiMode && <th style={{ width: 130 }}>Monthly Savings</th>}
                <th style={{ width: 180 }}>Agent</th>
                <th style={{ width: 130 }}>Phone</th>
                <th style={{ width: 200 }}>Email</th>
                <th style={{ width: 80 }}>LO</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={(c.name || '') + '|' + (c.closeDate || '') + '|' + i}
                  onClick={() => setOpenClient(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.closeDate || '—'}</td>
                  <td>{c.saleType || '—'}</td>
                  <td>{c.property || '—'}</td>
                  <td className="money">{fmt$(c.price)}</td>
                  <td className="money">{fmt$(c.amount)}</td>
                  <td>{c.type || '—'}</td>
                  <td>{c.rate ? c.rate + '%' : '—'}</td>
                  {refiMode && (() => {
                    const savings = monthlyPI(c.amount, c.rate) - monthlyPI(c.amount, parseFloat(todaysRate));
                    return <td className="money" style={{ color: '#1a6b4a', fontWeight: 600 }}>{savings > 0 ? fmt$(savings) + '/mo' : '—'}</td>;
                  })()}
                  <td>{c.agent || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.lo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {openClient && (
        <PastClientDrawer client={openClient} refiRate={refiMode ? parseFloat(todaysRate) : null} onClose={() => setOpenClient(null)} />
      )}
    </div>
  );
}

function PastClientDrawer({ client, refiRate, onClose }) {
  const c = client;
  const monthlyPI = (principal, ratePct) => {
    if (!principal || !ratePct) return 0;
    const r = ratePct / 100 / 12;
    return (principal * r) / (1 - Math.pow(1 + r, -360));
  };
  const currentPI = monthlyPI(c.amount, c.rate);
  const newPI = refiRate ? monthlyPI(c.amount, refiRate) : null;
  const savings = newPI != null ? currentPI - newPI : null;

  const Row = ({ label, value }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#222' }}>{value || '—'}</div>
    </div>
  );

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Past Client · Funded</div>
          <div className="drawer-borrower">{c.name}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{c.property || ''}</div>
        </div>
        <div className="drawer-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Row label="Close Date" value={c.closeDate} />
            <Row label="Sale Type" value={c.saleType} />
            <Row label="Loan Amount" value={fmt$(c.amount)} />
            <Row label="Purchase Price" value={c.price ? fmt$(c.price) : null} />
            <Row label="Type" value={c.type} />
            <Row label="Rate" value={c.rate ? c.rate + '%' : null} />
            <Row label="LO" value={c.lo} />
            <Row label="Agent" value={c.agent} />
            <Row label="Phone" value={c.phone} />
            <Row label="Email" value={c.email} />
          </div>

          {refiRate && c.rate && (
            <div style={{ marginTop: 18, padding: 14, background: '#f1f8f1', border: '1px solid #c8e6c9', borderRadius: 8 }}>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#1a6b4a', marginBottom: 8 }}>
                Refi Analysis at {refiRate}%
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12 }}>
                <div><div style={{ color: '#666' }}>Current P&I</div><div style={{ fontWeight: 700 }}>{fmt$(Math.round(currentPI))}/mo</div></div>
                <div><div style={{ color: '#666' }}>New P&I</div><div style={{ fontWeight: 700 }}>{fmt$(Math.round(newPI))}/mo</div></div>
                <div>
                  <div style={{ color: '#666' }}>Monthly Savings</div>
                  <div style={{ fontWeight: 700, color: savings > 0 ? '#1a6b4a' : '#c62828' }}>
                    {savings > 0 ? fmt$(Math.round(savings)) + '/mo' : savings < 0 ? fmt$(Math.round(-savings)) + ' more' : '—'}
                  </div>
                </div>
              </div>
              {savings > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#555' }}>
                  Annual savings ≈ <strong>{fmt$(Math.round(savings * 12))}</strong>. Reach out to see if refinance makes sense.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
