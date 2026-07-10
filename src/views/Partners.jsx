import { useState, useMemo, useEffect } from 'react';
import { PARTNERS } from '../data/partners.js';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES } from '../data/stages.js';
import { ALL_STATES, STATE_NAMES } from '../data/states.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { markPartnerDirty, markPartnerNew, savePartnersNow, subscribePartners, deletePartner, mergePartners } from '../lib/partnersStore.js';
import Tour from '../components/Tour.jsx';

// Format helpers — mirror legacy fmt$M / fmt$
const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString();
const fmt$M = (n) => {
  n = n || 0;
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
};
const partnerLoc = (p) => [p.city, p.state].filter(Boolean).join(', ') || '—';

const AGENT_TOUCHPOINTS = {
  standard: [
    'Welcome email within 24 hrs of first referral',
    'Monthly market update email',
    'Quarterly check-in call',
    'Holiday card (Dec)',
    'Birthday text (if on file)',
  ],
  vip: [
    'Everything Standard, plus:',
    'Monthly 1:1 coffee/Zoom',
    'Quarterly gift box (handwritten note)',
    'Co-branded marketing materials',
    'Priority same-day lock requests',
    'Annual appreciation dinner',
  ],
};

const DEAL_BUCKETS = ['All', '1+ deals', '5+ deals', '10+ deals', '25+ deals'];
const DEAL_MIN = { All: 0, '1+ deals': 1, '5+ deals': 5, '10+ deals': 10, '25+ deals': 25 };
// Built-in partner categories. Anything the team types into the "+ New
// category…" input in the drawer becomes a custom category that's
// persisted to localStorage so it shows up in dropdowns even before
// the first partner is assigned to it. Partners without a tier value
// fall back to "Standard".
const PREDEFINED_TIERS = ['VIP', 'Standard', 'Should Nurture', 'Not in Real Estate Anymore', 'Other'];

