import { useState } from 'react';
import { STATUS_TO_STAGE, STAGE_TO_STATUS } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import { markLoansDirty } from '../lib/loansStore.js';

// Every pipeline stage label so the Status dropdown works for both
// pre-contract (New Lead, Applied, HOT PA, REFI Watch) and LOS stages.
const STATUSES = ['New Lead','Applied','HOT PA','REFI Watch','New Contract','Disclosed','Processing','Underwriting','CTC Required','CTC','BTP','Approved','Funded','Cold / Archived'];
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
  const [, force] = useState(0);
  if (!loan) return null;

  const handleArchive = () => {
    if (!window.confirm(`Archive loan for ${loan.borrower}? It will be hidden from all views but kept in Supabase — tell Lauren if you ever need it back.`)) return;
    loan.archived = true;
    loan.archivedAt = new Date().toISOString();
    markLoansDirty();
    onSaved?.();
    onClose?.();
  };
  const handleUnarchive = () => {
    loan.archived = false;
    loan.archivedAt = null;
    markLoansDirty();
    onSaved?.();
  };

  const set = (key, value) => {
    loan[key] = value;
    if (key === 'status') {
      const nextStage = STATUS_TO_STAGE[value];
      if (nextStage) loan.stage = nextStage;
    }
    force((n) => n + 1);
    markLoansDirty();
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

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 720, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">{loan.status || STAGE_TO_STATUS[loan.stage] || loan.stage || 'Loan'}</div>
          <div className="drawer-borrower">{loan.borrower}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            {loan.property || '—'} · {fmt$(loan.amount)}
          </div>
        </div>
        <div className="drawer-body">
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
              <I defaultValue={loan.c2first || ''} onBlur={(e) => set('c2first', e.target.value)} />
            </Field>
            <Field label="Co-Borrower Last">
              <I defaultValue={loan.c2last || ''} onBlur={(e) => set('c2last', e.target.value)} />
            </Field>
            <Field label="Co-Borrower Phone" full>
              <I type="tel" defaultValue={loan.c2phone || ''} onBlur={(e) => set('c2phone', e.target.value)} />
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

          <div style={{ marginTop: 18 }}>
            <Field label="Notes" full>
              <textarea
                defaultValue={loan.notes || ''}
                onBlur={(e) => set('notes', e.target.value)}
                style={{
                  width: '100%', minHeight: 140, padding: 12, fontFamily: 'inherit',
                  fontSize: 13, lineHeight: 1.55, border: '1px solid #d0d0d0',
                  borderRadius: 6, resize: 'vertical', boxSizing: 'border-box',
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
