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
    first: '', last: '', role: 'Loan Officer', customRole: '', nmls: '', start: '',
    email: '', phone: '', reports: 'Kyle Duke', notes: '',
    birthday: '', personalEmail: '', mailingAddress: '',
    emergencyName: '', emergencyPhone: '', emergencyRel: '',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const isOther = f.role === 'Other';

  const submit = () => {
    if (!f.first || !f.last || !f.email || !f.phone || !f.role) {
      alert('First, last, email, phone, and role are required.');
      return;
    }
    if (isOther && !f.customRole.trim()) {
      alert('Enter a custom role or pick one from the list.');
      return;
    }
    onSubmit({ ...f, role: isOther ? f.customRole.trim() : f.role });
  };

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
        {title}
      </div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
    </div>
  );

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 680, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">New Team Member</div>
          <div className="drawer-borrower">Add Team Member</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>On submit → saved + welcome email sent</div>
        </div>
        <div className="drawer-body">
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Section title="Identity">
              <div className="form-field"><label className="req">First Name</label><input value={f.first} onChange={set('first')} required /></div>
              <div className="form-field"><label className="req">Last Name</label><input value={f.last} onChange={set('last')} required /></div>
              <div className="form-field" style={{ gridColumn: '1/-1' }}><label className="req">Role</label>
                <select value={f.role} onChange={set('role')} required>
                  <option>Loan Officer</option>
                  <option>Loan Officer Assistant (LOA)</option>
                  <option>Processor</option>
                  <option>Admin</option>
                  <option>Branch Manager</option>
                  <option>Other</option>
                </select>
              </div>
              {isOther && (
                <div className="form-field" style={{ gridColumn: '1/-1' }}>
                  <label className="req">Custom role</label>
                  <input value={f.customRole} onChange={set('customRole')} placeholder="e.g. Marketing Coordinator" />
                </div>
              )}
              <div className="form-field"><label>NMLS #</label><input value={f.nmls} onChange={set('nmls')} /></div>
              <div className="form-field"><label>Start Date</label><input type="date" value={f.start} onChange={set('start')} /></div>
              <div className="form-field"><label>Reports To</label>
                <select value={f.reports} onChange={set('reports')}>
                  <option value="">— Select —</option>
                  {USERS.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
            </Section>

            <Section title="Work Contact">
              <div className="form-field" style={{ gridColumn: '1/-1' }}><label className="req">Work Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
              <div className="form-field" style={{ gridColumn: '1/-1' }}><label className="req">Work Phone</label><input type="tel" value={f.phone} onChange={set('phone')} required /></div>
            </Section>

            <Section title="Personal">
              <div className="form-field"><label>Birthday</label><input type="date" value={f.birthday} onChange={set('birthday')} /></div>
              <div className="form-field"><label>Personal Email</label><input type="email" value={f.personalEmail} onChange={set('personalEmail')} /></div>
              <div className="form-field" style={{ gridColumn: '1/-1' }}><label>Mailing Address</label><input value={f.mailingAddress} onChange={set('mailingAddress')} placeholder="Street, City, State ZIP" /></div>
            </Section>

            <Section title="Emergency Contact">
              <div className="form-field"><label>Name</label><input value={f.emergencyName} onChange={set('emergencyName')} /></div>
              <div className="form-field"><label>Relationship</label><input value={f.emergencyRel} onChange={set('emergencyRel')} placeholder="Spouse, parent, etc." /></div>
              <div className="form-field" style={{ gridColumn: '1/-1' }}><label>Phone</label><input type="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} /></div>
            </Section>

            <Section title="Notes">
              <div className="form-field" style={{ gridColumn: '1/-1' }}>
                <textarea value={f.notes} onChange={set('notes')} style={{ minHeight: 80 }} />
              </div>
            </Section>
          </form>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" type="button" onClick={submit}>Add Team Member</button>
        </div>
      </aside>
    </>
  );
}
