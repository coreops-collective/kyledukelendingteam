import { useState, useEffect, useRef } from 'react';
import { STATUS_TO_STAGE, STAGE_TO_STATUS } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import { markLoansDirty } from '../lib/loansStore.js';
import { fireWebhooks } from '../lib/webhooks.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { notifyMentions } from '../lib/mentions.js';
import MentionTextarea from './MentionTextarea.jsx';

// Every pipeline stage label so the Status dropdown works for both
// pre-contract (New Lead, Applied, HOT PA, REFI Watch) and LOS stages.
const STATUSES = ['New Lead','Applied','HOT PA','REFI Watch','New Contract','Disclosed','Processing','Underwriting','CTC Required','CTC','BTP','Approved','Funded','Archived'];
const TYPES = ['CONV','FHA','VA','Jumbo'];
const SALE_TYPES = ['PURCHASE','REFINANCE'];
const LEAD_SOURCES = ['Realtor Referral','Self-Generated','Past Client','Veteran Network','Zillow','Other'];
const LO_LIST = ['Kyle','Missy'];

const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

/**
 * Editable loan detail drawer. Mutates the passed `loan` object in place
 * (same pattern as legacy window.openLoan → saves directly to LOANS array)
 * and calls onSaved() so parent can re-render.
 */
