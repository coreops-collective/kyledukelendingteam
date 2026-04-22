import { useState } from 'react';
import { USERS } from '../data/users.js';
import { setCurrentUser } from '../lib/auth.js';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  function onSubmit(ev) {
    ev.preventDefault();
    const user = USERS.find(
      u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === pass
    );
    if (!user) { setErr('Invalid email or password'); return; }
    setCurrentUser(user);
    onSuccess?.(user);
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
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-btn">Sign In</button>
          {err && <div className="login-error">{err}</div>}
        </form>
      </div>
    </div>
  );
}
