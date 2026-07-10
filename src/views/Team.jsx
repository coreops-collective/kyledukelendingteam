import { useState, useMemo, useEffect } from 'react';
import { USERS, ROLE_LABELS, sbUpdateUser, sbInsertUser } from '../data/users.js';
import { LOANS } from '../data/loans.js';
import { showError } from '../lib/toaster.js';

// Match a team member's name to a loan's LO or LOA field. The pipeline
// uses first-name-only values like "Kyle" / "Missy" / "Abel" / "Kim",
// while users.name is the full "Kyle Duke" / "Kimberly Chinquee". This
// matches in either direction: exact, prefix, or short form.
function matchesUser(userName, loanVal) {
  if (!userName || !loanVal) return false;
  const first = userName.trim().split(/\s+/)[0].toLowerCase();
  const full = userName.trim().toLowerCase();
  const v = String(loanVal).trim().toLowerCase();
  // Match on exact first-name (e.g. loan.lo="Kyle" -> user "Kyle Duke") or
  // exact full-name only. The old form allowed startsWith in either
  // direction, so a stray "K" in loan.lo double-counted for every user
  // whose first name started with K, and "Kyle" incorrectly matched
  // "Kyle B" if both users existed.
  return v === first || v === full;
}

// Compute pipeline + MTD funded for one team member directly from LOANS.
// "Pipeline" = anything assigned to them (lo OR loa) that isn't funded,
// adversed, or archived. "Funded MTD" = funded loans closed in the
// current calendar month.
function teamStatsFor(userName) {
  const now = new Date();
  const mtdMonth = now.getMonth();
  const mtdYear = now.getFullYear();
  let pipelineCount = 0;
  let pipelineVol = 0;
  let fundedMTD = 0;
  let fundedCountMTD = 0;
  LOANS.forEach((l) => {
    const mine = matchesUser(userName, l.lo) || matchesUser(userName, l.loa);
    if (!mine) return;
    const status = l.status || '';
    const stage = l.stage || '';
    const isFunded = status === 'Funded' || stage === 'funded';
    const isAdversed = status === 'Adversed';
    if (l.archived || isAdversed) return;
    if (!isFunded) {
      pipelineCount += 1;
      pipelineVol += Number(l.amount || 0);
      return;
    }
    // Funded — check if it closed this calendar month.
    const closed = parseLocalDate(l.fundedDate || l.closeDate || '');
    if (closed && closed.getMonth() === mtdMonth && closed.getFullYear() === mtdYear) {
      fundedCountMTD += 1;
      fundedMTD += Number(l.amount || 0);
    }
  });
  return { pipelineCount, pipelineVol, fundedMTD, fundedCountMTD };
}

