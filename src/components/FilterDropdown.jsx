import { useState, useRef, useEffect } from 'react';

/**
 * Drop-in replacement for the cycle-on-click filter pill.
 * Renders as the same styled pill, but clicking opens a real dropdown list.
 */
export default function FilterDropdown({ label, value, options, onChange, width = 160 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="income-filter" onClick={() => setOpen((o) => !o)}>
        <span className="income-filter-label">{label}</span>
        <span className="income-filter-val">{value}</span>
        <span className="income-filter-arrow">▾</span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
            background: '#fff', border: '1px solid #d0d0d0', borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,.15)', minWidth: width, maxHeight: 280, overflowY: 'auto',
          }}
        >
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                background: opt === value ? '#f5efe3' : '#fff',
                fontWeight: opt === value ? 700 : 400,
                borderBottom: '1px solid #f0f0f0',
              }}
              onMouseEnter={(e) => { if (opt !== value) e.currentTarget.style.background = '#fafafa'; }}
              onMouseLeave={(e) => { if (opt !== value) e.currentTarget.style.background = '#fff'; }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
