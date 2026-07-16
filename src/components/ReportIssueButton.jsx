import { useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../lib/auth.js';

// "Report an issue" header chip → opens a modal with a textarea → sends
// an email to lauren@coreopscollective.com via /.netlify/functions/
// report-issue with the current URL, browser, and reporter attached.
//
// Reachable on every page — visible to any signed-in user (Kim, Missy,
// Kyle, Abel). Rate-limited server-side.
export default function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'err', text: string } | null
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setMessage('');
    // Focus the textarea a tick after mount so the modal is on-screen.
    const t = setTimeout(() => textareaRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    setStatus(null);
    try {
      const me = getCurrentUser();
      const res = await fetch('/.netlify/functions/report-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(me?.email ? { 'x-kdt-user-email': me.email } : {}),
        },
        body: JSON.stringify({
          message: text,
          url: window.location.href,
          userAgent: navigator.userAgent,
          callerEmail: me?.email || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus({ kind: 'ok', text: 'Report sent. Thanks — Lauren will follow up.' });
        setMessage('');
        setTimeout(() => setOpen(false), 1600);
      } else {
        setStatus({ kind: 'err', text: data.error || data.reason || `HTTP ${res.status}` });
      }
    } catch (err) {
      setStatus({ kind: 'err', text: err?.message || 'Network error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Something wrong? Send Lauren a note."
        aria-label="Report an issue"
        className="chip"
        style={{
          cursor: 'pointer',
          border: '1px solid #d0d0d0',
          background: '#fff',
          color: '#555',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span aria-hidden style={{ fontSize: 12 }}>⚠</span>
        Report an issue
      </button>

      {open && (
        <div
          onClick={() => (!sending) && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,10,10,.55)',
            zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '10vh 20px 0',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-issue-title"
            style={{
              width: '100%', maxWidth: 520, background: '#fff',
              borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,.25)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
            }}>
              <div id="report-issue-title" style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '.6px', color: '#0A0A0A',
              }}>
                Report an issue
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 18, color: '#888', lineHeight: 1,
                }}
              >×</button>
            </div>

            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
                Tell Lauren what's happening. Include what you were doing, what you expected, and what actually happened.
                Your current page URL and browser are attached automatically.
              </div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Clicked Sign Out on the Snapshot page and nothing happened. I'm on Chrome on a MacBook."
                style={{
                  width: '100%', minHeight: 160, padding: 12,
                  border: '1px solid #d0d0d0', borderRadius: 6,
                  fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                  resize: 'vertical', boxSizing: 'border-box',
                }}
              />
              {status && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', fontSize: 12,
                  background: status.kind === 'ok' ? '#e8f5e9' : '#fdecea',
                  color: status.kind === 'ok' ? '#1b5e20' : '#c62828',
                  border: `1px solid ${status.kind === 'ok' ? '#c8e6c9' : '#f5cccc'}`,
                  borderRadius: 6,
                }}>
                  {status.text}
                </div>
              )}
            </div>

            <div style={{
              padding: '12px 18px', borderTop: '1px solid #eee',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={sending}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 700,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                  background: '#fff', color: '#555', border: '1px solid #d0d0d0',
                  borderRadius: 6, cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !message.trim()}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                  background: message.trim() && !sending ? '#C8102E' : '#f5f5f5',
                  color: message.trim() && !sending ? '#fff' : '#999',
                  border: '1px solid ' + (message.trim() && !sending ? '#C8102E' : '#e5e5e5'),
                  borderRadius: 6,
                  cursor: message.trim() && !sending ? 'pointer' : 'not-allowed',
                }}
              >{sending ? 'Sending…' : 'Send report'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
