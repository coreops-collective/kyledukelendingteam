import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { USERS, ROLE_LABELS } from '../data/users.js';
import { STAGES, REFI_WATCH_STAGE } from '../data/stages.js';

const EVENT_TYPES = [
  { value: 'loan.created',       label: 'New Loan Submitted' },
  { value: 'loan.stage_changed', label: 'Loan Stage Changed' },
];

const DEFAULT_TEMPLATES = {
  'loan.created': {
    subject: 'New loan intake: {{borrower_first}} {{borrower_last}}',
    body: 'A new loan was submitted.\n\nBorrower: {{borrower_first}} {{borrower_last}}\nPhone: {{phone}}\nEmail: {{email}}\nLoan Officer: {{loan_officer}}\nType: {{loan_type}}\nPurpose: {{purpose}}\nStage: {{stage}}\n\nLog in to see the full record.',
  },
  'loan.stage_changed': {
    subject: 'Loan stage changed: {{borrower}} → {{new_stage}}',
    body: 'Borrower: {{borrower}}\nFrom: {{old_stage}}\nTo: {{new_stage}}\nLoan Officer: {{lo}}',
  },
};

export default function NotificationRules() {
  const [rules, setRules] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [add, setAdd] = useState(false);

  async function refresh() {
    const { data } = await supabase.from('notification_rules').select('*').order('created_at', { ascending: false });
    setRules(data || []);
    setLoaded(true);
  }

  useEffect(() => { refresh(); }, []);

  async function toggle(id, enabled) {
    await supabase.from('notification_rules').update({ enabled: !enabled }).eq('id', id);
    refresh();
  }

  async function remove(id) {
    await supabase.from('notification_rules').delete().eq('id', id);
    refresh();
  }

  function recipientLabel(r) {
    if (r.role) return `All ${ROLE_LABELS[r.role] || r.role}s`;
    if (r.user_id) {
      const u = USERS.find(x => x.id === r.user_id);
      return u ? `${u.name} <${u.email}>` : `User ${r.user_id.slice(0, 8)}…`;
    }
    if (r.extra_email) return r.extra_email;
    return '—';
  }

  function eventLabel(v) { return EVENT_TYPES.find(e => e.value === v)?.label || v; }

  if (!loaded) return null;

  return (
    <div className="section-card" style={{ marginTop: 18 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="section-title">Notification Rules</div>
          <div className="section-sub">When an event fires, email these recipients. Uses the Gmail creds above.</div>
        </div>
        <button className="form-btn primary" onClick={() => setAdd(true)} style={{ marginRight: 16, marginTop: 12 }}>+ Add Rule</button>
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {rules.length === 0 ? (
          <div style={{ padding: 18, color: '#888', fontSize: 13 }}>
            No rules yet. Add one to start emailing notifications.
          </div>
        ) : (
          <table className="loans-table">
            <thead>
              <tr>
                <th>Event</th><th>Recipient</th><th>Subject template</th>
                <th>Enabled</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td><strong>{eventLabel(r.event_type)}</strong></td>
                  <td>{recipientLabel(r)}</td>
                  <td style={{ fontSize: 12, color: '#555' }}>{r.subject_template || <em style={{ color: '#999' }}>(default)</em>}</td>
                  <td>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id, r.enabled)} />
                      <span style={{ fontSize: 12, color: r.enabled ? '#1a6b4a' : '#888' }}>{r.enabled ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="form-btn secondary" onClick={() => remove(r.id)} style={{ padding: '4px 10px', fontSize: 10, color: '#c62828' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {add && <AddRuleDrawer onClose={() => setAdd(false)} onSaved={refresh} />}
    </div>
  );
}

function AddRuleDrawer({ onClose, onSaved }) {
  const [event_type, setEventType] = useState(EVENT_TYPES[0].value);
  const [mode, setMode] = useState('role'); // role | user | email
  const [role, setRole] = useState('loan_officer');
  const [user_id, setUserId] = useState(USERS[0]?.id || '');
  const [extra_email, setExtraEmail] = useState('');
  const [subject_template, setSubject] = useState(DEFAULT_TEMPLATES[EVENT_TYPES[0].value].subject);
  const [body_template, setBody] = useState(DEFAULT_TEMPLATES[EVENT_TYPES[0].value].body);
  const [stage_filter, setStageFilter] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const allStages = [...STAGES, REFI_WATCH_STAGE];
  const toggleStage = (key) => setStageFilter((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);

  function changeEvent(v) {
    setEventType(v);
    const d = DEFAULT_TEMPLATES[v] || { subject: '', body: '' };
    setSubject(d.subject); setBody(d.body);
  }

  async function save() {
    setErr(null);
    const row = {
      event_type,
      role: mode === 'role' ? role : null,
      user_id: mode === 'user' ? user_id : null,
      extra_email: mode === 'email' ? (extra_email || '').trim() : null,
      subject_template, body_template,
      stage_filter,
      enabled: true,
    };
    if (mode === 'email' && !row.extra_email) { setErr('Enter an email address'); return; }
    setSaving(true);
    const { error } = await supabase.from('notification_rules').insert(row);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(); onClose();
  }

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Notification Rule</div>
          <div className="drawer-borrower">Add Rule</div>
        </div>
        <div className="drawer-body">
          <form className="form-grid" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Event</label>
              <select value={event_type} onChange={(e) => changeEvent(e.target.value)}>
                {EVENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>

            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Recipient</label>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                {[
                  { k: 'role', label: 'All of a role' },
                  { k: 'user', label: 'Specific user' },
                  { k: 'email', label: 'External email' },
                ].map(opt => (
                  <label key={opt.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input type="radio" checked={mode === opt.k} onChange={() => setMode(opt.k)} />{opt.label}
                  </label>
                ))}
              </div>
              {mode === 'role' && (
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="admin">Admin</option>
                  <option value="loan_officer">Loan Officer</option>
                </select>
              )}
              {mode === 'user' && (
                <select value={user_id} onChange={(e) => setUserId(e.target.value)}>
                  {USERS.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                </select>
              )}
              {mode === 'email' && (
                <input type="email" value={extra_email} onChange={(e) => setExtraEmail(e.target.value)} placeholder="someone@example.com" />
              )}
            </div>

            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label>Only for these stages <span style={{ color: '#999', fontWeight: 400, fontSize: 11 }}>(leave all unchecked to fire on every stage)</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: 10, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 6 }}>
                {allStages.map((s) => (
                  <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={stage_filter.includes(s.key)}
                      onChange={() => toggleStage(s.key)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label>Subject</label>
              <input value={subject_template} onChange={(e) => setSubject(e.target.value)} placeholder="Use {{fieldName}} placeholders" />
            </div>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label>Body</label>
              <textarea value={body_template} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 150 }} />
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                Placeholders like <code>{'{{borrower_first}}'}</code> get filled from the event payload.
              </div>
            </div>
          </form>
          {err && <div style={{ marginTop: 12, color: '#c62828', fontSize: 12 }}>{err}</div>}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Create Rule'}</button>
        </div>
      </aside>
    </>
  );
}
