import { useState, useEffect } from 'react';
import { setCurrentUser, loadProfileByEmail } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { audit, ACTIONS } from '../lib/audit.js';

const REMEMBER_KEY = 'kdt.rememberEmail';
// Legacy key from when remember-me stored a base64-encoded password in
// localStorage. Cleared on mount so the plaintext-in-localStorage
// artifact doesn't linger after this update ships.
const LEGACY_REMEMBER_PASS_KEY = 'kdt.rememberPass';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotSending, setForgotSending] = useState(false);

  // Prefill remembered email on mount. Password prefill was removed —
  // storing plaintext (even base64) in localStorage is not compatible
  // with the bcrypt-hashed users table introduced in migration 028.
  // Also clear any leftover legacy password value so upgraded browsers
  // don't keep an old plaintext artifact around.
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_KEY);
    if (savedEmail) { setEmail(savedEmail); setRemember(true); }
    if (localStorage.getItem(LEGACY_REMEMBER_PASS_KEY)) {
      localStorage.removeItem(LEGACY_REMEMBER_PASS_KEY);
    }
  }, []);

  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(ev) {
    ev.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      // Sign in against Supabase Auth. The client is configured with
      // persistSession + autoRefreshToken (src/lib/supabase.js), so every
      // subsequent PostgREST / Storage / Realtime request runs under the
      // returned JWT — not the anon key. Row-level security policies see
      // auth.uid() = the signed-in user.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (authError || !authData?.user) {
        // Record failed attempt against the submitted email (audit
        // signal — repeated failed logins on the same account is a
        // brute-force hint). Password is intentionally NOT logged.
        audit(ACTIONS.AUTH_LOGIN_FAILED, 'user', null, { attempted_email: email.trim() }, {
          actorId: null, actorEmail: email.trim(),
        });
        // Supabase returns a generic "Invalid login credentials" on
        // both bad email and bad password — surface it verbatim so it's
        // predictable, but include the raw message for diagnostics.
        setErr(authError?.message || 'Invalid email or password');
        return;
      }

      // The Supabase Auth user gives us an email + auth.uid; we still
      // need the public.users profile row for name / role / the numeric
      // id the rest of the app uses in audit + views. If the profile
      // row exists (matched by email), merge; otherwise fall back to
      // a minimal profile with role=null so the hub still renders but
      // role-gated views (Income / Setup / Net Income) stay locked.
      const profile = await loadProfileByEmail(authData.user.email || email.trim());
      const mergedUser = profile
        ? { ...profile, email: profile.email || authData.user.email }
        : { id: authData.user.id, name: authData.user.email, email: authData.user.email, role: null };

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      setCurrentUser(mergedUser);
      audit(ACTIONS.AUTH_LOGIN_SUCCESS, 'user', mergedUser.id, null, {
        actorId: mergedUser.id, actorEmail: mergedUser.email,
      });
      onSuccess?.(mergedUser);
    } catch (thrown) {
      // eslint-disable-next-line no-console
      console.error('[login] unexpected error:', thrown);
      setErr(`Unexpected error: ${thrown?.message || thrown}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgot(ev) {
    ev.preventDefault();
    setForgotMsg('');
    const target = (email || '').trim();
    if (!target) { setForgotMsg('Enter your email first, then click Forgot password.'); return; }
    setForgotSending(true);
    try {
      // Supabase Auth sends the reset email itself using the SMTP config
      // set on the project (Auth → Email templates → Password Recovery).
      // The redirectTo URL lands them on /set-password with a session in
      // the URL hash; the SetPassword page finalizes it via updateUser().
      const redirectTo = `${window.location.origin}/set-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
      if (error) {
        setForgotMsg(error.message || 'Could not send reset email. Contact an admin.');
      } else {
        setForgotMsg('Check your email for a reset link. It expires shortly, so complete the reset soon.');
      }
    } catch (thrown) {
      setForgotMsg(thrown?.message || 'Could not send reset email. Contact an admin.');
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

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Signing In…' : 'Sign In'}
          </button>
          {err && <div className="login-error">{err}</div>}
        </form>

        {forgotOpen && (
          <div style={{ marginTop: 16, padding: 14, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Reset password</div>
            <div style={{ color: '#555', marginBottom: 10 }}>
              We'll email a password-reset link to <strong>{email || '(enter your email above)'}</strong>. Click the link and follow the instructions to set a new password.
            </div>
            <button
              type="button"
              onClick={submitForgot}
              disabled={forgotSending || !email}
              className="login-btn"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              {forgotSending ? 'Sending…' : 'Send reset email'}
            </button>
            {forgotMsg && <div style={{ marginTop: 10, color: forgotMsg.startsWith('Check your email') ? '#1a6b4a' : '#c62828' }}>{forgotMsg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
