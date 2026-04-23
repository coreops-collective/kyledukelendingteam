import { useEffect, useState } from 'react';
import { USERS, ROLE_LABELS, sbInsertUser, sbUpdateUser, sbDeleteUser } from '../data/users.js';
import { getCurrentUser, isAdmin } from '../lib/auth.js';
import EmailDeliverySettings from './EmailDeliverySettings.jsx';
import NotificationRules from './NotificationRules.jsx';

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
          <button className="drawer-close" onClick={onClose}>×</button>
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
          <button className="drawer-close" onClick={onClose}>×</button>
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
  const rerender = () => tick(n => n + 1);

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

      {add && <AddUserDrawer me={me} onClose={() => setAdd(false)} onSaved={rerender} toast={setToast} />}
      {edit && <EditUserDrawer me={me} user={edit} onClose={() => setEdit(null)} onSaved={rerender} toast={setToast} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
