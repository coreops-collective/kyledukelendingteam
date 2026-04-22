import { useMemo } from 'react';
import { getRandomQuote } from '../data/quotes.js';

export default function Welcome({ user, onDismiss }) {
  const q = useMemo(() => getRandomQuote(), []);
  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-logo">
          <img
            src="/brand-crest.jpeg"
            alt="The Kyle Duke Team"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <div className="welcome-hi">Welcome Back</div>
        <div className="welcome-name">{user.name}</div>
        <div className="welcome-quote">{q.text}</div>
        <div className="welcome-author">{q.author}</div>
        <button className="welcome-btn" onClick={onDismiss}>Get to Work</button>
      </div>
    </div>
  );
}
