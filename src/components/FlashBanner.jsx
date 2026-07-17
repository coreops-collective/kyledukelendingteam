import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Global flash-message banner. A page can navigate with
// `location.state.flash: "Success — ..."` and this banner appears
// centered at the top of the viewport, auto-dismisses in 4 seconds,
// and clears the state so a refresh doesn't re-trigger it.
//
// Used primarily by NewLoan after a successful intake — replaces the
// dark bottom-center toast that used to render on the intake page and
// disappear before the navigation was complete.
export default function FlashBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const flashText = location.state?.flash;
  const [visible, setVisible] = useState(!!flashText);

  useEffect(() => {
    if (!flashText) return;
    setVisible(true);
    // Strip the flash from history state so a refresh doesn't replay it.
    const clearTimer = setTimeout(() => {
      navigate(location.pathname + location.search, { replace: true, state: null });
    }, 20);
    // Auto-hide the visual banner after 4 seconds. History cleanup is
    // separate so the banner keeps rendering until it fades.
    const hideTimer = setTimeout(() => setVisible(false), 4000);
    return () => {
      clearTimeout(clearTimer);
      clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashText]);

  if (!flashText || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed',
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9997,
        maxWidth: 'min(520px, calc(100vw - 40px))',
        padding: '12px 22px',
        background: '#fff',
        border: '1px solid #cbe5d0',
        borderLeft: '4px solid #1a6b4a',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,.15)',
        color: '#0A0A0A',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ color: '#1a6b4a', fontSize: 18, lineHeight: 1 }}>✓</span>
      <span>{flashText}</span>
    </div>
  );
}