export default function LoanDrawer({ loan, onSaved, onClose }) {
  // ── All hooks first, BEFORE any conditional early-return. If we
  // returned `null` for missing `loan` before later useState/useRef/
  // useEffect calls (as a previous version did), React would throw
  // "Rendered more hooks than during the previous render" the moment
  // a loan was selected after the drawer mounted empty.
  const [, force] = useState(0);
  // Visual feedback for save-on-blur — set to the field name that
  // just committed and cleared after ~1.2s.
  const [justSaved, setJustSaved] = useState(null);
  const justSavedTimer = useRef(null);

  // Drawer width is drag-resizable from the left edge; width persists per
  // user via localStorage. Same UX as the dedicated Notes drawer so users
  // get consistent behavior wherever they're editing notes.
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem('kdt-loan-drawer-width') || '', 10);
    return Number.isFinite(stored) && stored >= 420 ? stored : 720;
  });
  const drawerWidthRef = useRef(drawerWidth);
  useEffect(() => { drawerWidthRef.current = drawerWidth; }, [drawerWidth]);

  if (!loan) return null;

  const handleArchive = () => {
    if (!window.confirm(`Archive loan for ${loan.borrower}? It will be hidden from all views but kept in Supabase — tell Lauren if you ever need it back.`)) return;
    loan.archived = true;
    loan.archivedAt = new Date().toISOString();
    markLoansDirty(loan);
    onSaved?.();
    onClose?.();
  };
  const handleUnarchive = () => {
    loan.archived = false;
    loan.archivedAt = null;
    markLoansDirty(loan);
    onSaved?.();
  };

  // Co-borrower field aliases — different views ended up writing to
  // either the legacy c2* keys or the canonical co* keys, so every
  // write mirrors to both names to keep them in sync. Same story on
  // the read path in the JSX below.
  const CO_ALIASES = {
    c2first: 'coFirst', c2last: 'coLast', c2phone: 'coPhone', c2email: 'coEmail',
    coFirst: 'c2first', coLast: 'c2last', coPhone: 'c2phone', coEmail: 'c2email',
  };
  const set = (key, value) => {
    const prevStatus = loan.status || '';
    loan[key] = value;
    if (CO_ALIASES[key]) loan[CO_ALIASES[key]] = value;
    if (key === 'status') {
      const nextStage = STATUS_TO_STAGE[value];
      if (nextStage) loan.stage = nextStage;
    }
    force((n) => n + 1);
    markLoansDirty(loan);
    // Mirror the GHL webhook LoanManagement fires on status transitions so
    // status flipped from the drawer stays in sync with GHL contact state.
    if (key === 'status' && prevStatus !== value) {
      audit(ACTIONS.LOAN_STATUS_CHANGED, 'loan', loan.id, {
        borrower: loan.borrower,
        old_status: prevStatus,
        new_status: value,
        source: 'loan_drawer',
      });
      fireWebhooks('loan.status_changed', {
        loan_id: loan.id,
        borrower: loan.borrower,
        phone: loan.phone,
        email: loan.email,
        agent: loan.agent,
        lo: loan.lo,
        property: loan.property,
        amount: loan.amount,
        close_date: loan.closeDate,
        old_status: prevStatus,
        new_status: value,
        status: value,
      });
    }
    // Brief green flash on the field we just saved so the user gets
    // a "yes it stuck" signal — previously blur-to-save had zero
    // visible feedback and people didn't trust it.
    setJustSaved(key);
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    justSavedTimer.current = setTimeout(() => setJustSaved(null), 1200);
    onSaved?.();
  };

  const agentOpts = [...PARTNERS].map((p) => p.name).sort((a, b) => a.localeCompare(b));

  const Field = ({ label, children, full }) => (
    <div className="form-field" style={{ marginBottom: 12, gridColumn: full ? '1/-1' : undefined }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
  const I = (props) => (
    <input
      {...props}
      style={{
        width: '100%', padding: '8px 10px', fontSize: 13,
        border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box',
      }}
    />
  );
  const S = ({ value, options, empty, onChange }) => (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '8px 10px', fontSize: 13,
        border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', background: '#fff',
      }}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const Chk = ({ value, onChange, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px', border: '1px solid #d0d0d0', borderRadius: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );

  // Drag-resize handler. Closes over drawerWidthRef so localStorage
  // persists the latest committed width even though we update React
  // state on every move event.
  const startDrawerResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = drawerWidth;
    const maxW = Math.floor(window.innerWidth * 0.95);
    const onMove = (ev) => {
      const next = Math.min(maxW, Math.max(420, startW + (startX - ev.clientX)));
      setDrawerWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('kdt-loan-drawer-width', String(drawerWidthRef.current)); } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: drawerWidth, maxWidth: '95vw' }}>
        <span
          onMouseDown={startDrawerResize}
          title="Drag to resize"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 2,
            background: 'linear-gradient(to right, rgba(0,0,0,.06), transparent)',
          }}
        />
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">{loan.status || STAGE_TO_STATUS[loan.stage] || loan.stage || 'Loan'}</div>
          <div className="drawer-borrower">{loan.borrower}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            {loan.property || '—'} · {fmt$(loan.amount)}
          </div>
        </div>
        <div className="drawer-body">
          {justSaved && (
            <div
              role="status"
              style={{
                position: 'sticky', top: 0, zIndex: 1,
                margin: '-10px -14px 12px',
                padding: '6px 12px', background: '#e8f5e9', color: '#1b5e20',
                borderBottom: '1px solid #a5d6a7', fontSize: 11, fontWeight: 700,
                letterSpacing: '.5px', textTransform: 'uppercase',
              }}
            >
              ✓ Saved · {justSaved}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Borrower" full>
              <I defaultValue={loan.borrower || ''} onBlur={(e) => set('borrower', e.target.value)} />
            </Field>
            <Field label="Status">
              <S value={loan.status || STAGE_TO_STATUS[loan.stage] || ''} options={STATUSES} empty="—" onChange={(v) => set('status', v)} />
            </Field>
            <Field label="LO">
              <S value={loan.lo || ''} options={LO_LIST} empty="—" onChange={(v) => set('lo', v)} />
            </Field>
            <Field label="Close Date">
              <I type="date" defaultValue={loan.closeDate || ''} onBlur={(e) => set('closeDate', e.target.value)} />
            </Field>
            <Field label="Sale Type">
              <S value={loan.saleType || ''} options={SALE_TYPES} empty="—" onChange={(v) => set('saleType', v)} />
            </Field>
            <Field label="Loan Amount">
              <I type="number" defaultValue={loan.amount || ''} onBlur={(e) => set('amount', e.target.value === '' ? null : parseFloat(e.target.value))} />
            </Field>
            <Field label="Purchase Price">
              <I type="number" defaultValue={loan.price || ''} onBlur={(e) => set('price', e.target.value === '' ? null : parseFloat(e.target.value))} />
            </Field>
            <Field label="Type">
              <S value={loan.type || ''} options={TYPES} empty="—" onChange={(v) => set('type', v)} />
            </Field>
            <Field label="Rate (%)">
              <I type="number" step="0.001" defaultValue={loan.rate || ''} onBlur={(e) => set('rate', e.target.value === '' ? null : parseFloat(e.target.value))} />
            </Field>
            <Field label="Property" full>
              <I defaultValue={loan.property || ''} onBlur={(e) => set('property', e.target.value)} />
            </Field>
            <Field label="Agent">
              <S value={loan.agent || ''} options={(loan.agent && !agentOpts.includes(loan.agent)) ? [...agentOpts, loan.agent] : agentOpts} empty="—" onChange={(v) => set('agent', v)} />
            </Field>
            <Field label="Lead Source">
              <S value={loan.leadSource || ''} options={LEAD_SOURCES} empty="—" onChange={(v) => set('leadSource', v)} />
            </Field>
            <Field label="Phone">
              <I type="tel" defaultValue={loan.phone || ''} onBlur={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Email">
              <I type="email" defaultValue={loan.email || ''} onBlur={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Co-Borrower First">
              <I defaultValue={loan.c2first || loan.coFirst || ''} onBlur={(e) => set('coFirst', e.target.value)} />
            </Field>
            <Field label="Co-Borrower Last">
              <I defaultValue={loan.c2last || loan.coLast || ''} onBlur={(e) => set('coLast', e.target.value)} />
            </Field>
            <Field label="Co-Borrower Phone" full>
              <I type="tel" defaultValue={loan.c2phone || loan.coPhone || ''} onBlur={(e) => set('coPhone', e.target.value)} />
            </Field>
          </div>

          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #eee' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10, color: '#555' }}>
              Timeline
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Chk value={loan.apprOrdered} onChange={(v) => set('apprOrdered', v)} label="Appraisal Ordered" />
              <Chk value={loan.apprReceived} onChange={(v) => set('apprReceived', v)} label="Appraisal Received" />
              <Chk value={loan.titleReceived} onChange={(v) => set('titleReceived', v)} label="Title Received" />
              <Field label="Appr Deadline">
                <I type="date" defaultValue={loan.apprDeadline || ''} onBlur={(e) => set('apprDeadline', e.target.value)} />
              </Field>
              <Field label="Lock Expires">
                <I type="date" defaultValue={loan.lockExp || ''} onBlur={(e) => set('lockExp', e.target.value)} />
              </Field>
              <Field label="ICD Deadline">
                <I type="date" defaultValue={loan.icdDeadline || ''} onBlur={(e) => set('icdDeadline', e.target.value)} />
              </Field>
              <Chk value={loan.icdSent} onChange={(v) => set('icdSent', v)} label="ICD Sent" />
              <Chk value={loan.icdSigned} onChange={(v) => set('icdSigned', v)} label="ICD Signed" />
            </div>
          </div>

          {/* TRID / Reg Z compliance clocks. LE must be sent within 3
              business days of application; earliest permissible close
              is 7 business days after LE delivery. Both dates flag on
              the Deadlines panel and against loan-management rules. */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #eee' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10, color: '#555' }}>
              Compliance (TRID)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Application Date">
                <I type="date" defaultValue={loan.dateApplied || loan.applicationDate || ''} onBlur={(e) => set('dateApplied', e.target.value)} />
              </Field>
              <Field label="LE Sent Date">
                <I type="date" defaultValue={loan.leSentDate || ''} onBlur={(e) => set('leSentDate', e.target.value)} />
              </Field>
              <Field label="LE Deadline (auto)">
                <I type="text" readOnly value={loan.leDeadline || ''} placeholder="auto from application" style={{ background: '#f5f5f5' }} />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <Field label="Notes" full>
              <MentionTextarea
                defaultValue={loan.notes || ''}
                minHeight={260}
                placeholder="Type @ to mention a teammate…"
                ariaLabel="Notes"
                onBlur={(e) => {
                  const prev = loan.notes || '';
                  const next = e.target.value;
                  set('notes', next);
                  notifyMentions({
                    oldText: prev, newText: next,
                    context: {
                      borrower: loan.borrower, loan_id: loan.id,
                      dashboard_url: 'https://thekyleduketeam.netlify.app/',
                      snippet: next.slice(0, 240),
                    },
                  });
                }}
              />
            </Field>
          </div>
        </div>
        <div className="drawer-actions">
          {loan.archived ? (
            <button className="drawer-btn" onClick={handleUnarchive} style={{ color: '#1a6b4a' }}>Unarchive</button>
          ) : (
            <button className="drawer-btn" onClick={handleArchive} style={{ color: '#c62828' }}>Archive</button>
          )}
          <button className="drawer-btn primary" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}
