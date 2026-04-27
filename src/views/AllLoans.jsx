import { useMemo, useState, useEffect, useCallback } from 'react';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { getCurrentUser } from '../lib/auth.js';
import { getAllFunded } from '../lib/fundedLoans.js';
import { subscribeLoans } from '../lib/loansStore.js';

const MONTHS_FULL = ['All','January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

export default function AllLoans() {
  const [filters, setFilters] = useState({ year: 'All', month: 'All', lo: 'All', type: 'All', saleType: 'All', agent: 'All' });
  const [q, setQ] = useState('');
  const [todaysRate, setTodaysRate] = useState('');
  const [minDrop, setMinDrop] = useState('0.5');
  const [openClient, setOpenClient] = useState(null);
  const [layout, setLayout] = useState('cards'); // cards | table
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  // Re-fetch the merged funded list whenever a teammate marks a loan funded.
  useEffect(() => subscribeLoans(bump), [bump]);
  const refiMode = todaysRate !== '' && !isNaN(parseFloat(todaysRate));

  // Merge historical PAST_CLIENTS with anything in LOANS that has been
  // marked Funded — without this, recently-funded loans wouldn't show up
  // here until the static seed file is hand-edited.
  const fundedAll = getAllFunded();

  const years = useMemo(
    () => ['All', ...new Set(fundedAll.map((c) => String(c.year || '')).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : Number(b) - Number(a)),
    [fundedAll]
  );
  const los = useMemo(() => ['All', ...new Set(fundedAll.map((c) => c.lo).filter(Boolean))], [fundedAll]);
  const types = useMemo(() => ['All', ...new Set(fundedAll.map((c) => c.type).filter(Boolean))], [fundedAll]);
  const saleTypes = useMemo(() => ['All', ...new Set(fundedAll.map((c) => c.saleType).filter(Boolean))], [fundedAll]);
  const agents = useMemo(() => ['All', ...new Set(fundedAll.map((c) => c.agent).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b)), [fundedAll]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return fundedAll.filter((c) => {
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
  }, [filters, q, refiMode, todaysRate, minDrop, fundedAll]);

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
      <div style={{
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 18, padding: '14px 18px', background: '#fff',
        border: '1px solid #e5e5e5', borderRadius: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {filtered.length} of {fundedAll.length} closings
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
                  <div><div className="lbl">Last Contact</div><div className="val">{c.lastContact || '—'}</div></div>
                  {refiMode && savings > 0 && (
                    <div><div className="lbl" style={{ color: '#1a6b4a' }}>Refi Savings</div><div className="val" style={{ color: '#1a6b4a', fontWeight: 700 }}>{fmt$(savings)}/mo</div></div>
                  )}
                </div>
                {c.noteEntries && c.noteEntries.length > 0 && (() => {
                  const latest = c.noteEntries[0];
                  return (
                    <div className="lm-card-notes" style={{ marginTop: 10, padding: '6px 10px', background: '#fff8e1', borderRadius: 6, fontSize: 11, color: '#5a4a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{latest.by}:</strong> {latest.text.replace(/\n/g, ' · ')}
                    </div>
                  );
                })()}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No matches</div>}
        </div>
      ) : (
      <div className="al-table-wrap">
        <table className="al-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Close Date</th>
              <th>Sale</th>
              <th>Property</th>
              <th className="num">Price</th>
              <th className="num">Loan Amount</th>
              <th>Type</th>
              <th className="num">Rate</th>
              {refiMode && <th className="num">Monthly Savings</th>}
              <th>Agent</th>
              <th>Phone</th>
              <th>Email</th>
              <th>LO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={(c.name || '') + '|' + (c.closeDate || '') + '|' + i}
                onClick={() => setOpenClient(c)}
                style={{ cursor: 'pointer' }}
              >
                <td className="client">{c.name}</td>
                <td>{c.closeDate || '—'}</td>
                <td>{c.saleType || '—'}</td>
                <td className="prop">{c.property || '—'}</td>
                <td className="num">{fmt$(c.price)}</td>
                <td className="num">{fmt$(c.amount)}</td>
                <td>{c.type || '—'}</td>
                <td className="num">{c.rate ? c.rate + '%' : '—'}</td>
                {refiMode && (() => {
                  const savings = monthlyPI(c.amount, c.rate) - monthlyPI(c.amount, parseFloat(todaysRate));
                  return <td className="savings">{savings > 0 ? fmt$(savings) + '/mo' : '—'}</td>;
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
      )}

      {openClient && (
        <PastClientDrawer client={openClient} refiRate={refiMode ? parseFloat(todaysRate) : null} onClose={() => setOpenClient(null)} />
      )}
    </div>
  );
}

function PastClientDrawer({ client, refiRate, onClose }) {
  const c = client;
  const [, force] = useState(0);
  const [draft, setDraft] = useState('');
  const set = (key, value) => { c[key] = value; force((n) => n + 1); };
  const markContactedToday = () => set('lastContact', new Date().toISOString().slice(0, 10));

  const postNote = () => {
    const text = draft.trim();
    if (!text) return;
    const user = getCurrentUser();
    const entry = {
      at: new Date().toISOString(),
      by: user?.name || user?.email || 'Unknown',
      text,
    };
    c.noteEntries = [entry, ...(c.noteEntries || [])];
    setDraft('');
    force((n) => n + 1);
  };
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

          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #eee' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10 }}>
              Follow-Up
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Last Contact</div>
                <input
                  type="date"
                  defaultValue={c.lastContact || ''}
                  onBlur={(e) => set('lastContact', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="button"
                onClick={markContactedToday}
                className="form-btn primary"
                style={{ padding: '8px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
              >
                Mark today
              </button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Add a Note</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Conversations, preferences, anniversaries, follow-up reminders…"
              style={{ width: '100%', minHeight: 80, padding: 12, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, border: '1px solid #d0d0d0', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
            />
            <button
              type="button"
              onClick={postNote}
              disabled={!draft.trim()}
              className="form-btn primary"
              style={{ padding: '8px 14px', fontSize: 12, opacity: draft.trim() ? 1 : 0.5 }}
            >
              Post note
            </button>

            {c.noteEntries && c.noteEntries.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
                  Notes ({c.noteEntries.length})
                </div>
                {c.noteEntries.map((n, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: '#fafafa', border: '1px solid #eee', borderLeft: '3px solid var(--brand-red)', borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#222', lineHeight: 1.5, marginBottom: 6 }}>{n.text}</div>
                    <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      {n.by} · {new Date(n.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
