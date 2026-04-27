import { useState, useMemo, useEffect } from 'react';
import { PARTNERS } from '../data/partners.js';
import { LOANS } from '../data/loans.js';
import { ALL_STATES, STATE_NAMES } from '../data/states.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { markPartnerDirty, markPartnerNew, subscribePartners } from '../lib/partnersStore.js';

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
  // PARTNERS is a mutable module-level array. Bumping this counter forces the
  // memos below to recompute after we push a new partner so the list updates
  // immediately instead of waiting for a manual refresh.
  const [partnersVersion, setPartnersVersion] = useState(0);

  // Subscribe to live changes from other clients so adds/edits made by
  // teammates show up here within ~1s without a refresh.
  useEffect(() => {
    const unsubscribe = subscribePartners(() => setPartnersVersion((v) => v + 1));
    return unsubscribe;
  }, []);

  // Compute per-agent live pipeline counts from LOANS (active = not funded/cold).
  const livePipelineByAgent = useMemo(() => {
    const map = {};
    LOANS.forEach((l) => {
      if (l.archived) return;
      if (!l.agent || l.stage === 'funded' || l.stage === 'cold') return;
      if (!map[l.agent]) map[l.agent] = { count: 0, volume: 0 };
      map[l.agent].count += 1;
      map[l.agent].volume += l.amount || 0;
    });
    return map;
  }, []);

  // Decorate partners with live pipeline data (keeps PARTNERS source intact).
  const partnersWithLive = useMemo(
    () => PARTNERS.map((p) => {
      const lp = livePipelineByAgent[p.name];
      return lp ? { ...p, livePipeline: lp.count, livePipelineVolume: lp.volume } : p;
    }),
    [livePipelineByAgent, partnersVersion]
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
      if (filters.tier === 'VIP' && !p.vip) return false;
      if (filters.tier === 'Standard' && p.vip) return false;
      if ((p.deals || 0) < dealMin) return false;
      return true;
    });
  }, [filters, partnersWithLive]);

  const vipPartners = filtered.filter((p) => p.vip);
  const standardPartners = [...filtered.filter((p) => !p.vip)].sort((a, b) => (b.deals || 0) - (a.deals || 0));

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const [openedPartner, setOpenedPartner] = useState(null);
  const openPartner = (p) => setOpenedPartner(p);

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
                <div className="vol">{fmt$(p.totalVolume || p.lifetime || 0)}</div>
                <div className="num" style={{ color: '#888' }}>{p.ytdClosings || p.closed || 0}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {standardPartners.length === 0 && vipPartners.length === 0 && (
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
        <div className="toast" onClick={() => setToast(null)}>
          <strong>{toast.title}</strong>
          <div>{toast.msg}</div>
        </div>
      )}
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
          <button className="drawer-close" onClick={onClose}>×</button>
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
  const set = (key, value) => { p[key] = value; markPartnerDirty(p); force((n) => n + 1); };
  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, display: 'block' };

  const EditRow = ({ label, field, type = 'text' }) => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        defaultValue={p[field] || ''}
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
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
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
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                defaultValue={p.notes || ''}
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
        <div className="drawer-actions">
          <button className="drawer-btn primary" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
