import { useMemo, useState, useEffect, useCallback } from 'react';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { getCurrentUser } from '../lib/auth.js';
import { LOANS } from '../data/loans.js';
import { getAllFunded } from '../lib/fundedLoans.js';
import { subscribeLoans, markLoansDirty } from '../lib/loansStore.js';
import {
  loadClientDates, getDate, upsertClientDate, deleteClientDate,
} from '../lib/clientDates.js';
import {
  loadClientProfiles, getProfile, upsertClientProfile, REVIEW_SOURCES,
} from '../lib/clientProfiles.js';
import Tour from '../components/Tour.jsx';

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
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const ALL_LOANS_TOUR_STEPS = [
    {
      title: 'All Loans',
      body: 'Every funded loan the team has ever closed — historical PAST_CLIENTS from the original book plus every loan the app has marked Funded since.\n\nDeduped by borrower + close date so nothing appears twice. Sortable, filterable, and searchable.',
    },
    {
      target: '.income-filters',
      title: 'Filters + search',
      body: 'Filter by year, month, LO, loan type, sale type, and referring agent. The search bar covers borrower name and property address at once.\n\nReset (dark red chip) clears everything in one click.',
    },
    {
      title: 'Refi Watch mode',
      body: 'Enter Today\'s Rate and a minimum drop (default 0.5%). The list re-sorts to show every past client whose original rate is high enough that today\'s rate would save them the minimum — instant refi opportunity list.\n\nZero manual work, always live.',
    },
    {
      title: 'Cards vs Table',
      body: 'Cards view is the browsable read — one card per client with amount, close date, type, and property. Table view is denser for bulk scanning.',
    },
    {
      title: 'Click a client for the drawer',
      body: 'The drawer shows every field on the past client + client dates (birthday, home anniversary, wedding anniversary) + a review section for tracking Google / Zillow / Facebook reviews.\n\nIdentity edits (spelling, phone, email) persist through client_profiles so the corrections stick even if the seed file changes.',
    },
  ];
  // Load the client_dates store (used for client birthdays inside the
  // past-client drawer) and the client_profiles store (review tracking)
  // and re-render when either changes.
  useEffect(() => {
    loadClientDates().then(bump);
    loadClientProfiles().then(bump);
    const onChange = () => bump();
    const events = [
      'kdt-client-dates-changed', 'kdt-client-dates-loaded',
      'kdt-client-profiles-changed', 'kdt-client-profiles-loaded',
    ];
    events.forEach((e) => window.addEventListener(e, onChange));
    return () => events.forEach((e) => window.removeEventListener(e, onChange));
  }, [bump]);
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
      {tourOpen && <Tour steps={ALL_LOANS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}

// Birthday input that lives inside the past-client drawer. Reads/
// writes through client_dates so the same value is visible on the
// client card in Client for Life and drives birthday-triggered
// workflows. Auto-saves on blur. Clearing the field deletes the row.
function BirthdayField({ clientName }) {
  const existing = getDate(clientName, 'Birthday');
  const [value, setValue] = useState(existing?.date_value || '');
  // Re-read from the store on subsequent renders so realtime updates
  // from another tab don't get stomped by stale local state.
  useEffect(() => {
    setValue(getDate(clientName, 'Birthday')?.date_value || '');
  }, [clientName]);

  const persist = async () => {
    const v = value.trim();
    if (!v) {
      if (existing) await deleteClientDate(clientName, 'Birthday');
      return;
    }
    await upsertClientDate(clientName, 'Birthday', v, { recurring: true });
  };

  return (
    <div style={{ marginTop: 14, padding: 12, background: '#fff8e1', border: '1px solid #f5e7a3', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#5a4a1a', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          🎂 Birthday
        </div>
        <div style={{ fontSize: 10, color: '#888' }}>Syncs to Client for Life</div>
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={persist}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', background: '#fff' }}
      />
    </div>
  );
}

// Review-tracking block — same data store as the Client for Life
// client card, so checking the box here also flips the card to
// "review left" green over there. Reads/writes client_profiles.
function ReviewField({ clientName }) {
  const profile = getProfile(clientName) || {};
  const [reviewLeft, setReviewLeft] = useState(!!profile.review_left);
  const [reviewDate, setReviewDate] = useState(profile.review_date || '');
  const [reviewSource, setReviewSource] = useState(profile.review_source || '');

  // If the same client is updated from CFL in another tab, refresh
  // the local state on the next render.
  useEffect(() => {
    const p = getProfile(clientName) || {};
    setReviewLeft(!!p.review_left);
    setReviewDate(p.review_date || '');
    setReviewSource(p.review_source || '');
  }, [clientName]);

  const persist = async (patch) => {
    await upsertClientProfile(clientName, patch);
  };

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', background: '#fff' };

  return (
    <div style={{
      marginTop: 14,
      padding: 12,
      background: reviewLeft ? '#e8f5e9' : '#fff',
      border: `1px solid ${reviewLeft ? '#a5d6a7' : '#e0e0e0'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#222', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={reviewLeft}
            onChange={(e) => {
              const next = e.target.checked;
              setReviewLeft(next);
              const todayIso = new Date().toISOString().slice(0, 10);
              const nextDate = next && !reviewDate ? todayIso : (reviewDate || null);
              if (next && !reviewDate) setReviewDate(todayIso);
              persist({ review_left: next, review_date: nextDate });
            }}
            style={{ width: 18, height: 18, accentColor: '#2e7d32' }}
          />
          {reviewLeft ? '⭐ Review left' : 'Has this client left a review?'}
        </label>
        <div style={{ fontSize: 10, color: '#888' }}>Syncs to Client for Life</div>
      </div>
      {reviewLeft && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>When</div>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              onBlur={() => persist({ review_date: reviewDate || null })}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Where</div>
            <select
              value={reviewSource}
              onChange={(e) => { setReviewSource(e.target.value); persist({ review_source: e.target.value }); }}
              style={inputStyle}
            >
              <option value="">— Pick —</option>
              {REVIEW_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// Identity editor — lets Kimberly fix typos in name / phone / email
// directly from the past-client drawer. Two persistence paths:
//   - Live-pipeline records (_source === 'loans'): mutate the loan
//     row in place + markLoansDirty (canonical source).
//   - Legacy PAST_CLIENTS seed records: write to client_profiles
//     override columns keyed by the original name, so display
//     corrections stick without needing to rewrite the seed file.
const LO_OPTIONS = ['', 'Kyle', 'Missy'];

function IdentityEditor({ client, onChange }) {
  const c = client;
  const [open, setOpen] = useState(false);
  const isLive = c._source === 'loans';
  const loan = isLive ? LOANS.find((l) => l.id === c.id) : null;
  const profile = getProfile(c.name) || {};

  // For legacy records, show the correction if one exists; otherwise
  // show the current (potentially wrong) value.
  const displayName = isLive ? c.name : (profile.corrected_name || c.name || '');
  const displayPhone = isLive ? c.phone : (profile.corrected_phone || c.phone || '');
  const displayEmail = isLive ? c.email : (profile.corrected_email || c.email || '');
  const displayLo = isLive ? (c.lo || '') : (profile.corrected_lo || c.lo || '');

  const save = async (field, value) => {
    if (isLive) {
      const mapping = { name: 'borrower', phone: 'phone', email: 'email', lo: 'lo' };
      loan[mapping[field] || field] = value;
      c[field] = value;
      markLoansDirty(loan);
    } else {
      const profileField = {
        name: 'corrected_name', phone: 'corrected_phone', email: 'corrected_email', lo: 'corrected_lo',
      }[field];
      if (profileField) await upsertClientProfile(c.name, { [profileField]: value || null });
    }
    onChange && onChange();
  };

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 };

  return (
    <div style={{ marginTop: 14, padding: 12, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Fix name / phone / email {open ? '▾' : '▸'}
        </div>
        <div style={{ fontSize: 10, color: '#888' }}>
          {isLive ? 'Persists to loans table' : 'Legacy record · saves to client profile'}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={labelStyle}>Client Name</div>
            <input
              defaultValue={displayName}
              onBlur={(e) => save('name', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Phone</div>
            <input
              defaultValue={displayPhone}
              onBlur={(e) => save('phone', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <input
              defaultValue={displayEmail}
              onBlur={(e) => save('email', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={labelStyle}>Loan Officer</div>
            <select
              value={displayLo}
              onChange={(e) => save('lo', e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
            >
              {LO_OPTIONS.map((n) => <option key={n} value={n}>{n || '—'}</option>)}
              {displayLo && !LO_OPTIONS.includes(displayLo) && (
                <option value={displayLo}>{displayLo} (custom)</option>
              )}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// Co-borrower editor — captures first name, last name, phone, email,
// and birthday for a client's co-borrower. Two persistence paths:
//   - Live-pipeline records (_source === 'loans'): text fields
//     persist onto the loan row (coFirst / coLast / coPhone / coEmail).
//   - Legacy PAST_CLIENTS seed records: text fields persist to
//     client_profiles override columns keyed by the main borrower's
//     name. Same visible behavior for Kimberly — no read-only wall.
// Birthday ALWAYS routes through client_dates keyed by the
// co-borrower's own name, so the co-borrower gets their own CFL
// client card and birthday tasks regardless of source.
function CoBorrowerEditor({ client, onChange }) {
  const c = client;
  const isLive = c._source === 'loans';
  const loan = isLive ? LOANS.find((l) => l.id === c.id) : null;
  const profile = getProfile(c.name) || {};
  const [open, setOpen] = useState(false);

  // Seed local state from the appropriate persistence layer.
  const [coFirst, setCoFirst] = useState(
    isLive ? (loan?.coFirst || c.coFirst || '') : (profile.co_borrower_first || '')
  );
  const [coLast, setCoLast] = useState(
    isLive ? (loan?.coLast || c.coLast || '') : (profile.co_borrower_last || '')
  );
  const [coPhone, setCoPhone] = useState(
    isLive ? (loan?.coPhone || c.coPhone || '') : (profile.co_borrower_phone || '')
  );
  const [coEmail, setCoEmail] = useState(
    isLive ? (loan?.coEmail || c.coEmail || '') : (profile.co_borrower_email || '')
  );
  const coName = `${(coFirst || '').trim()} ${(coLast || '').trim()}`.trim();
  const existingBday = coName ? getDate(coName, 'Birthday') : null;
  const [coBday, setCoBday] = useState(existingBday?.date_value || '');

  // Legacy loans stored co-borrower fields as c2first/c2last/... —
  // some views still read those. Mirror every write here so both
  // names carry the current value.
  const CO_ALIAS = {
    coFirst: 'c2first', coLast: 'c2last', coPhone: 'c2phone', coEmail: 'c2email',
  };
  const commit = async (field, value) => {
    if (isLive) {
      loan[field] = value;
      if (CO_ALIAS[field]) loan[CO_ALIAS[field]] = value;
      markLoansDirty(loan);
    } else {
      // Map camelCase local field → snake_case profile column.
      const map = {
        coFirst: 'co_borrower_first',
        coLast: 'co_borrower_last',
        coPhone: 'co_borrower_phone',
        coEmail: 'co_borrower_email',
      };
      const col = map[field];
      if (col) await upsertClientProfile(c.name, { [col]: value || null });
    }
    onChange && onChange();
  };

  const commitBirthday = async () => {
    if (!coName) return;
    if (!coBday.trim()) {
      if (existingBday) await deleteClientDate(coName, 'Birthday');
      return;
    }
    await upsertClientDate(coName, 'Birthday', coBday, { recurring: true });
  };

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 };

  return (
    <div style={{ marginTop: 14, padding: 12, background: '#eef7ff', border: '1px solid #cfe4f5', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0d3a5c' }}>
          Co-borrower {open ? '▾' : '▸'}
        </div>
        <div style={{ fontSize: 10, color: '#556' }}>
          {coName || 'None on file'} · {isLive ? 'saves to loan' : 'saves to profile'}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={labelStyle}>First name</div>
            <input value={coFirst}
              onChange={(e) => setCoFirst(e.target.value)}
              onBlur={() => commit('coFirst', coFirst)}
              style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Last name</div>
            <input value={coLast}
              onChange={(e) => setCoLast(e.target.value)}
              onBlur={() => commit('coLast', coLast)}
              style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Phone</div>
            <input value={coPhone}
              onChange={(e) => setCoPhone(e.target.value)}
              onBlur={() => commit('coPhone', coPhone)}
              style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <input value={coEmail}
              onChange={(e) => setCoEmail(e.target.value)}
              onBlur={() => commit('coEmail', coEmail)}
              style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={labelStyle}>🎂 Birthday {coName ? `(for ${coName})` : '(save name first)'}</div>
            <input
              type="date"
              value={coBday}
              disabled={!coName}
              onChange={(e) => setCoBday(e.target.value)}
              onBlur={commitBirthday}
              style={inputStyle}
            />
            {coName && (
              <div style={{ fontSize: 10, color: '#556', marginTop: 4 }}>
                Creates a Client for Life card for {coName} and drives their own birthday tasks.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PastClientDrawer({ client, refiRate, onClose }) {
  const c = client;
  const [, force] = useState(0);
  const [draft, setDraft] = useState('');
  // Hydrate the drawer's Follow-Up state from client_profiles so notes
  // + last_contact survive refresh. Falls back to whatever's on the
  // in-memory client (loan record OR PAST_CLIENTS seed).
  const profile = getProfile(c.name) || {};
  if (profile.last_contact && !c.lastContact) c.lastContact = profile.last_contact;
  if (Array.isArray(profile.note_entries) && profile.note_entries.length && (!c.noteEntries || c.noteEntries.length === 0)) {
    c.noteEntries = profile.note_entries;
  }

  // set() persists to BOTH the in-memory client (so the drawer reflects
  // instantly) AND to client_profiles (so the change survives refresh
  // or another user's load).
  const set = (key, value) => {
    c[key] = value;
    // client_profiles column names are snake_case.
    const columnMap = { lastContact: 'last_contact' };
    const col = columnMap[key];
    if (col) upsertClientProfile(c.name, { [col]: value || null });
    force((n) => n + 1);
  };
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
    const nextEntries = [entry, ...(c.noteEntries || [])];
    c.noteEntries = nextEntries;
    setDraft('');
    force((n) => n + 1);
    // Persist to client_profiles so the note survives refresh.
    upsertClientProfile(c.name, { note_entries: nextEntries });
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
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
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

          <IdentityEditor client={c} onChange={() => force((n) => n + 1)} />
          <BirthdayField clientName={c.name} />
          <ReviewField clientName={c.name} />
          <CoBorrowerEditor client={c} onChange={() => force((n) => n + 1)} />

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