function loadCustomTiers() {
  try {
    const raw = JSON.parse(localStorage.getItem('kdt-partner-tiers') || '[]');
    return Array.isArray(raw) ? raw.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch { return []; }
}

function saveCustomTiers(list) {
  try { localStorage.setItem('kdt-partner-tiers', JSON.stringify(list)); } catch {}
}

// Union of predefined + locally-saved custom + every tier actually in
// use on a partner. De-duped, predefined ordering preserved at the top,
// custom/used ones appended alphabetically at the bottom.
function allKnownTiers() {
  const custom = loadCustomTiers();
  const used = new Set();
  PARTNERS.forEach((p) => { if (p.tier && p.tier !== 'Standard') used.add(p.tier); });
  const known = new Set([...PREDEFINED_TIERS, ...custom, ...used]);
  const extras = [...known].filter((t) => !PREDEFINED_TIERS.includes(t)).sort((a, b) => a.localeCompare(b));
  return [...PREDEFINED_TIERS, ...extras];
}

const TIER_OPTIONS = ['All', 'VIP', 'Standard'];
const LO_OPTIONS = ['All', 'Kyle', 'Missy'];

// Derive each partner's primary LO from the LOANS pipeline: whichever LO
// has the most loans (active or funded, excluding adversed/archived) with
// that agent's name. A manual `primary_lo` field on the partner overrides
// this. Returns a map of partner name -> 'Kyle' | 'Missy' | ''.
function derivePrimaryLoByName() {
  const counts = {};
  LOANS.forEach((l) => {
    if (l.archived || l.status === 'Adversed') return;
    if (!l.agent || !l.lo) return;
    counts[l.agent] = counts[l.agent] || {};
    counts[l.agent][l.lo] = (counts[l.agent][l.lo] || 0) + 1;
  });
  const result = {};
  Object.entries(counts).forEach(([agent, byLo]) => {
    let best = '';
    let bestN = 0;
    Object.entries(byLo).forEach(([lo, n]) => { if (n > bestN) { best = lo; bestN = n; } });
    result[agent] = best;
  });
  return result;
}

export default function Partners() {
  const [filters, setFilters] = useState({ search: '', state: 'All', tier: 'All', deals: 'All', lo: 'All', sort: 'Most Deals', group: 'No grouping' });
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  // PARTNERS is a mutable module-level array. Bumping this counter forces the
  // memos below to recompute after we push a new partner so the list updates
  // immediately instead of waiting for a manual refresh.
  const [partnersVersion, setPartnersVersion] = useState(0);

  // Listen for save outcomes from partnersStore and surface them as a
  // visible toast so the user actually sees what's happening without
  // having to open DevTools.
  useEffect(() => {
    const onErr = (e) => {
      const msg = e?.detail?.message || 'Save failed';
      setToast({ title: 'Save failed', msg, error: true });
    };
    const onOk = (e) => {
      const count = e?.detail?.count || 1;
      const action = e?.detail?.action || 'save';
      const verbMap = { insert: 'added', delete: 'removed', save: 'updated', merge: 'merged' };
      const titleMap = { delete: 'Removed', merge: 'Merged' };
      setToast({
        title: titleMap[action] || 'Saved',
        msg: `${count} partner${count === 1 ? '' : 's'} ${verbMap[action] || 'updated'} in Supabase`,
      });
      // Force the list to recompute so a local delete (or any other
      // mutation that doesn't go through realtime) immediately drops
      // the partner from view instead of waiting for the realtime echo.
      setPartnersVersion((v) => v + 1);
    };
    window.addEventListener('partners:save-error', onErr);
    window.addEventListener('partners:save-success', onOk);
    return () => {
      window.removeEventListener('partners:save-error', onErr);
      window.removeEventListener('partners:save-success', onOk);
    };
  }, []);

  // Subscribe to live changes from other clients so adds/edits made by
  // teammates show up here within ~1s without a refresh.
  useEffect(() => {
    const unsubscribe = subscribePartners(() => setPartnersVersion((v) => v + 1));
    return unsubscribe;
  }, []);

  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const PARTNERS_TOUR_STEPS = [
    {
      title: 'Realtor Partners',
      body: 'Every agent + brokerage the team has closed with, plus VIPs you\'re actively cultivating. Lifetime deal counts, YTD stats, and current pipeline volume are all computed live from LOANS — no double-entry.',
    },
    {
      target: '.touchpoint-grid',
      title: 'Standard vs VIP touchpoints',
      body: 'The top card breaks down what a Standard agent gets vs. what a VIP agent gets — cadence of gifts, calls, and closing gifts. Click the header to collapse it once you know the rules.',
    },
    {
      target: '.income-filters',
      title: 'Filters + grouping',
      body: 'Filter by state, VIP tier, deal count, or LO. Group by brokerage or state to see who is carrying the biggest share of the book. Reset (dark red chip) clears everything at once.',
    },
    {
      target: '.partner-grid, .partner-list',
      title: 'Partner cards + list',
      body: 'Toggle between grid and list view. Each card shows total closings, total volume, YTD closings, YTD volume, and live pipeline volume in escrow with this agent right now. Click any card to open the drawer.',
    },
    {
      title: 'Partner drawer',
      body: 'The drawer edits every field on the partner — contact info, spouse + kids, birthday, favorite restaurant, notes. Every save is realtime-synced to teammates.\n\nA "Touches" log at the bottom lets you record when you last called, met, or sent a gift so nobody drops the ball.',
    },
    {
      title: 'Merge duplicates',
      body: 'When two rows exist for the same agent (usually a Realtor Referral typed differently), open the drawer and use the Merge action to fold source into target. Loans that referenced the source get re-tagged to the target automatically, safely.',
    },
  ];

  // Compute per-agent live pipeline counts from LOANS. "Live" means
  // actually in escrow / LOS — signed contract through approved. Earlier
  // versions counted any non-funded loan, which made pre-contract leads
  // (New Lead, HOT PA, REFI Watch, Applied) show up as "live deals" on
  // agents that didn't actually have anything in escrow.
  const livePipelineByAgent = useMemo(() => {
    const map = {};
    LOANS.forEach((l) => {
      if (l.archived || l.status === 'Adversed') return;
      if (!l.agent) return;
      if (!LOS_STAGES.includes(l.stage)) return;
      if (!map[l.agent]) map[l.agent] = { count: 0, volume: 0 };
      map[l.agent].count += 1;
      map[l.agent].volume += l.amount || 0;
    });
    return map;
  }, []);

  // Decorate partners with live pipeline data and a derived primary LO.
  // The manual primary_lo field (if set) takes precedence over the derived
  // value so the user can override the heuristic when needed.
  const primaryLoByName = useMemo(derivePrimaryLoByName, [partnersVersion]);
  const partnersWithLive = useMemo(
    () => PARTNERS.map((p) => {
      const lp = livePipelineByAgent[p.name];
      const primaryLo = p.primary_lo || p.primaryLo || primaryLoByName[p.name] || '';
      const base = lp ? { ...p, livePipeline: lp.count, livePipelineVolume: lp.volume } : { ...p };
      base.derivedLo = primaryLo;
      return base;
    }),
    [livePipelineByAgent, partnersVersion, primaryLoByName]
  );

  const stateOptions = useMemo(
    () =>
      ['All', ...new Set(PARTNERS.map((p) => p.state).filter((s) => s && s !== '—'))].sort(
        (a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b))
      ),
    [partnersVersion]
  );

  const filtered = useMemo(() => {
    const dealMin = DEAL_MIN[filters.deals] || 0;
    return partnersWithLive.filter((p) => {
      if (filters.search && !`${p.name} ${partnerLoc(p)}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.state !== 'All' && p.state !== filters.state) return false;
      if (filters.tier !== 'All') {
        const pt = p.tier || 'Standard';
        if (filters.tier === 'VIP') { if (!p.vip) return false; }
        else if (filters.tier === 'Standard') { if (p.vip || (pt !== 'Standard' && pt !== '')) return false; }
        else if (pt !== filters.tier) return false;
      }
      if (filters.lo !== 'All' && (p.derivedLo || '') !== filters.lo) return false;
      if ((p.deals || 0) < dealMin) return false;
      return true;
    });
  }, [filters, partnersWithLive]);

  const sortPartners = (list) => {
    const arr = [...list];
    switch (filters.sort) {
      case 'Alphabetical':
        return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'Most Closings':
        return arr.sort((a, b) => (b.closed || 0) - (a.closed || 0));
      case 'Most Volume':
        return arr.sort((a, b) => (b.lifetime || b.volume || 0) - (a.lifetime || a.volume || 0));
      case 'Live Pipeline':
        return arr.sort((a, b) => (b.livePipeline || 0) - (a.livePipeline || 0));
      case 'Most Deals':
      default:
        return arr.sort((a, b) => (b.deals || 0) - (a.deals || 0));
    }
  };
  // Group filtered partners by category for the "one section per
  // category" rendering. VIP is intentionally first and rendered with
  // its existing card-grid layout. Every other category (Standard,
  // Should Nurture, custom ones, etc.) renders as a row list section.
  const partnersByCategory = useMemo(() => {
    const sorted = sortPartners(filtered);
    const buckets = new Map();
    sorted.forEach((p) => {
      const cat = p.vip ? 'VIP' : (p.tier || 'Standard');
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(p);
    });
    // Order categories: VIP first, then the predefined order, then any
    // custom categories alphabetically. Skip empty buckets.
    const ordered = [];
    ['VIP', ...PREDEFINED_TIERS.filter((t) => t !== 'VIP')].forEach((t) => {
      if (buckets.has(t)) { ordered.push([t, buckets.get(t)]); buckets.delete(t); }
    });
    [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach((entry) => ordered.push(entry));
    return ordered;
  }, [filtered, filters.sort]);

  // Group partners by state for the "By State" grouping view. Otherwise
  // returns a single bucket so the existing list rendering still works.
  const groupByState = (list) => {
    if (filters.group !== 'By State') return [{ key: '', label: '', items: list }];
    const buckets = {};
    list.forEach((p) => {
      const k = p.state || '—';
      buckets[k] = buckets[k] || [];
      buckets[k].push(p);
    });
    return Object.keys(buckets)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ key: k, label: STATE_NAMES[k] || k, items: buckets[k] }));
  };

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const [openedPartner, setOpenedPartner] = useState(null);
  // partnersWithLive returns a SHALLOW COPY for any partner that has loans
  // referencing them by name (livePipelineByAgent decoration). Editing that
  // shallow copy in the drawer would land mutations on a throw-away object,
  // and the debounced flush — which looks up the canonical entry by id from
  // PARTNERS — would persist the un-edited row instead. Always resolve to
  // the canonical PARTNERS entry before opening the drawer so edits stick
  // for live-pipeline agents (Olivia Evans, etc.) the same way they do for
  // partners without active loans (Lauren Neu, Montana).
  const openPartner = (p) => {
    if (!p) return;
    const canonical =
      (p.id && PARTNERS.find((x) => x.id === p.id)) ||
      PARTNERS.find((x) => x.name === p.name) ||
      p;
    setOpenedPartner(canonical);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {PARTNERS.length} Active Referral Partners
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Click any partner to view all loans done together</div>
        </div>
        <button className="form-btn primary" type="button" onClick={() => setShowForm(true)}>
          + Add New Partner
        </button>
      </div>

      <details className="section-card" style={{ cursor: 'pointer' }}>
        <summary style={{ listStyle: 'none', cursor: 'pointer' }}>
          <div className="section-header" style={{ padding: '14px 18px 0' }}>
            <div className="section-title">
              Realtor Partner Touchpoints <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>▾ click to expand</span>
            </div>
            <div className="section-sub">Standard vs VIP tier</div>
          </div>
        </summary>
        <div className="section-body">
          <div className="touchpoint-grid">
            <div className="touchpoint-card">
              <div className="touchpoint-title">Standard Agent</div>
              <ul className="touchpoint-list">
                {AGENT_TOUCHPOINTS.standard.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
            <div className="touchpoint-card vip">
              <div className="touchpoint-title">VIP Agent (5+ total closings)</div>
              <ul className="touchpoint-list">
                {AGENT_TOUCHPOINTS.vip.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </details>

      <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 12px', color: '#444' }}>
        All Referral Partners
      </h3>

      <div className="income-filters">
        <input
          type="text"
          placeholder="Search by name, city, or state..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ background: '#fff', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 20, fontSize: 12, minWidth: 240, color: '#222' }}
        />
        <FilterDropdown label="State" value={filters.state} options={stateOptions} onChange={(v) => setFilter('state', v)} />
        <FilterDropdown label="Tier" value={filters.tier} options={['All', ...allKnownTiers()]} onChange={(v) => setFilter('tier', v)} />
        <FilterDropdown label="LO" value={filters.lo} options={LO_OPTIONS} onChange={(v) => setFilter('lo', v)} />
        <FilterDropdown label="Deals" value={filters.deals} options={DEAL_BUCKETS} onChange={(v) => setFilter('deals', v)} />
        <FilterDropdown label="Sort" value={filters.sort} options={['Most Deals', 'Alphabetical', 'Most Closings', 'Most Volume', 'Live Pipeline']} onChange={(v) => setFilter('sort', v)} />
        <FilterDropdown label="Group" value={filters.group} options={['No grouping', 'By State']} onChange={(v) => setFilter('group', v)} />
        <div
          className="income-filter"
          style={{ background: '#5a0e1a', cursor: 'pointer' }}
          onClick={() => setFilters({ search: '', state: 'All', tier: 'All', deals: 'All', lo: 'All', sort: 'Most Deals', group: 'No grouping' })}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {PARTNERS.length} partners
        </div>
      </div>

      {partnersByCategory.map(([category, partners]) => {
        const isVip = category === 'VIP';
        const headerColor = isVip ? 'var(--brand-red)' : '#666';
        return groupByState(partners).map((group) => (
          group.items.length > 0 && (
            <div key={`${category}-${group.key}`}>
              <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 10px', color: headerColor }}>
                {category}{group.label ? ` · ${group.label}` : ''} ({group.items.length})
              </h3>
              {isVip ? (
                <div className="partner-grid">
                  {group.items.map((p) => (
                    <div key={p.name} className="partner-card vip" style={{ cursor: 'pointer' }} onClick={() => openPartner(p)}>
                      <div className="partner-name">{p.name}</div>
                      <div className="partner-brokerage">{partnerLoc(p)}</div>
                      <div className="partner-stat"><span>Total Closings</span><strong>{p.totalClosings || p.deals || 0}</strong></div>
                      <div className="partner-stat"><span>Total Volume</span><strong>{fmt$(p.totalVolume || p.lifetime || 0)}</strong></div>
                      <div className="partner-stat"><span>YTD Closings</span><strong>{p.ytdClosings || p.closed || 0}</strong></div>
                      <div className="partner-stat"><span>YTD Volume</span><strong>{fmt$(p.ytdVolume || p.volume || 0)}</strong></div>
                      {p.livePipeline ? (
                        <div className="partner-stat" style={{ borderTop: '1px dashed #f5b8c1', paddingTop: 6, marginTop: 4 }}>
                          <span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>Live Pipeline</span>
                          <strong>{p.livePipeline} · {fmt$(p.livePipelineVolume || 0)}</strong>
                        </div>
                      ) : null}
                      <div style={{ textAlign: 'center', fontSize: 10, color: '#999', marginTop: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        Click for full detail
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="partner-list">
                  <div className="partner-row-head">
                    <div>Agent</div>
                    <div>Brokerage</div>
                    <div style={{ textAlign: 'right' }}>State</div>
                    <div style={{ textAlign: 'right' }}>Total Closings</div>
                    <div style={{ textAlign: 'right' }}>Total Volume</div>
                    <div style={{ textAlign: 'right' }}>YTD Closings</div>
                  </div>
                  {group.items.map((p) => (
                    <div key={p.name} className="partner-row" onClick={() => openPartner(p)}>
                      <div className="name">
                        {p.name}
                        {p.livePipeline ? <span className="live">● {p.livePipeline} live</span> : null}
                      </div>
                      <div className="brk">{partnerLoc(p)}</div>
                      <div className="num">{p.state || '—'}</div>
                      <div className="num">{p.totalClosings || p.closed || 0}</div>
                      <div className="vol">{fmt$(p.totalVolume || p.lifetime || 0)}</div>
                      <div className="num" style={{ color: '#888' }}>{p.ytdClosings || p.closed || 0}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ));
      })}

      {partnersByCategory.length === 0 && (
        <div className="muted" style={{ textAlign: 'center', padding: 30 }}>No partners match those filters</div>
      )}

      {showForm && <NewPartnerDrawer onClose={() => setShowForm(false)} onSubmit={(p) => {
        const added = { ...p, deals: 0, closed: 0, volume: 0, lifetime: 0, vip: p.tier?.startsWith('VIP') };
        PARTNERS.push(added);
        markPartnerNew(added);
        setPartnersVersion((v) => v + 1);
        setToast({ title: 'Partner Added', msg: `${p.name} — saved to Supabase` });
        setShowForm(false);
      }} />}

      {openedPartner && <PartnerDrawer partner={openedPartner} onClose={() => setOpenedPartner(null)} />}

      {toast && (
        <div
          className="toast"
          onClick={() => setToast(null)}
          style={toast.error ? { background: '#c62828', color: '#fff', maxWidth: 480 } : undefined}
        >
          <strong>{toast.title}</strong>
          <div style={{ wordBreak: 'break-word' }}>{toast.msg}</div>
        </div>
      )}
      {tourOpen && <Tour steps={PARTNERS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}

function NewPartnerDrawer({ onClose, onSubmit }) {
  const [f, setF] = useState({
    name: '', brokerage: '', state: '', city: '', phone: '', email: '',
    bday: '', anniversary: '', spouse: '', kids: '', coffee: '', restaurant: '',
    addr: '', social: '', notes: '',
    tier: 'Standard', src: 'Past Closing',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    if (!f.name || !f.brokerage || !f.phone || !f.email) {
      alert('Name, brokerage, phone, and email are required.');
      return;
    }
    onSubmit(f);
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">New Partner</div>
          <div className="drawer-borrower">Add Realtor Partner</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>On submit → saved + welcome touch sequence begins</div>
        </div>
        <div className="drawer-body">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field"><label className="req">Agent Name</label><input value={f.name} onChange={set('name')} required /></div>
            <div className="form-field"><label className="req">Brokerage</label><input value={f.brokerage} onChange={set('brokerage')} required /></div>
            <div className="form-field"><label>State</label>
              <select value={f.state} onChange={set('state')}>
                <option value="">— Select —</option>
                {ALL_STATES.map((s) => <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>)}
              </select>
            </div>
            <div className="form-field"><label>City</label><input value={f.city} onChange={set('city')} /></div>
            <div className="form-field"><label className="req">Phone</label><input type="tel" value={f.phone} onChange={set('phone')} required /></div>
            <div className="form-field"><label className="req">Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
            <div className="form-field"><label>Birthday</label><input type="date" value={f.bday} onChange={set('bday')} /></div>
            <div className="form-field"><label>Anniversary</label><input type="date" value={f.anniversary} onChange={set('anniversary')} /></div>
            <div className="form-field"><label>Spouse / Partner Name</label><input value={f.spouse} onChange={set('spouse')} /></div>
            <div className="form-field"><label>Kids / Pet Names</label><input value={f.kids} onChange={set('kids')} /></div>
            <div className="form-field"><label>Favorite Coffee Shop</label><input value={f.coffee} onChange={set('coffee')} /></div>
            <div className="form-field"><label>Favorite Restaurant</label><input value={f.restaurant} onChange={set('restaurant')} /></div>
            <div className="form-field" style={{ gridColumn: '1/-1' }}><label>Mailing Address</label><input value={f.addr} onChange={set('addr')} /></div>
            <div className="form-field"><label>Social Media Handle</label><input value={f.social} onChange={set('social')} /></div>
            <div className="form-field" style={{ gridColumn: '1/-1' }}>
              <label>Notes</label>
              <textarea
                value={f.notes}
                onChange={set('notes')}
                rows={3}
                placeholder="Anything memorable — kids' names, coffee order, milestones, gift ideas, etc."
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
            <div className="form-field"><label>Referral Tier</label>
              <select value={f.tier} onChange={set('tier')}>
                <option>Standard</option><option>VIP (5+ deals/yr)</option>
              </select>
            </div>
            <div className="form-field" style={{ gridColumn: '1/-1' }}><label>Lead Source</label>
              <select value={f.src} onChange={set('src')}>
                <option>Past Closing</option><option>Networking Event</option><option>Past Client Intro</option><option>Other LO</option><option>Cold Outreach</option>
              </select>
            </div>
          </form>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" type="button" onClick={submit}>Add Partner</button>
        </div>
      </aside>
    </>
  );
}

function PartnerDrawer({ partner, onClose }) {
  const [, force] = useState(0);
  const [touchDraft, setTouchDraft] = useState({ kind: 'call', note: '' });

  const logTouch = () => {
    if (!touchDraft.kind) return;
    partner.touches = partner.touches || [];
    partner.touches.unshift({ at: new Date().toISOString(), kind: touchDraft.kind, note: touchDraft.note });
    partner.lastTouchAt = partner.touches[0].at;
    markPartnerDirty(partner);
    setTouchDraft({ kind: 'call', note: '' });
    force((n) => n + 1);
  };

  const p = partner;
  // update — capture every keystroke into the partner object and reset
  // the debounce timer. We do NOT force a re-render here, otherwise
  // EditRow (defined inside this component) would unmount on every key
  // and the user would lose focus mid-typing.
  // set — same plus a force re-render, used on blur so dependent UI
  // (e.g. drawer title) refreshes when the user finishes a field.
  const update = (key, value) => { p[key] = value; markPartnerDirty(p); };
  const set = (key, value) => { update(key, value); force((n) => n + 1); };
  // Force-flush any pending debounced save before the drawer unmounts —
  // mobile users frequently tap Close immediately after typing, and we
  // can't rely on onBlur firing before unmount.
  const handleClose = () => { savePartnersNow(); onClose(); };
  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, display: 'block' };

  const EditRow = ({ label, field, type = 'text' }) => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        defaultValue={p[field] || ''}
        onChange={(e) => update(field, e.target.value)}
        onBlur={(e) => set(field, e.target.value)}
        style={inputStyle}
      />
    </div>
  );
  const ReadRow = ({ label, value }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 13, color: '#222' }}>{value || '—'}</div>
    </div>
  );

  return (
    <>
      <div className="drawer-overlay open" onClick={handleClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={handleClose} aria-label="Close">×</button>
          <div className="drawer-stage">{p.vip ? 'VIP Partner' : 'Partner'}</div>
          <div className="drawer-borrower">{p.name}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</div>
        </div>
        <div className="drawer-body">
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10 }}>
            Contact
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <EditRow label="Name" field="name" />
            <EditRow label="Brokerage" field="brokerage" />
            <EditRow label="Phone" field="phone" type="tel" />
            <EditRow label="Email" field="email" type="email" />
            <EditRow label="City" field="city" />
            <EditRow label="State" field="state" />
            <EditRow label="Birthday" field="bday" type="date" />
            <EditRow label="Anniversary" field="anniversary" type="date" />
            <EditRow label="Spouse / Partner" field="spouse" />
            <EditRow label="Kids / Pets" field="kids" />
            <EditRow label="Favorite Coffee" field="coffee" />
            <EditRow label="Favorite Restaurant" field="restaurant" />
            <div style={{ gridColumn: '1/-1' }}><EditRow label="Mailing Address" field="addr" /></div>
            <EditRow label="Social Handle" field="social" />
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={p.tier || 'Standard'}
                onChange={(e) => {
                  let next = e.target.value;
                  if (next === '__new__') {
                    const raw = window.prompt('Name the new category (e.g. "Builder", "Title Co", "Past Client")');
                    const cleaned = (raw || '').trim();
                    if (!cleaned) return;
                    // Persist the custom category so it appears in the
                    // dropdown for every partner going forward, even
                    // before anyone else is assigned to it.
                    const custom = loadCustomTiers();
                    if (!custom.includes(cleaned) && !PREDEFINED_TIERS.includes(cleaned)) {
                      saveCustomTiers([...custom, cleaned]);
                    }
                    next = cleaned;
                  }
                  p.vip = next === 'VIP' || next.startsWith('VIP');
                  set('tier', next);
                }}
                style={inputStyle}
              >
                {allKnownTiers().map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__new__">+ New category…</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Primary LO (override)</label>
              <select
                defaultValue={p.primary_lo || p.primaryLo || ''}
                onChange={(e) => set('primary_lo', e.target.value)}
                style={inputStyle}
              >
                <option value="">— Auto from loans —</option>
                <option value="Kyle">Kyle</option>
                <option value="Missy">Missy</option>
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                defaultValue={p.notes || ''}
                onChange={(e) => update('notes', e.target.value)}
                onBlur={(e) => set('notes', e.target.value)}
                rows={4}
                placeholder="Anything memorable — kids' names, coffee order, milestones, gift ideas, etc."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', margin: '18px 0 10px', paddingTop: 14, borderTop: '1px solid #eee' }}>
            Stats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ReadRow label="Total Closings" value={p.totalClosings || p.deals || 0} />
            <ReadRow label="Lifetime Volume" value={'$' + Math.round(p.lifetime || 0).toLocaleString()} />
            <ReadRow label="YTD Closings" value={p.closed || p.ytdClosings || 0} />
            <ReadRow label="YTD Volume" value={'$' + Math.round(p.volume || p.ytdVolume || 0).toLocaleString()} />
          </div>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #eee' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10, color: '#555' }}>
              Log a Touch
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'start' }}>
              <select value={touchDraft.kind} onChange={(e) => setTouchDraft((d) => ({ ...d, kind: e.target.value }))}
                style={{ padding: 8, border: '1px solid #d0d0d0', borderRadius: 6, fontSize: 13 }}>
                <option value="call">Call</option>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="gift">Gift</option>
                <option value="other">Other</option>
              </select>
              <input
                value={touchDraft.note}
                onChange={(e) => setTouchDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="Notes (optional)"
                style={{ padding: 8, border: '1px solid #d0d0d0', borderRadius: 6, fontSize: 13 }}
              />
              <button className="form-btn primary" type="button" onClick={logTouch} style={{ padding: '8px 14px', fontSize: 12 }}>Log</button>
            </div>
            {p.touches && p.touches.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Recent touches</div>
                {p.touches.slice(0, 10).map((t, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#555', marginRight: 8, fontSize: 10 }}>{t.kind}</span>
                    <span style={{ color: '#999', marginRight: 8 }}>{new Date(t.at).toLocaleDateString()}</span>
                    {t.note && <span>{t.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="drawer-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="drawer-btn"
            style={{ color: '#c62828', borderColor: '#f5b8c1' }}
            onClick={async () => {
              const ok = window.confirm(`Delete ${p.name}? This removes them from the partner list permanently. Loans referencing them are not affected.`);
              if (!ok) return;
              await deletePartner(p);
              onClose();
            }}
          >
            Delete partner
          </button>
          <MergeControl partner={p} onMerged={onClose} />
          <button className="drawer-btn primary" onClick={handleClose}>Close</button>
        </div>
      </aside>
    </>
  );
}

// Merge-this-partner-into-another control. Renders a select of every
// OTHER partner (alphabetical) and a Merge button. Confirms before
// actually merging — merge is destructive (deletes the source).
function MergeControl({ partner, onMerged }) {
  const [targetName, setTargetName] = useState('');
  const others = useMemo(
    () => PARTNERS
      .filter((x) => x !== partner && x.name !== partner.name)
      .map((x) => x.name)
      .sort((a, b) => a.localeCompare(b)),
    [partner]
  );
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 auto', justifyContent: 'center' }}>
      <select
        value={targetName}
        onChange={(e) => setTargetName(e.target.value)}
        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #d0d0d0', borderRadius: 6, maxWidth: 220 }}
      >
        <option value="">Merge into…</option>
        {others.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button
        className="drawer-btn"
        disabled={!targetName}
        title={targetName ? `Merge ${partner.name} → ${targetName}` : 'Pick a target first'}
        style={{ opacity: targetName ? 1 : 0.4 }}
        onClick={async () => {
          const target = PARTNERS.find((x) => x.name === targetName);
          if (!target) return;
          const ok = window.confirm(
            `Merge "${partner.name}" INTO "${targetName}"?\n\n` +
            `"${targetName}" will keep its name and get any missing fields filled in from "${partner.name}". ` +
            `Loans referencing "${partner.name}" will be re-pointed to "${targetName}". ` +
            `"${partner.name}" will then be deleted.`
          );
          if (!ok) return;
          await mergePartners(partner, target, LOANS);
          onMerged();
        }}
      >
        Merge
      </button>
    </div>
  );
}
