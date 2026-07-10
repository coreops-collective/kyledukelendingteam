import { useEffect, useState } from 'react';
import { USERS, ROLE_LABELS, sbInsertUser, sbUpdateUser, sbDeleteUser } from '../data/users.js';
import { getCurrentUser, isAdmin } from '../lib/auth.js';
import EmailDeliverySettings from './EmailDeliverySettings.jsx';
import NotificationRules from './NotificationRules.jsx';
import {
  WEBHOOK_EVENTS, getWebhookSubscriptions, loadWebhookSubscriptions,
  createWebhookSubscription, updateWebhookSubscription, deleteWebhookSubscription,
} from '../lib/webhooks.js';
import Tour from '../components/Tour.jsx';

function roleOptions(me, currentRole) {
  if (me?.role === 'branch_manager') {
    return (
      <>
        <option value="branch_manager">Branch Manager</option>
        <option value="admin">Admin</option>
        <option value="loan_officer">Loan Officer</option>
      </>
    );
  }
  return (
    <>
      <option value="admin">Admin</option>
      <option value="loan_officer">Loan Officer</option>
    </>
  );
}

function rolePillStyle(role) {
  if (role === 'branch_manager') return { background: '#fff1f3', color: '#c8102e' };
  if (role === 'admin') return { background: '#e3f2fd', color: '#1976d2' };
  return { background: '#f4f4f6', color: '#555' };
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="toast" onClick={onClose}>
      <div className="toast-title">{toast.title}</div>
      <div>{toast.msg}</div>
    </div>
  );
}

function AddUserDrawer({ me, onClose, onSaved, toast }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState('loan_officer');

  async function save() {
    if (!name.trim() || !email.trim() || !pass) { toast({ title: 'Error', msg: 'Fill in all required fields' }); return; }
    if (USERS.find(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      toast({ title: 'Error', msg: 'Email already exists' });
      return;
    }
    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const localUser = { id: 'u' + Date.now(), name: name.trim(), email: email.trim(), password: pass, role, initials, nmls: '' };
    USERS.push(localUser);
    onSaved();
    onClose();
    toast({ title: 'User Created', msg: `${localUser.name} added — visible on Team Members` });
    const dbRow = await sbInsertUser(localUser);
    if (dbRow) {
      const i = USERS.findIndex(u => u.id === localUser.id);
      if (i >= 0) USERS[i] = {
        id: dbRow.id, name: dbRow.name, email: dbRow.email, password: dbRow.password,
        role: dbRow.role, initials: dbRow.initials, nmls: dbRow.nmls || '', phone: dbRow.phone || '',
      };
      onSaved();
    }
  }

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">New User</div>
          <div className="drawer-borrower">Add User</div>
        </div>
        <div className="drawer-body">
          <form className="form-grid" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-field">
              <label className="req">Password</label>
              <input type="text" value={pass} onChange={(e) => setPass(e.target.value)} required />
            </div>
            <div className="form-field">
              <label className="req">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>{roleOptions(me)}</select>
            </div>
          </form>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" onClick={save}>Create User</button>
        </div>
      </aside>
    </>
  );
}

