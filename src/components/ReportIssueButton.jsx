import { useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../lib/auth.js';
import { getBreadcrumbs } from '../lib/breadcrumbs.js';

// "Report an issue" header chip → opens a modal with a textarea →
// packages a screenshot of the current screen + the user's last ~20
// interactions (from the breadcrumbs ring buffer) + full context
// (route, user, browser, OS, viewport, timestamp), and POSTs the
// bundle to /.netlify/functions/report-issue. The netlify function
// emails everything to Lauren via the app's existing SMTP setup — no
// email creds ever touch the browser.
//
// Reachable on every page, visible to any signed-in user. Rate-limited
// server-side (5/min) so a stuck button can't spam.
//
// Privacy: html2canvas captures the visible DOM (screenshot is fine per
// spec), but the breadcrumb collector NEVER captures the text typed
// into inputs — see src/lib/breadcrumbs.js. Screenshot capture happens
// BEFORE the modal renders so the modal doesn't obscure the page.

// Lazy-load html2canvas the first time the user clicks Send. Keeps it
// out of the initial bundle for the 99% of loads that never open this
// dialog. Also failsafe: if the load or capture fails for any reason,
// we still send the report without a screenshot — never block the
// user from getting help.
async function captureScreenshot() {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(document.body, {
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      // Scale down to keep the JPEG reasonably-sized. Anything bigger
      // than 1600px wide is oversized for an email attachment.
      scale: Math.min(1, 1600 / (window.innerWidth || 1600)),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    });
    // JPEG at q=0.7 — good enough to read UI, ~30-50KB per screen on
    // most pages. Fallback to PNG if JPEG isn't supported (rare).
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (err) {
    console.warn('[report-issue] screenshot capture failed:', err?.message || err);
    return null;
  }
}

// Very rough OS + browser detection from the UA string. We could pull
// in a full ua-parser lib but this is fine for triage — the raw UA
// string is sent too so anything the heuristic misses is still
// available in the email.
function detectOs(ua) {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}
// Grab the deployed commit + build time from /version.json, written at
// build by scripts/write-version.js. Silent no-op if the file is
// missing (dev server, prod build without the script running).
async function readAppVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return '';
    const v = await res.json();
    return v?.commit ? `${v.commit} @ ${v.buildTime || ''}` : '';
  } catch { return ''; }
}

function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  return 'Unknown';
}

// Feedback kinds Kim can pick between when she opens the dialog. Bug
// stays the default because that's what the button entry point has
// historically implied and Kim's muscle memory is there. Adding
// Feature to the payload changes the email subject prefix + header
// so Lauren can triage without opening the body.
const FEEDBACK_KINDS = [
  { value: 'bug', label: 'Bug report', icon: '🐛',
    placeholder: 'e.g. Clicked Sign Out on the Snapshot page and nothing happened.',
    ok: 'Thanks, your bug report was sent.' },
  { value: 'feature', label: 'Feature request', icon: '💡',
    placeholder: 'e.g. On the Rate Locks page, please add a Locked ≥ 30 days filter so I can pull the extension list at once.',
    ok: 'Thanks, your feature request was sent.' },
];

export default function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('bug');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'err', text: string } | null
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  const activeKind = FEEDBACK_KINDS.find((k) => k.value === kind) || FEEDBACK_KINDS[0];

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setMessage('');
    setKind('bug');
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
      // Capture the screenshot BEFORE the modal is hidden — we want to
      // capture what the user was looking at when they clicked. The
      // modal itself is in the DOM, but that's actually fine: the
      // report reader wants to see exactly what the user saw, which
      // includes the "Report an issue" dialog they were typing into.
      const shot = await captureScreenshot();

      const me = getCurrentUser();
      const ua = navigator.userAgent || '';
      const context = {
        route: window.location.pathname + window.location.search + window.location.hash,
        url: window.location.href,
        userName: me?.name || '',
        userEmail: me?.email || '',
        userId: me?.id || '',
        userRole: me?.role || '',
        userAgent: ua,
        browser: detectBrowser(ua),
        os: detectOs(ua),
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        dpr: window.devicePixelRatio || 1,
        language: navigator.language || '',
        sentAt: new Date().toISOString(),
        appVersion: await readAppVersion(),
      };
      const breadcrumbs = getBreadcrumbs();

      const res = await fetch('/.netlify/functions/report-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(me?.email ? { 'x-kdt-user-email': me.email } : {}),
        },
        body: JSON.stringify({
          message: text,
          kind,
          context,
          breadcrumbs,
          screenshot: shot ? {
            dataUrl: shot.dataUrl,
            width: shot.width,
            height: shot.height,
          } : null,
          // Legacy fields kept for backwards compat with older function
          // versions during a mid-deploy window — the new function reads
          // from context.* first and falls back to these.
          url: window.location.href,
          userAgent: ua,
          callerEmail: me?.email || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus({ kind: 'ok', text: activeKind.ok });
        setMessage('');
        setTimeout(() => setOpen(false), 1800);
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
        title="Report a bug or request a feature."
        aria-label="Report an issue or request a feature"
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
                Report an issue or request a feature
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
              {/* Feedback-kind picker — Bug vs Feature. Whichever is
                  active controls the email subject prefix, the header
                  block color in the email body, and the placeholder /
                  confirmation copy in the dialog. */}
              <div
                role="radiogroup"
                aria-label="What kind of feedback?"
                style={{ display: 'flex', gap: 8, marginBottom: 12 }}
              >
                {FEEDBACK_KINDS.map((k) => {
                  const on = k.value === kind;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setKind(k.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        fontSize: 13, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
                        textTransform: 'uppercase', letterSpacing: '.5px',
                        border: `2px solid ${on ? '#C8102E' : '#e0e0e0'}`,
                        background: on ? '#fdecea' : '#fff',
                        color: on ? '#C8102E' : '#666',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 16 }}>{k.icon}</span>
                      {k.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
                {kind === 'feature'
                  ? 'What would make this easier? A screenshot of the page, your last few clicks, and the current URL/browser are attached automatically — no need to describe those.'
                  : 'What went wrong? A screenshot of the page, your last few clicks, and the current URL/browser are attached automatically — no need to describe those.'}
              </div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={activeKind.placeholder}
                style={{
                  width: '100%', minHeight: 140, padding: 12,
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
              >{sending ? 'Sending…' : (kind === 'feature' ? 'Send request' : 'Send report')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
