import { useEffect, useLayoutEffect, useState } from 'react';

// Guided tour overlay. Steps is an array of:
//   { target?: string,  // querySelector for the element to spotlight
//     title: string,
//     body: string | ReactNode }  // \n\n split into paragraphs
//
// When target is null/missing the card centers on screen with no
// spotlight (used for the intro / closing steps).
//
// Uses a full-screen backdrop with a "hole" (box-shadow trick) around
// the target so the spotlight dims everything except the highlighted
// element. Recomputes on window resize / scroll so the card and hole
// track the target through layout changes.
export default function Tour({ steps, onClose, onStepChange }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[idx] || null;

  // Fire onStepChange whenever the active step changes so the parent
  // can trigger side effects — auto-open the task editor for the
  // in-editor steps, close it for the closing step, etc.
  useEffect(() => {
    if (onStepChange && step) onStepChange(step, idx);
  }, [idx, step, onStepChange]);

  useLayoutEffect(() => {
    if (!step) return;
    let rafId = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~650ms at 60fps — enough for the drawer
                             // slide-in transition and its own layout.
    const tryMeasure = () => {
      if (!step.target) { setRect(null); return; }
      const el = document.querySelector(step.target);
      if (el) {
        // Only scroll on first successful find; subsequent retries
        // (during drawer slide-in) shouldn't jerk the page around.
        if (attempts === 0) {
          el.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
          window.scrollBy(0, -120);
        }
        const r = el.getBoundingClientRect();
        // If the element rendered at zero size (still animating in),
        // wait another frame for it to settle.
        if (r.width < 4 || r.height < 4) {
          if (attempts < MAX_ATTEMPTS) {
            attempts += 1;
            rafId = requestAnimationFrame(tryMeasure);
          }
          return;
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      // Target not in DOM yet — usually means an action:'openEditor'
      // step is still waiting for the drawer to mount. Retry until
      // it shows up or we hit the ceiling.
      if (attempts < MAX_ATTEMPTS) {
        attempts += 1;
        rafId = requestAnimationFrame(tryMeasure);
      } else {
        setRect(null); // fall back to centered card
      }
    };
    const rescheduleOnScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      // Track the target through window scroll/resize but skip the
      // initial-scroll behavior in tryMeasure by pre-setting attempts.
      attempts = MAX_ATTEMPTS; // no more initial-position tricks
      rafId = requestAnimationFrame(() => {
        if (!step.target) return;
        const el = document.querySelector(step.target);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width >= 4 && r.height >= 4) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }
      });
    };
    tryMeasure();
    window.addEventListener('resize', rescheduleOnScroll);
    window.addEventListener('scroll', rescheduleOnScroll, true);
    return () => {
      window.removeEventListener('resize', rescheduleOnScroll);
      window.removeEventListener('scroll', rescheduleOnScroll, true);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [step, idx]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx]); // eslint-disable-line

  if (!step) return null;

  const next = () => {
    if (idx >= steps.length - 1) onClose();
    else setIdx(idx + 1);
  };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  // Card positioning — place next to the spotlight when possible;
  // fall back to centered if no target. Vertically CENTER the card
  // against the target so a short section doesn't leave the card
  // floating awkwardly up top.
  const CARD_W = 400;
  const CARD_H_EST = 300;
  const PAD = 20;
  let cardStyle = {
    position: 'fixed',
    width: CARD_W,
    zIndex: 10001,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 12px 40px rgba(0,0,0,.4)',
    overflow: 'hidden',
  };
  if (!rect) {
    cardStyle = { ...cardStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceBottom = vh - (rect.top + rect.height);
    // Preferred vertical anchor: center card on the target's midpoint.
    const centerY = rect.top + rect.height / 2 - CARD_H_EST / 2;
    const clampedTop = Math.max(PAD, Math.min(vh - CARD_H_EST - PAD, centerY));
    if (spaceRight >= CARD_W + PAD) {
      cardStyle = { ...cardStyle, top: clampedTop, left: rect.left + rect.width + PAD };
    } else if (spaceLeft >= CARD_W + PAD) {
      cardStyle = { ...cardStyle, top: clampedTop, left: rect.left - CARD_W - PAD };
    } else if (spaceBottom >= CARD_H_EST + PAD) {
      cardStyle = { ...cardStyle, top: rect.top + rect.height + PAD, left: Math.max(PAD, Math.min(vw - CARD_W - PAD, rect.left)) };
    } else {
      cardStyle = { ...cardStyle, top: Math.max(PAD, rect.top - CARD_H_EST - PAD), left: Math.max(PAD, Math.min(vw - CARD_W - PAD, rect.left)) };
    }
  }

  const paragraphs = String(step.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <>
      {/* Backdrop — dims everything. When a target rect is set, we
          punch a hole around it using an outset box-shadow trick. */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,.65)',
            border: '3px solid #fbc02d',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />
      ) : (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 10000 }}
          onClick={onClose}
        />
      )}

      {/* Card */}
      <div style={cardStyle}>
        <div style={{ padding: '18px 22px 8px', background: 'linear-gradient(135deg,#0A0A0A,#2d0d0d)', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fbc02d', textTransform: 'uppercase', letterSpacing: '.8px' }}>
              Step {idx + 1} of {steps.length}
            </span>
            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: 4 }}
            >×</button>
          </div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '.3px', paddingBottom: 8 }}>
            {step.title}
          </div>
        </div>
        <div style={{ padding: '18px 22px', fontSize: 13, lineHeight: 1.55, color: '#333' }}>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 12px' }}>{p}</p>
          ))}
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: 6 }}
          >Skip tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={prev}
              disabled={idx === 0}
              style={{
                padding: '8px 16px', borderRadius: 6, border: '1px solid #d0d0d0', background: '#fff',
                color: '#333', fontWeight: 600, fontSize: 12, cursor: idx === 0 ? 'not-allowed' : 'pointer',
                opacity: idx === 0 ? 0.4 : 1,
              }}
            >← Back</button>
            <button
              onClick={next}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: 'var(--brand-red, #c62828)', color: '#fff',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >{idx >= steps.length - 1 ? 'Finish' : 'Next →'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
