import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// /set-password lands from two Supabase Auth email flows:
//   - Invite      → link contains type=invite in the URL hash
//   - Recovery    → link contains type=recovery in the URL hash
// The @supabase/supabase-js client auto-detects the tokens in the hash
// on load, stores them as a session, and fires onAuthStateChange with
// the corresponding event (SIGNED_IN or PASSWORD_RECOVERY). We wait for
// a valid session, then let the user pick a password via updateUser.
//
// After a successful update we sign the user out and send them to the
// Login screen. That's deliberate — they should re-authenticate with
// their new password, so any tab already open on the hub has to log in
// too. Matches the "no session invalidation" rule in the opposite
// direction: the ONLY thing we invalidate is the one-shot recovery
// session, not any long-lived kdt_user cache elsewhere.
export default function SetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // 'checking' | 'ready' | 'no-session'
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    // On mount: check for an existing session. If Supabase already
    // parsed the invite/recovery hash on load, there'll be one; if the
    // user just navigated here directly, there won't.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setStatus(data?.session ? 'ready' : 'no-session');
    });

    // Also subscribe — the hash-token parse happens ASYNC on some
    // browsers, so we might not have a session at getSession() time
    // but pick one up moments later via onAuthStateChange.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) setStatus('ready');
      }
      if (event === 'SIGNED_OUT') {
        // If a rogue tab signs us out mid-page, drop back to no-session
        // so the copy honestly reflects what's happening.
        setStatus('no-session');
      }
    });

    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  async function onSubmit(ev) {
    ev.preventDefault();
    setErr('');
    setOkMsg('');
    if (pw1.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { setErr('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) {
        setErr(error.message || 'Could not save the new password.');
        return;
      }
      setOkMsg('Password saved. Sending you back to sign in…');
      // Sign the one-shot recovery / invite session out so the user
      // has to log in with the new password.
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      setTimeout(() => navigate('/', { replace: true }), 900);
    } catch (thrown) {
      setErr(thrown?.message || 'Unexpected error.');
    } finally {
      setSubmitting(false);
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
        <div className="login-sub">Set your password</div>

        {status === 'checking' && (
          <div style={{ margin: '20px 0', textAlign: 'center', color: '#888', fontSize: 12 }}>
            Verifying reset link…
          </div>
        )}

        {status === 'no-session' && (
          <div style={{ margin: '18px 0', padding: 14, background: '#fdecea', border: '1px solid #f5cccc', borderLeft: '4px solid #c62828', borderRadius: 8, fontSize: 13, color: '#8b1a1a' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Reset link invalid or expired</div>
            <div style={{ marginBottom: 10 }}>
              This page can only be reached from a Supabase invite or password-reset email.
              Head back to sign in and click <strong>Forgot password?</strong> to get a fresh link.
            </div>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="login-btn"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={onSubmit}>
            <div className="login-field">
              <label>New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  required
                  autoFocus
                  autoComplete="new-password"
                  minLength={8}
                  style={{ paddingRight: 58 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', fontSize: 11, color: '#666',
                    fontWeight: 600, cursor: 'pointer', padding: '4px 8px', letterSpacing: '.5px',
                  }}
                >
                  {showPw ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label>Confirm new password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save password'}
            </button>
            {err && <div className="login-error">{err}</div>}
            {okMsg && <div style={{ marginTop: 12, color: '#1a6b4a', fontSize: 13, fontWeight: 600 }}>{okMsg}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
