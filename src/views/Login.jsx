import { useState, useEffect } from 'react';
import { USERS } from '../data/users.js';
import { setCurrentUser } from '../lib/auth.js';

const REMEMBER_KEY = 'kdt.rememberEmail';
const REMEMBER_PASS_KEY = 'kdt.rememberPass';
// Light obfuscation only — this is browser-local convenience, not security.
const encodePass = (p) => btoa(unescape(encodeURIComponent(p)));
const decodePass = (p) => { try { return decodeURIComponent(escape(atob(p))); } catch { return ''; } };

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotSending, setForgotSending] = useState(false);

  // Prefill remembered email + password on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_KEY);
    const savedPass = localStorage.getItem(REMEMBER_PASS_KEY);
    if (savedEmail) { setEmail(savedEmail); setRemember(true); }
    if (savedPass) { setPass(decodePass(savedPass)); }
  }, []);

  function onSubmit(ev) {
    ev.preventDefault();
    const user = USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === pass
    );
    if (!user) { setErr('Invalid email or password'); return; }
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, email.trim());
      localStorage.setItem(REMEMBER_PASS_KEY, encodePass(pass));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(REMEMBER_PASS_KEY);
    }
    setCurrentUser(user);
    onSuccess?.(user);
  }

  async function submitForgot(ev) {
    ev.preventDefault();
    setForgotMsg('');
    const target = (email || '').trim();
    if (!target) { setForgotMsg('Enter your email first, then click Forgot password.'); return; }
    setForgotSending(true);
    try {
      const res = await fetch('/.netlify/functions/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setForgotMsg('Request sent — an admin will reset your password and follow up by email.');
      } else {
        setForgotMsg(json.reason || 'Could not send request. Contact an admin directly.');
      }
    } catch {
      setForgotMsg('Could not send request. Contact an admin directly.');
    } finally {
      setForgotSending(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <img
            src="/brand-crest.jpeg"
            alt="The Kyle Duke Team"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <div className="login-title">The Kyle Duke Team</div>
        <div className="login-sub">Powered by Valor Home Loans</div>
        <form onSubmit={onSubmit}>
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingRight: 58 }}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', fontSize: 11, color: '#666',
                  fontWeight: 600, cursor: 'pointer', padding: '4px 8px', letterSpacing: '.5px',
                }}
              >
                {showPass ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px', fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#444' }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => { setForgotOpen((o) => !o); setForgotMsg(''); }}
              style={{ background: 'transparent', border: 'none', color: '#C8102E', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}
            >
              Forgot password?
            </button>
          </div>

          <button type="submit" className="login-btn">Sign In</button>
          {err && <div className="login-error">{err}</div>}
        </form>

        {forgotOpen && (
          <div style={{ marginTop: 16, padding: 14, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Reset password</div>
            <div style={{ color: '#555', marginBottom: 10 }}>
              We'll email an admin to reset the password for <strong>{email || '(enter your email above)'}</strong>.
            </div>
            <button
              type="button"
              onClick={submitForgot}
              disabled={forgotSending || !email}
              className="login-btn"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              {forgotSending ? 'Sending…' : 'Send reset request'}
            </button>
            {forgotMsg && <div style={{ marginTop: 10, color: forgotMsg.startsWith('Request sent') ? '#1a6b4a' : '#c62828' }}>{forgotMsg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