// Parse a YYYY-MM-DD or M/D/YYYY string into a LOCAL Date (midnight).
// Using `new Date('2026-10-22')` interprets as UTC midnight, which then
// renders as Oct 21 in any US timezone — that's why birthdays were
// showing one day earlier than expected.
function parseLocalDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // ISO (YYYY-MM-DD) — what <input type="date"> emits.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // US format (M/D/YYYY).
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  // Fallback — let Date constructor try; may still shift by timezone.
  const d = new Date(s);
  return isNaN(d) ? null : d;
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
  const [editing, setEditing] = useState(null);
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  // Re-render when the users list finishes loading from Supabase.
  useEffect(() => {
    const onLoaded = () => bump();
    window.addEventListener('kdt-users-loaded', onLoaded);
    return () => window.removeEventListener('kdt-users-loaded', onLoaded);
  }, []);

  // Recomputed every render so date edits (which mutate USERS in place
  // and bump) show up immediately.
  const team = USERS.map((u) => {
    const stats = teamStatsFor(u.name);
    return {
      id: u.id,
      initials: u.initials,
      name: u.name,
      email: u.email,
      role: ROLE_LABELS[u.role] || 'Team Member',
      nmls: u.nmls || '',
      birthday: u.birthday || '',
      spouse_name: u.spouse_name || '',
      spouse_birthday: u.spouse_birthday || '',
      marriage_anniversary: u.marriage_anniversary || '',
      work_anniversary: u.work_anniversary || '',
      pipeline: stats.pipelineCount,
      volume: stats.pipelineVol,
      fundedMTD: stats.fundedMTD,
      fundedCountMTD: stats.fundedCountMTD,
    };
  });

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
            onClick={() => setEditing(t)}
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

      <ImportantDatesSection team={team} onEditMember={setEditing} />

      {editing && (
        <TeamDatesDrawer
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setToast({ title: 'Saved', msg });
            bump();
          }}
        />
      )}

      {showForm && (
        <NewTeamMemberModal
          onClose={() => setShowForm(false)}
          onSubmit={async (m) => {
            // Map the modal's UI role labels back to the users-table
            // canonical role slugs. Anything not in the map defaults to
            // loan_officer (the least-privileged role) so a typo can
            // never accidentally promote someone to Branch Manager.
            const ROLE_MAP = {
              'Loan Officer': 'loan_officer',
              'Loan Officer Assistant (LOA)': 'loan_officer',
              'Processor': 'loan_officer',
              'Admin': 'admin',
              'Branch Manager': 'branch_manager',
            };
            const initials = ((m.first[0] || '') + (m.last[0] || '')).toUpperCase();
            const emailLocal = (m.email || '').split('@')[0].toLowerCase();
            const draft = {
              name: `${m.first} ${m.last}`.trim(),
              email: m.email,
              // Placeholder password (matches the seed convention). Admin
              // can rotate via Setup — this only lets the row persist
              // without violating the NOT NULL constraint on password.
              password: emailLocal || m.first.toLowerCase(),
              role: ROLE_MAP[m.role] || 'loan_officer',
              initials,
              nmls: m.nmls || '',
              phone: m.phone || '',
            };
            const saved = await sbInsertUser(draft);
            if (!saved) {
              showError(`Couldn't add ${draft.name}. Nothing was saved.`);
              return;
            }
            USERS.push({
              id: saved.id,
              name: saved.name,
              email: saved.email,
              password: saved.password,
              role: saved.role,
              initials: saved.initials || initials,
              nmls: saved.nmls || '',
              phone: saved.phone || '',
              birthday: m.birthday || '',
            });
            bump();
            setToast({ title: 'Team Member Added', msg: `${draft.name} saved. Set their password from Setup.` });
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
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
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

// Annualize a date so "next occurrence relative to today" can be computed
// regardless of what year the original date was recorded. Returns the
// upcoming Date object for the same month/day. If the date is invalid,
// returns null.
function nextOccurrence(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function fmtDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonthDay(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ImportantDatesSection({ team, onEditMember }) {
  // Build a flat list of every recorded date across the team, sorted by
  // how soon the next occurrence is. Filters out blank dates.
  const all = [];
  team.forEach((t) => {
    const fields = [
      { key: 'birthday', label: 'Birthday', value: t.birthday, who: t.name },
      { key: 'spouse_birthday', label: `${t.spouse_name || 'Spouse'}'s Birthday`, value: t.spouse_birthday, who: t.name },
      { key: 'marriage_anniversary', label: 'Marriage Anniversary', value: t.marriage_anniversary, who: t.name },
      { key: 'work_anniversary', label: 'Work Anniversary', value: t.work_anniversary, who: t.name },
    ];
    fields.forEach((f) => {
      if (!f.value) return;
      const next = nextOccurrence(f.value);
      all.push({
        member: t,
        label: f.label,
        original: f.value,
        next,
        daysAway: daysUntil(next),
      });
    });
  });
  all.sort((a, b) => (a.daysAway ?? 9999) - (b.daysAway ?? 9999));

  const upcoming = all.filter((d) => d.daysAway !== null && d.daysAway <= 60);
  const later = all.filter((d) => d.daysAway === null || d.daysAway > 60);

  return (
    <div className="section-card" style={{ marginTop: 18 }}>
      <div className="section-header">
        <div className="section-title">Important Dates</div>
        <div className="section-sub">Birthdays, spouse birthdays, marriage and work anniversaries · click a team member's card above to edit</div>
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {all.length === 0 ? (
          <div style={{ padding: '14px 18px', color: '#888', fontSize: 12 }}>
            No dates recorded yet. Click any team card to add birthdays, spouse birthday, marriage anniversary, and work anniversary.
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div style={{ padding: '10px 18px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#7a3030' }}>
                Next 60 days
              </div>
            )}
            <DatesList rows={upcoming} onEditMember={onEditMember} highlight />
            {later.length > 0 && (
              <div style={{ padding: '14px 18px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#888', borderTop: '1px solid #eee', marginTop: 6 }}>
                Later this year
              </div>
            )}
            <DatesList rows={later} onEditMember={onEditMember} />
          </>
        )}
      </div>
    </div>
  );
}

function DatesList({ rows, onEditMember, highlight }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={`${r.member.id}-${r.label}-${i}`}
          onClick={() => onEditMember(r.member)}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 90px',
            gap: 10,
            padding: '10px 18px',
            borderTop: '1px solid #f1f1f1',
            alignItems: 'center',
            cursor: 'pointer',
            background: highlight ? '#fff8e1' : '#fff',
          }}
        >
          <div style={{ fontWeight: 600 }}>{r.member.name}</div>
          <div style={{ color: '#555' }}>{r.label}</div>
          <div style={{ color: '#222' }}>{fmtMonthDay(r.original)}{r.label === 'Birthday' || r.label === 'Marriage Anniversary' || r.label === 'Work Anniversary' ? '' : ''}</div>
          <div style={{ textAlign: 'right', fontSize: 11, color: r.daysAway !== null && r.daysAway <= 7 ? '#c62828' : '#888', fontWeight: r.daysAway !== null && r.daysAway <= 7 ? 700 : 400 }}>
            {r.daysAway === null ? '' : r.daysAway === 0 ? 'TODAY' : `${r.daysAway}d away`}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamDatesDrawer({ user, onClose, onSaved }) {
  const target = USERS.find((u) => u.id === user.id) || user;
  const [f, setF] = useState({
    birthday: target.birthday || '',
    spouse_name: target.spouse_name || '',
    spouse_birthday: target.spouse_birthday || '',
    marriage_anniversary: target.marriage_anniversary || '',
    work_anniversary: target.work_anniversary || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    Object.assign(target, f); // mutate in-memory USERS entry so UI reflects immediately
    await sbUpdateUser(target.id, f);
    setSaving(false);
    onSaved && onSaved(`${target.name} updated`);
    onClose();
  };

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, display: 'block' };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">Team Member · Important Dates</div>
          <div className="drawer-borrower">{target.name}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{target.email}</div>
        </div>
        <div className="drawer-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Birthday</label><input type="date" value={f.birthday} onChange={set('birthday')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Work Anniversary (hire date)</label><input type="date" value={f.work_anniversary} onChange={set('work_anniversary')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Spouse / Partner Name</label><input value={f.spouse_name} onChange={set('spouse_name')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Spouse / Partner Birthday</label><input type="date" value={f.spouse_birthday} onChange={set('spouse_birthday')} style={inputStyle} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>Marriage Anniversary</label><input type="date" value={f.marriage_anniversary} onChange={set('marriage_anniversary')} style={inputStyle} /></div>
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </aside>
    </>
  );
}
