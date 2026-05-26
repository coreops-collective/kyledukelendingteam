import { useEffect, useState } from 'react';

// Polls /version.json (written at build time by scripts/write-version.js)
// every 60 seconds and on tab-visibility-change. If the live build time
// differs from what was loaded when this tab first started, show a red
// banner asking the user to refresh.
//
// Falls back silently if /version.json is missing (e.g. dev server).
export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let bootVersion = null;

    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data || !data.buildTime) return;
        if (bootVersion === null) {
          bootVersion = data.buildTime;
        } else if (data.buildTime !== bootVersion) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Ignore — likely dev or offline.
      }
    };

    check();
    const interval = setInterval(check, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'var(--brand-red, #c62828)',
        color: '#fff',
        padding: '10px 16px',
        textAlign: 'center',
        zIndex: 9999,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 2px 12px rgba(0,0,0,.25)',
        fontFamily: 'inherit',
      }}
    >
      A new update is available. Please refresh to load it.
      <button
        onClick={() => window.location.reload()}
        style={{
          marginLeft: 14,
          padding: '5px 14px',
          background: '#fff',
          color: 'var(--brand-red, #c62828)',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '.5px',
        }}
      >
        Refresh now
      </button>
    </div>
  );
}