function EditUserDrawer({ me, user, onClose, onSaved, toast }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [pass, setPass] = useState('');
  const [role, setRole] = useState(user.role);

  const iAmBM = me?.role === 'branch_manager';
  const targetIsBM = user.role === 'branch_manager';
  // Can't change a BM's password unless I'm a BM too (self-edit allowed).
  const canChangePassword = iAmBM || (me?.id === user.id) || !targetIsBM;

  function save() {
    const u = USERS.find(x => x.id === user.id);
    if (!u) return;
    u.name = name.trim();
    u.email = email.trim();
    if (pass) {
      if (!canChangePassword) {
        toast({ title: 'Not allowed', msg: "Only a Branch Manager can change a Branch Manager's password" });
        return;
      }
      u.password = pass;
    }
    u.role = role;
    u.initials = u.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    onSaved();
    onClose();
    toast({ title: 'User Saved', msg: `${u.name} updated` });
    sbUpdateUser(u.id, { name: u.name, email: u.email, password: u.password, role: u.role, initials: u.initials, nmls: u.nmls || '' });
  }

  function del() {
    if (!iAmBM) { toast({ title: 'Not allowed', msg: 'Only a Branch Manager can delete users' }); return; }
    if (me.id === user.id) { toast({ title: 'Error', msg: 'You cannot delete yourself' }); return; }
    const idx = USERS.findIndex(x => x.id === user.id);
    if (idx < 0) return;
    const name = USERS[idx].name;
    USERS.splice(idx, 1);
    onSaved();
    onClose();
    toast({ title: 'User Removed', msg: `${name} deleted` });
    sbDeleteUser(user.id);
  }

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">Edit User</div>
          <div className="drawer-borrower">{user.name}</div>
        </div>
        <div className="drawer-body">
          <form className="form-grid" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field full" style={{ gridColumn: '1/-1' }}>
              <label className="req">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>New Password</label>
              <input
                type="text"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={canChangePassword ? '(unchanged)' : 'Branch Manager only'}
                disabled={!canChangePassword}
                style={!canChangePassword ? { background: '#f4f4f6', color: '#999', cursor: 'not-allowed' } : undefined}
              />
              {!canChangePassword && (
                <div style={{ fontSize: 10, color: '#c62828', marginTop: 4 }}>
                  Only a Branch Manager can change a Branch Manager's password.
                </div>
              )}
            </div>
            <div className="form-field">
              <label className="req">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>{roleOptions(me, role)}</select>
            </div>
          </form>
        </div>
        <div className="drawer-actions">
          {iAmBM && me.id !== user.id && (
            <button className="drawer-btn" onClick={del} style={{ color: '#c62828' }}>Delete</button>
          )}
          <button className="drawer-btn" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" onClick={save}>Save</button>
        </div>
      </aside>
    </>
  );
}

export default function Setup() {
  // Defense in depth — even if router guard is bypassed, only admins
  // and branch managers can see this page.
  if (!isAdmin()) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Restricted — Admin only.</div>;
  }
  return <SetupInner />;
}

