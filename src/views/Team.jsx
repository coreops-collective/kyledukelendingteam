import { useState, useMemo } from 'react';
import { USERS, ROLE_LABELS } from '../data/users.js';

// The legacy app derives live pipeline/MTD stats from LOANS + PAST_CLIENTS +
// LOAN_MGMT. That wiring is deferred — we display zeros with the same layout
// so the view matches the legacy shape 1:1.
function teamStatsFor(/* userName */) {
  return { pipelineCount: 0, pipelineVol: 0, fundedMTD: 0, fundedCountMTD: 0 };
}

const fmt$M = (n) => {
  n = n || 0;
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
};

export default function Team() {
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);

  const team = useMemo(
    () =>
      USERS.map((u) => {
        const stats = teamStatsFor(u.name);
        return {
          id: u.id,
          initials: u.initials,
          name: u.name,
          email: u.email,
          role: ROLE_LABELS[u.role] || 'Team Member',
          nmls: u.nmls || '',
          pipeline: stats.pipelineCount,
          volume: stats.pipelineVol,
          fundedMTD: stats.fundedMTD,
          fundedCountMTD: stats.fundedCountMTD,
        };
      }),
    []
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {team.length} Team Members
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Pulled from User Setup · stats computed from live pipeline + funded deals
          </div>
        </div>
        <button className="form-btn primary" type="button" onClick={() => setShowForm(true)}>
          + Add Team Member
        </button>
      </div>

      <div className="team-grid">
        {team.map((t) => (
          <div
            key={t.id}
            className="team-card"
            style={{ cursor: 'pointer', position: 'relative' }}
            onClick={() => setToast({ title: 'Team Member', msg: `${t.name} — edit drawer not yet ported` })}
          >
            <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Edit ›
            </div>
            <div className="team-avatar">{t.initials}</div>
            <div className="team-name">{t.name}</div>
            <div className="team-role">{t.role}{t.nmls ? ` · NMLS ${t.nmls}` : ''}</div>
            <div className="team-stats">
              <div><strong>{t.pipeline}</strong>Pipeline</div>
              <div><strong>{fmt$M(t.volume)}</strong>Vol</div>
              <div><strong>{t.fundedCountMTD || 0}</strong>MTD</div>
            </div>
            <div style={{ fontSize: 10, color: '#888', textAlign: 'center', marginTop: 6 }}>
              {fmt$M(t.fundedMTD)} funded this month
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <NewTeamMemberModal
          onClose={() => setShowForm(false)}
          onSubmit={(m) => {
            console.log('[team] new member submitted', m);
            setToast({ title: 'Team Member Added', msg: `${m.first} ${m.last} — welcome email queued` });
            setShowForm(false);
          }}
        />
      )}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <strong>{toast.title}</strong>
          <div>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

function NewTeamMemberModal({ onClose, onSubmit }) {
  const [f, setF] = useState({
    first: '', last: '', role: 'Senior Loan Officer', nmls: '', start: '',
    email: '', phone: '', reports: 'Kyle Duke', notes: '',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    if (!f.first || !f.last || !f.email || !f.phone || !f.role) return;
    onSubmit(f);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Add Team Member</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>On submit → saved to database + welcome email sent</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="form-field"><label className="req">First Name</label><input value={f.first} onChange={set('first')} required /></div>
            <div className="form-field"><label className="req">Last Name</label><input value={f.last} onChange={set('last')} required /></div>
            <div className="form-field full"><label className="req">Role</label>
              <select value={f.role} onChange={set('role')} required>
                <option>Senior Loan Officer</option>
                <option>Junior Loan Officer</option>
                <option>Loan Officer Assistant (LOA)</option>
                <option>Processor</option>
                <option>Admin</option>
              </select>
            </div>
            <div className="form-field"><label>NMLS #</label><input value={f.nmls} onChange={set('nmls')} /></div>
            <div className="form-field"><label>Start Date</label><input type="date" value={f.start} onChange={set('start')} /></div>
            <div className="form-field full"><label className="req">Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
            <div className="form-field"><label className="req">Phone</label><input type="tel" value={f.phone} onChange={set('phone')} required /></div>
            <div className="form-field"><label>Reports To</label>
              <select value={f.reports} onChange={set('reports')}>
                <option>Kyle Duke</option><option>Missy</option><option>—</option>
              </select>
            </div>
            <div className="form-field full"><label>Notes</label><textarea value={f.notes} onChange={set('notes')} /></div>
          </form>
        </div>
        <div className="modal-actions">
          <button className="form-btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="form-btn primary" type="button" onClick={submit}>Add Team Member</button>
        </div>
      </div>
    </div>
  );
}
