import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function EmailDeliverySettings() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState({ username: '', appPassword: '', fromName: '', replyToEmail: '' });
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [status, setStatus] = useState({});
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('email_settings').select('*').eq('id', 1).maybeSingle();
      if (data) {
        setSettings({
          username: data.username || '',
          appPassword: '',
          fromName: data.from_name || '',
          replyToEmail: data.reply_to_email || '',
        });
        setHasStoredPassword(!!data.app_password);
        setStatus({
          lastTestAt: data.last_test_at, lastTestOk: data.last_test_ok, lastTestError: data.last_test_error,
          lastErrorAt: data.last_error_at, lastError: data.last_error,
        });
      }
      setLoaded(true);
    })();
  }, []);

  const saveRemote = async (overrides = {}) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        username: overrides.username ?? settings.username,
        fromName: overrides.fromName ?? settings.fromName,
        replyToEmail: overrides.replyToEmail ?? settings.replyToEmail,
        appPassword: passwordDirty ? (overrides.appPassword ?? settings.appPassword) : '__KEEP__',
      };
      const res = await fetch('/.netlify/functions/save-email-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || !data.success) {
        const parts = [data.error || `HTTP ${res.status}`];
        if (data.hint) parts.push(data.hint);
        if (data.detail) parts.push(`detail: ${data.detail}`);
        setSaveMsg({ ok: false, text: parts.join(' · ') });
      } else {
        setSaveMsg({ ok: true, text: 'Saved securely' });
        if (passwordDirty) { setPasswordDirty(false); setHasStoredPassword(true); }
      }
    } catch (err) {
      setSaveMsg({ ok: false, text: String(err?.message || err) });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(s => ({ ...s, [key]: value }));
    if (key === 'appPassword') setPasswordDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveRemote({ [key]: value }); }, 1000);
  };

  const sendTest = async () => {
    if (!settings.username) { setTestResult({ ok: false, msg: 'Enter a Gmail address first.' }); return; }
    if (!hasStoredPassword && !settings.appPassword) { setTestResult({ ok: false, msg: 'Enter an App Password first.' }); return; }
    clearTimeout(timer.current);
    await saveRemote();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/.netlify/functions/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: settings.username }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (data.success) setTestResult({ ok: true, msg: `Test email sent to ${data.sentTo}` });
      else setTestResult({ ok: false, msg: data.error || `HTTP ${res.status}` });
    } catch (err) {
      setTestResult({ ok: false, msg: String(err?.message || err) });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return null;
  const lastError = !status.lastTestOk && status.lastError;
  const lastErrorAt = status.lastErrorAt || status.lastTestAt;

  return (
    <div className="section-card" style={{ marginTop: 18 }}>
      <div className="section-header">
        <div className="section-title">Email Delivery</div>
        <div className="section-sub">
          Notification emails are sent from your own Gmail using an App Password — not your login password.
        </div>
      </div>
      <div className="section-body" style={{ padding: 16 }}>
        {lastError && (
          <div style={{ background: '#fff0f0', border: '1px solid #f0c0c0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, color: '#8a1f1f', fontSize: 13, lineHeight: 1.45 }}>
            <strong>Email notifications stopped working.</strong>
            {lastErrorAt ? ` Last error at ${new Date(lastErrorAt).toLocaleString()}:` : ':'}
            <div style={{ marginTop: 6, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 }}>
              {String(lastError).slice(0, 300)}
            </div>
            <div style={{ marginTop: 6 }}>
              Common causes: App Password was revoked, 2-Step Verification was turned off, or Gmail SMTP was disabled. Generate a new App Password and paste it below.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-field">
            <label>Gmail address</label>
            <input type="email" value={settings.username} onChange={(e) => handleChange('username', e.target.value)} placeholder="you@gmail.com or you@yourdomain.com" autoComplete="off" />
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>The account that will send the notifications. Google Workspace addresses work too.</div>
          </div>
          <div className="form-field">
            <label>
              App Password
              {hasStoredPassword && !passwordDirty && <span style={{ color: '#1a6b4a', fontWeight: 600, marginLeft: 6 }}>· saved</span>}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={settings.appPassword}
                onChange={(e) => handleChange('appPassword', e.target.value)}
                placeholder={hasStoredPassword && !passwordDirty ? '•••••••••••••••• (retype to change)' : '16-character app password'}
                style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                autoComplete="new-password"
              />
              <button type="button" className="form-btn secondary" onClick={() => setShowPassword(v => !v)} style={{ padding: '4px 10px', fontSize: 10 }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              Generate at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a>. Requires 2-Step Verification.
            </div>
          </div>
          <div className="form-field">
            <label>From Name</label>
            <input value={settings.fromName} onChange={(e) => handleChange('fromName', e.target.value)} placeholder="The Kyle Duke Team" />
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Appears in the recipient's inbox as the sender name.</div>
          </div>
          <div className="form-field">
            <label>Reply-To</label>
            <input type="email" value={settings.replyToEmail} onChange={(e) => handleChange('replyToEmail', e.target.value)} placeholder="kyle@valorhl.com" />
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Where replies go when someone hits reply on a notification.</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="form-btn primary" onClick={sendTest} disabled={testing}>
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
          {saving && <span style={{ fontSize: 12, color: '#666' }}>Saving...</span>}
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.ok ? '#1a6b4a' : '#8a1f1f' }}>{saveMsg.text}</span>}
          {testResult && <span style={{ fontSize: 12, color: testResult.ok ? '#1a6b4a' : '#8a1f1f' }}>{testResult.msg}</span>}
        </div>
      </div>
    </div>
  );
}