function SetupInner() {
  const me = getCurrentUser();
  const [, tick] = useState(0);
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState(null);
  const [toast, setToast] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const rerender = () => tick(n => n + 1);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const SETUP_TOUR_STEPS = [
    {
      title: 'User Setup',
      body: 'This is the admin-only page for managing team logins. Only Branch Manager and Admin users can see it — it\'s hidden from the sidebar for everyone else.\n\nAny user you add here can log in immediately with the credentials you set.',
    },
    {
      title: 'Roles hierarchy',
      body: 'Three built-in roles:\n\n• Branch Manager — full access, sees Income & Comp, can create any role\n• Admin — this page, can create Admin or Loan Officer\n• Loan Officer — everything except restricted views\n\nA Branch Manager can promote or demote anyone; an Admin can only add other Admins or LOs.',
    },
    {
      target: '.section-card',
      title: 'Users list',
      body: 'Every current user — name, email, role, and password (visible only to Branch Manager).\n\nClick the pencil to edit a user, X to remove them. Removing a user does NOT delete anything they created (loans, tasks, notes stay put) — it just prevents future logins.',
    },
    {
      title: 'Notification Rules + Webhooks',
      body: 'Below the user list, two admin panels:\n\n• Notification Rules — email routing when loan events happen (new contract, funded, etc.)\n• GHL Webhook Subscriptions — outbound webhooks that fire when loan status changes, so your CRM stays in sync\n\nBoth can be added, edited, and toggled here.',
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            {USERS.length} Users
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Branch Manager can create any role. Admin can create Admin or Loan Officer.
          </div>
        </div>
        <button className="form-btn primary" onClick={() => setAdd(true)}>+ Add User</button>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Users &amp; Roles</div>
          <div className="section-sub">Branch Manager, Admin, Loan Officer</div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          <table className="loans-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Password</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {USERS.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 12 }}>
                        {u.initials}
                      </div>
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td><span className="status-pill" style={rolePillStyle(u.role)}>{ROLE_LABELS[u.role]}</span></td>
                  <td style={{ fontFamily: 'Menlo,monospace', fontSize: 11, color: '#888' }}>
                    {me?.role === 'branch_manager' ? u.password : '••••••••'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="form-btn secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => setEdit(u)}>
                      {me && me.id === u.id ? 'Edit (you)' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {me?.role === 'branch_manager' && <EmailDeliverySettings />}
      <NotificationRules />
      <WebhookSettings />

      {add && <AddUserDrawer me={me} onClose={() => setAdd(false)} onSaved={rerender} toast={setToast} />}
      {edit && <EditUserDrawer me={me} user={edit} onClose={() => setEdit(null)} onSaved={rerender} toast={setToast} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
      {tourOpen && <Tour steps={SETUP_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </>
  );
}

// ─── Webhook settings (branch manager + admin only) ──────────────
// Configures HTTP POST subscriptions so events in the hub (loan
// status change, new intake, new partner) push out to Go High Level
// or any other webhook receiver. Includes a step-by-step walkthrough
// so a first-time setup can be self-service.
function WebhookSettings() {
  const [, force] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [draft, setDraft] = useState({ event: 'loan.status_changed', url: '', filter_status: '', label: '' });

  useEffect(() => {
    loadWebhookSubscriptions().then(() => force((n) => n + 1));
    const on = () => force((n) => n + 1);
    window.addEventListener('kdt-webhooks-loaded', on);
    window.addEventListener('kdt-webhooks-changed', on);
    return () => {
      window.removeEventListener('kdt-webhooks-loaded', on);
      window.removeEventListener('kdt-webhooks-changed', on);
    };
  }, []);

  const subs = getWebhookSubscriptions();

  const submit = async () => {
    if (!draft.url.trim()) return alert('Webhook URL is required.');
    await createWebhookSubscription({
      event: draft.event,
      url: draft.url.trim(),
      filter_status: draft.filter_status || null,
      label: draft.label || null,
    });
    setDraft({ event: draft.event, url: '', filter_status: '', label: '' });
  };

  const eventLabel = (v) => (WEBHOOK_EVENTS.find((e) => e.value === v) || {}).label || v;

  const STATUS_OPTIONS = ['', 'New Lead', 'Applied', 'HOT PA', 'REFI Watch', 'New Contract', 'Disclosed', 'Processing', 'Underwriting', 'CTC Required', 'CTC', 'Approved', 'Funded'];

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, display: 'block' };

  return (
    <div className="section-card" style={{ marginTop: 18 }}>
      <div
        className="section-header"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <div className="section-title">Webhooks (Go High Level integration)</div>
          <div className="section-sub">
            {subs.length} active · push status changes and new leads to GHL so campaigns auto-fire
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="form-btn"
            onClick={(e) => { e.stopPropagation(); setShowGuide((g) => !g); setExpanded(true); }}
          >{showGuide ? 'Hide setup guide' : 'How to set this up'}</button>
          <span style={{ color: '#888', fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div className="section-body" style={{ padding: '18px 22px' }}>
          {showGuide && <WebhookSetupGuide />}

          <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 14, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10 }}>
              Add a new webhook
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Fire when</label>
                <select value={draft.event} onChange={(e) => setDraft((d) => ({ ...d, event: e.target.value }))} style={inputStyle}>
                  {WEBHOOK_EVENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Only if new status is (optional)</label>
                <select value={draft.filter_status} onChange={(e) => setDraft((d) => ({ ...d, filter_status: e.target.value }))} style={inputStyle}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || '— any —'}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>GHL webhook URL</label>
                <input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} placeholder="https://services.leadconnectorhq.com/hooks/…" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Label (for your own reference)</label>
                <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. Start 10-day-of-pain campaign" style={inputStyle} />
              </div>
            </div>
            <button className="form-btn primary" onClick={submit}>+ Save webhook</button>
          </div>

          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 10 }}>
            Active webhooks ({subs.length})
          </div>
          {subs.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12, fontStyle: 'italic', padding: 12 }}>
              No webhooks configured yet. Add one above.
            </div>
          ) : (
            subs.map((s) => (
              <div key={s.id} style={{ padding: 10, border: '1px solid #eee', borderRadius: 6, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 100px 30px', gap: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label || '(no label)'}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    {eventLabel(s.event)}
                    {s.filter_status ? ` · only when status = ${s.filter_status}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2, fontFamily: 'Menlo, monospace', wordBreak: 'break-all' }}>{s.url}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={s.active !== false}
                    onChange={(e) => updateWebhookSubscription(s.id, { active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete webhook "${s.label || 'unnamed'}"?`)) return;
                    await deleteWebhookSubscription(s.id);
                  }}
                  title="Delete"
                  style={{ background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 14 }}
                >×</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WebhookSetupGuide() {
  const step = { marginBottom: 14, padding: 12, background: '#f5f9ff', border: '1px solid #cfe4f5', borderRadius: 8 };
  const stepNum = { display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: '#0d47a1', color: '#fff', textAlign: 'center', lineHeight: '22px', fontWeight: 700, fontSize: 11, marginRight: 8 };
  const code = { display: 'block', margin: '6px 0', padding: '8px 12px', background: '#0A0A0A', color: '#fff', borderRadius: 4, fontFamily: 'Menlo,monospace', fontSize: 11, wordBreak: 'break-all' };
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Setting up a Go High Level webhook</div>
      <div style={step}>
        <div style={{ fontSize: 12, fontWeight: 700 }}><span style={stepNum}>1</span>Create the trigger in GHL</div>
        <div style={{ fontSize: 12, color: '#333', marginTop: 6, marginLeft: 30 }}>
          In GHL: <em>Automation → Workflows → + New Workflow → Start from scratch → Add Trigger → Inbound Webhook</em>.
          GHL will show a webhook URL — copy it. Looks like <code>https://services.leadconnectorhq.com/hooks/…</code>
        </div>
      </div>
      <div style={step}>
        <div style={{ fontSize: 12, fontWeight: 700 }}><span style={stepNum}>2</span>Paste the URL below</div>
        <div style={{ fontSize: 12, color: '#333', marginTop: 6, marginLeft: 30 }}>
          Fill in "Add a new webhook" with:<br />
          — <strong>Fire when:</strong> the event you want to push (usually "Loan status changes").<br />
          — <strong>Only if new status is:</strong> narrows to one status (e.g., "New Lead" so GHL only starts the 10-day-of-pain when a NEW lead lands).<br />
          — <strong>GHL webhook URL:</strong> the URL you copied.<br />
          — <strong>Label:</strong> what this webhook does — helps you find it later.
        </div>
      </div>
      <div style={step}>
        <div style={{ fontSize: 12, fontWeight: 700 }}><span style={stepNum}>3</span>What GHL receives</div>
        <div style={{ fontSize: 12, color: '#333', marginTop: 6, marginLeft: 30 }}>
          Every time your event fires, the hub POSTs this JSON to that URL:
          <span style={code}>{`{
  "event": "loan.status_changed",
  "fired_at": "2026-06-12T14:03:00Z",
  "subscription_label": "Start 10-day-of-pain",
  "data": {
    "borrower": "Smith, Jane",
    "phone": "555-1234", "email": "jane@example.com",
    "old_status": "", "new_status": "New Lead",
    "agent": "Olivia Evans", "lo": "Kyle",
    "property": "TBD", "amount": 300000,
    "close_date": ""
  }
}`}</span>
          In GHL's Inbound Webhook trigger, map <code>data.email</code> to Contact Email, <code>data.borrower</code> to Contact Name, and any other fields you want to use inside your workflow.
        </div>
      </div>
      <div style={step}>
        <div style={{ fontSize: 12, fontWeight: 700 }}><span style={stepNum}>4</span>Add campaign actions in GHL</div>
        <div style={{ fontSize: 12, color: '#333', marginTop: 6, marginLeft: 30 }}>
          Now that the trigger receives the contact, add the actions in GHL — start an email campaign, add a tag, send an SMS, whatever the play calls for. The hub's job ends at "webhook fired"; GHL owns the campaign from there.
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic', padding: '8px 4px' }}>
        Testing tip: toggle any loan's status in Loan Management to fire the webhook. GHL's "Test Trigger" tab will show the payload arriving live.
      </div>
    </div>
  );
}
