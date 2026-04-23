import { useState, useMemo } from 'react';
import { PARTNERS } from '../data/partners.js';
import { ALL_STATES, STATE_NAMES } from '../data/states.js';
import FilterDropdown from '../components/FilterDropdown.jsx';

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
const TIER_OPTIONS = ['All', 'VIP', 'Standard'];

export default function Partners() {
  const [filters, setFilters] = useState({ search: '', state: 'All', tier: 'All', deals: 'All' });
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);

  const stateOptions = useMemo(
    () =>
      ['All', ...new Set(PARTNERS.map((p) => p.state).filter((s) => s && s !== '—'))].sort(
        (a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b))
      ),
    []
  );

  const filtered = useMemo(() => {
    const dealMin = DEAL_MIN[filters.deals] || 0;
    return PARTNERS.filter((p) => {
      if (filters.search && !`${p.name} ${partnerLoc(p)}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.state !== 'All' && p.state !== filters.state) return false;
      if (filters.tier === 'VIP' && !p.vip) return false;
      if (filters.tier === 'Standard' && p.vip) return false;
      if ((p.deals || 0) < dealMin) return false;
      return true;
    });
  }, [filters]);

  const vipPartners = filtered.filter((p) => p.vip);
  const standardPartners = [...filtered.filter((p) => !p.vip)].sort((a, b) => (b.deals || 0) - (a.deals || 0));

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const openPartner = (p) => {
    setToast({ title: 'Partner', msg: `${p.name} — detail drawer not yet ported` });
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
        <FilterDropdown label="Tier" value={filters.tier} options={TIER_OPTIONS} onChange={(v) => setFilter('tier', v)} />
        <FilterDropdown label="Deals" value={filters.deals} options={DEAL_BUCKETS} onChange={(v) => setFilter('deals', v)} />
        <div
          className="income-filter"
          style={{ background: '#5a0e1a', cursor: 'pointer' }}
          onClick={() => setFilters({ search: '', state: 'All', tier: 'All', deals: 'All' })}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {PARTNERS.length} partners
        </div>
      </div>

      {vipPartners.length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 10px', color: 'var(--brand-red)' }}>
            VIP Agents ({vipPartners.length})
          </h3>
          <div className="partner-grid">
            {vipPartners.map((p) => (
              <div key={p.name} className="partner-card vip" style={{ cursor: 'pointer' }} onClick={() => openPartner(p)}>
                <div className="partner-name">{p.name}</div>
                <div className="partner-brokerage">{partnerLoc(p)}</div>
                <div className="partner-stat"><span>Total Closings</span><strong>{p.totalClosings || 0}</strong></div>
                <div className="partner-stat"><span>Total Volume</span><strong>{fmt$M(p.totalVolume || p.lifetime || 0)}</strong></div>
                <div className="partner-stat"><span>YTD Closings</span><strong>{p.ytdClosings || p.closed || 0}</strong></div>
                <div className="partner-stat"><span>YTD Volume</span><strong>{fmt$M(p.ytdVolume || p.volume || 0)}</strong></div>
                {p.livePipeline ? (
                  <div className="partner-stat" style={{ borderTop: '1px dashed #f5b8c1', paddingTop: 6, marginTop: 4 }}>
                    <span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>Live Pipeline</span>
                    <strong>{p.livePipeline} · {fmt$M(p.livePipelineVolume || 0)}</strong>
                  </div>
                ) : null}
                <div style={{ textAlign: 'center', fontSize: 10, color: '#999', marginTop: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Click for full detail
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {standardPartners.length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 10px', color: '#666' }}>
            Standard Agents ({standardPartners.length})
          </h3>
          <div className="partner-list">
            <div className="partner-row-head">
              <div>Agent</div>
              <div>Brokerage</div>
              <div style={{ textAlign: 'right' }}>State</div>
              <div style={{ textAlign: 'right' }}>Total Closings</div>
              <div style={{ textAlign: 'right' }}>Total Volume</div>
              <div style={{ textAlign: 'right' }}>YTD Closings</div>
            </div>
            {standardPartners.map((p) => (
              <div key={p.name} className="partner-row" onClick={() => openPartner(p)}>
                <div className="name">
                  {p.name}
                  {p.livePipeline ? <span className="live">● {p.livePipeline} live</span> : null}
                </div>
                <div className="brk">{partnerLoc(p)}</div>
                <div className="num">{p.state || '—'}</div>
                <div className="num">{p.totalClosings || p.closed || 0}</div>
                <div className="vol">{fmt$M(p.totalVolume || p.lifetime || 0)}</div>
                <div className="num" style={{ color: '#888' }}>{p.ytdClosings || p.closed || 0}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {standardPartners.length === 0 && vipPartners.length === 0 && (
        <div className="muted" style={{ textAlign: 'center', padding: 30 }}>No partners match those filters</div>
      )}

      {showForm && <NewPartnerModal onClose={() => setShowForm(false)} onSubmit={(p) => {
        console.log('[partners] new partner submitted', p);
        setToast({ title: 'Partner Added', msg: `${p.name} — welcome touch sequence started` });
        setShowForm(false);
      }} />}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <strong>{toast.title}</strong>
          <div>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

function NewPartnerModal({ onClose, onSubmit }) {
  const [f, setF] = useState({
    name: '', brokerage: '', state: '', city: '', phone: '', email: '',
    bday: '', spouse: '', kids: '', coffee: '', addr: '', social: '',
    tier: 'Standard', src: 'Past Closing',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    if (!f.name || !f.brokerage || !f.phone || !f.email) return;
    onSubmit(f);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Add Realtor Partner</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>On submit → saved to CRM + welcome touch sequence begins</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
            <div className="form-field"><label>Spouse / Partner Name</label><input value={f.spouse} onChange={set('spouse')} /></div>
            <div className="form-field"><label>Kids / Pet Names</label><input value={f.kids} onChange={set('kids')} /></div>
            <div className="form-field"><label>Favorite Coffee Shop</label><input value={f.coffee} onChange={set('coffee')} /></div>
            <div className="form-field full"><label>Mailing Address</label><input value={f.addr} onChange={set('addr')} /></div>
            <div className="form-field"><label>Social Media Handle</label><input value={f.social} onChange={set('social')} /></div>
            <div className="form-field"><label>Referral Tier</label>
              <select value={f.tier} onChange={set('tier')}>
                <option>Standard</option><option>VIP (5+ deals/yr)</option>
              </select>
            </div>
            <div className="form-field"><label>Lead Source</label>
              <select value={f.src} onChange={set('src')}>
                <option>Past Closing</option><option>Networking Event</option><option>Past Client Intro</option><option>Other LO</option><option>Cold Outreach</option>
              </select>
            </div>
          </form>
        </div>
        <div className="modal-actions">
          <button className="form-btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="form-btn primary" type="button" onClick={submit}>Add Partner &amp; Start Touch Sequence</button>
        </div>
      </div>
    </div>
  );
}
