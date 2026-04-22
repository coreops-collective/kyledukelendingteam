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
      </div>

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
                <tr key={(c.name || '') + '|' + (c.closeDate || '') + '|' + i}>
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
    </div>
  );
}
