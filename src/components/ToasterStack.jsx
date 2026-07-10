import { useEffect, useState, useCallback } from 'react';
import { TOASTER_EVENT_NAME } from '../lib/toaster.js';

// App-level error toast host. Listens for kdt-toast custom events fired by
// showError() from anywhere (stores, components, callbacks) and renders a
// stack at bottom-right. Each toast auto-dismisses; retryable toasts
// show a Retry button that re-runs the failed op.

const MAX_STACK = 4;

export default function ToasterStack() {
  const [toasts, setToasts] = useState([]);
  const [retrying, setRetrying] = useState({}); // id -> true while retry in flight

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setRetrying((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev }; delete next[id]; return next;
    });
  }, []);

  useEffect(() => {
    const onToast = (ev) => {
      const detail = ev.detail;
      if (!detail || !detail.id) return;
      setToasts((prev) => {
        // Cap the visible stack so a flurry of failures can't cover the UI.
        const trimmed = prev.length >= MAX_STACK ? prev.slice(prev.length - (MAX_STACK - 1)) : prev;
        return [...trimmed, detail];
      });
      if (detail.autoDismissMs > 0) {
        setTimeout(() => dismiss(detail.id), detail.autoDismissMs);
      }
    };
    window.addEventListener(TOASTER_EVENT_NAME, onToast);
    return () => window.removeEventListener(TOASTER_EVENT_NAME, onToast);
  }, [dismiss]);

  const runRetry = async (t) => {
    if (!t.retry) return;
    setRetrying((prev) => ({ ...prev, [t.id]: true }));
    try {
      await t.retry();
      // Assume the caller will fire a fresh toast if the retry itself fails.
      dismiss(t.id);
    } catch {
      // Same — retry impl is responsible for showing its own failure toast.
      dismiss(t.id);
    }
  };

  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 9999,
        maxWidth: 380,
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          style={{
            pointerEvents: 'auto',
            background: '#fff',
            border: '1px solid #f5cccc',
            borderLeft: '4px solid #c62828',
            boxShadow: '0 6px 24px rgba(0,0,0,.12)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 13, color: '#222', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, color: '#c62828', marginBottom: 2 }}>Save failed</div>
            {t.message}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {t.retry ? (
              <button
                onClick={() => runRetry(t)}
                disabled={!!retrying[t.id]}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  border: '1px solid #c62828',
                  background: '#c62828',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: retrying[t.id] ? 'wait' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {retrying[t.id] ? 'Retrying…' : t.retryLabel}
              </button>
            ) : null}
            <button
              onClick={() => dismiss(t.id)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                border: '1px solid #ccc',
                background: '#fff',
                color: '#666',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
