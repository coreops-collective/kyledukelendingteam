import { useEffect, useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import {
  loadLeadSources, getAllLeadSources, createLeadSource, updateLeadSource, deleteLeadSource,
} from '../lib/leadSources.js';
import { subscribeLoans } from '../lib/loansStore.js';
import Tour from '../components/Tour.jsx';

const fmt$M = (n) => {
  if (!n) return '$0';
  return n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'K';
};

// Aggregate every LOAN and PAST_CLIENT record by lead_source label.
// LOANS use `leadSource` (canonical) or `src` (legacy). PAST_CLIENTS use
// `src`. Case-insensitive match so "Realtor Referral" and "realtor
// referral" bucket together.
function aggregateBySource() {
  const buckets = new Map(); // lower(label) -> { label, units, volume, active, past }
  const bump = (rawLabel, amount, kind) => {
    const key = (rawLabel || 'Unspecified').trim();
    const lower = key.toLowerCase();
    if (!buckets.has(lower)) {
      buckets.set(lower, { label: key, units: 0, volume: 0, active: 0, funded: 0, past: 0 });
    }
    const b = buckets.get(lower);
    b.units += 1;
    b.volume += Number(amount || 0);
    b[kind] += 1;
  };
  LOANS.forEach((l) => {
    if (l.archived || l.status === 'Adversed') return;
    const isFunded = l.stage === 'funded' || l.status === 'Funded';
    bump(l.leadSource || l.src, l.amount, isFunded ? 'funded' : 'active');
  });
  PAST_CLIENTS.forEach((c) => bump(c.src, c.amount, 'past'));
  return Array.from(buckets.values()).sort((a, b) => b.volume - a.volume);
}

const LEAD_SOURCES_TOUR_STEPS = [
  {
    title: 'Lead Sources',
    body: 'Where every deal came from — Realtor Referral, Past Client Referral, Sphere of Influence, Social Media, In-Person Networking, Paid Advertisement, or any custom source the team adds.\n\nVolume and units are aggregated live from every LOAN and PAST_CLIENT record with a source tag. Nothing manual — the numbers reflect the current book.',
  },
  {
    target: '[data-tour="lead-sources-list"]',
    title: 'Per-source stats',
    body: 'Each row shows total volume (funded + active pipeline + historical past clients) and unit count.\n\nSources are sorted by volume so the biggest producer sits at the top. That tells you where to double down.',
  },
  {
    target: '[data-tour="lead-sources-manage"]',
    title: 'Manage sources',
    body: 'The Manage list lets you add, rename, reorder, or deactivate lead sources.\n\nDeactivating a source hides it from the New Loan Intake dropdown but keeps historical loans tagged with it visible on this page. Deleting a source removes it entirely — historical loans keep the tag as free text so nothing is lost.',
  },
  {
    target: '[data-tour="lead-sources-add"]',
    title: 'Add a source',
    body: 'Add a new lead source and it appears immediately in the New Loan Intake dropdown for everyone on the team.\n\nDefaults ship with the six most common sources. Add "Podcast Sponsorship", "Referral from Attorney", whatever your team actually uses.',
  },
];

export default function LeadSources() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [tourOpen, setTourOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    loadLeadSources().then(bump);
    const on = () => bump();
    ['kdt-lead-sources-changed', 'kdt-lead-sources-loaded'].forEach((e) => window.addEventListener(e, on));
    const unsub = subscribeLoans(bump);
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => {
      ['kdt-lead-sources-changed', 'kdt-lead-sources-loaded'].forEach((e) => window.removeEventListener(e, on));
      window.removeEventListener('kdt-start-tour', startTour);
      unsub?.();
    };
  }, []);

  const stats = useMemo(() => aggregateBySource(), []); // stale on filter changes — bump-driven force is enough
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statsMemo = useMemo(() => aggregateBySource(), [force]);
  const sources = getAllLeadSources();

  const totalVolume = statsMemo.reduce((a, s) => a + s.volume, 0);
  const totalUnits = statsMemo.reduce((a, s) => a + s.units, 0);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const clean = newLabel.trim();
    if (!clean) return;
    await createLeadSource(clean);
    setNewLabel('');
  };

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi-label">Total Sources Tracked</div>
          <div className="kpi-value">{statsMemo.length}</div>
          <div className="kpi-sub">Across active + funded + historical</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Volume</div>
          <div className="kpi-value">{fmt$M(totalVolume)}</div>
          <div className="kpi-sub">{totalUnits} loans / clients</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Active Sources</div>
          <div className="kpi-value">{sources.filter((s) => s.active !== false).length}</div>
          <div className="kpi-sub">Available in New Loan dropdown</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Top Producer</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{statsMemo[0]?.label || '—'}</div>
          <div className="kpi-sub">{statsMemo[0] ? fmt$M(statsMemo[0].volume) : '—'}</div>
        </div>
      </div>

      <div className="section-card" data-tour="lead-sources-list" style={{ marginBottom: 18 }}>
        <div className="section-header">
          <div className="section-title">Lead Source Performance</div>
          <div className="section-sub">Volume + units aggregated live from LOANS and PAST_CLIENTS</div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {statsMemo.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 12 }}>
              No lead sources tagged on any loans yet. Tag Lead Source on the New Loan Intake form and stats appear here automatically.
            </div>
          ) : (
            <table className="loans-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Total Volume</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Active</th>
                  <th style={{ textAlign: 'right' }}>Funded</th>
                  <th style={{ textAlign: 'right' }}>Historical</th>
                </tr>
              </thead>
              <tbody>
                {statsMemo.map((s) => (
                  <tr key={s.label}>
                    <td><strong>{s.label}</strong></td>
                    <td style={{ textAlign: 'right' }}>{fmt$M(s.volume)}</td>
                    <td style={{ textAlign: 'right' }}>{s.units}</td>
                    <td style={{ textAlign: 'right' }}>{s.active}</td>
                    <td style={{ textAlign: 'right' }}>{s.funded}</td>
                    <td style={{ textAlign: 'right' }}>{s.past}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section-card" data-tour="lead-sources-manage">
        <div className="section-header">
          <div className="section-title">Manage Sources</div>
          <div className="section-sub">These are what shows in the New Loan Intake dropdown</div>
        </div>
        <div className="section-body">
          <form data-tour="lead-sources-add" onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Add a new source (e.g. Podcast Sponsorship)"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }}
            />
            <button
              type="submit"
              disabled={!newLabel.trim()}
              style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: newLabel.trim() ? 'pointer' : 'not-allowed', opacity: newLabel.trim() ? 1 : 0.5 }}
            >Add source</button>
          </form>
          {sources.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12 }}>No lead sources configured yet. Add one above.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {sources.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                  <input
                    type="text"
                    defaultValue={s.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.label) updateLeadSource(s.id, { label: v });
                    }}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, background: s.active === false ? '#f0f0f0' : '#fff' }}
                    aria-label="Source label"
                  />
                  <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={s.active !== false}
                      onChange={(e) => updateLeadSource(s.id, { active: e.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete "${s.label}"? Loans already tagged with this source keep the tag — deleting only removes it from the dropdown.`)) return;
                      deleteLeadSource(s.id);
                    }}
                    style={{ padding: '5px 10px', background: '#fff', color: '#c62828', border: '1px solid #c62828', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {tourOpen && <Tour steps={LEAD_SOURCES_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
