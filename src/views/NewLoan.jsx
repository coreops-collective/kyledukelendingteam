import { useState, useMemo } from 'react';
import { STAGES, REFI_WATCH_STAGE, PRE_CONTRACT_STAGES, stageByKey } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import { LOANS } from '../data/loans.js';
import { sbInsert } from '../lib/supabase.js';

const LO_OPTIONS = ['Kyle Duke', 'Missy'];

export default function NewLoan() {
  const [form, setForm] = useState({
    lo: '', kind: '', existingId: '', status: '',
    first: '', last: '', co: '', phone: '', email: '',
    type: 'VA', purpose: 'Purchase', amt: '', fico: '', preapp: '',
    agent: '', src: 'Realtor Referral',
    estClose: '',
    addr: '', locked: '', apprNow: '', apprContact: '', apprNotes: '',
    titleCo: '', titleContact: '', hoi: '', closeDate: '', uwPath: '', story: '',
    addrPost: '',
    notes: '',
  });
  const [toast, setToast] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const isPre = PRE_CONTRACT_STAGES.includes(form.status);
  const isContract = form.status === 'fresh';
  const isPost = form.status && !isPre && !isContract;

  const allStatusOptions = useMemo(
    () => [...STAGES, REFI_WATCH_STAGE],
    []
  );

  const existingOptions = useMemo(() => {
    if (form.kind !== 'existing') return [];
    const loFirst = (form.lo || '').split(' ')[0];
    // Only pipeline-stage loans qualify as "existing in pipeline":
    // New Lead, Applied, HOT PA, REFI Watch — i.e. PRE_CONTRACT_STAGES.
    return LOANS
      .filter(l => PRE_CONTRACT_STAGES.includes(l.stage))
      .filter(l => !form.lo || l.lo === loFirst || l.lo === form.lo)
      .sort((a, b) => (a.borrower || '').localeCompare(b.borrower || ''));
  }, [form.kind, form.lo]);

  function loadExisting(id) {
    const loan = LOANS.find(l => l.id === id);
    if (!loan) { setForm(f => ({ ...f, existingId: id })); return; }
    const [lastPart, firstPart] = (loan.borrower || '').split(',').map(s => (s || '').trim());
    setForm(f => ({
      ...f,
      existingId: id,
      first: firstPart || f.first,
      last: lastPart || f.last,
      phone: loan.phone || f.phone,
      email: loan.email || f.email,
      type: loan.type === 'CONV' ? 'Conventional' : (loan.type || f.type),
      purpose: loan.purpose === 'Refi' ? 'Rate/Term Refi' : (loan.purpose || f.purpose),
      amt: loan.amount || f.amt,
      agent: loan.agent || f.agent,
      notes: loan.notes || f.notes,
      status: loan.stage || f.status,
      addr: (loan.property && loan.property !== 'TBD') ? loan.property : f.addr,
      addrPost: (loan.property && loan.property !== 'TBD') ? loan.property : f.addrPost,
    }));
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (!form.first || !form.last) { setToast({ title: 'Missing fields', msg: 'First and last name required' }); return; }
    const num = (v) => { const n = parseFloat(String(v).replace(/[,$]/g, '')); return isNaN(n) ? null : n; };
    const propAddr = isContract ? form.addr : (isPre ? null : form.addrPost);
    const row = {
      client_kind: form.kind || 'new',
      existing_loan_id: form.kind === 'existing' ? (form.existingId || null) : null,
      borrower_first: form.first, borrower_last: form.last,
      co_borrower: form.co || null, phone: form.phone || null, email: form.email || null,
      loan_officer: form.lo || null, loan_type: form.type || null, purpose: form.purpose || null,
      estimated_amount: num(form.amt),
      credit_score: num(form.fico) ? Math.round(num(form.fico)) : null,
      pre_approval_amount: num(form.preapp),
      property_address: propAddr || null,
      estimated_close_date: isPre ? (form.estClose || null) : null,
      agent: form.agent || null, lead_source: form.src || null,
      status_notes: form.notes || '',
      stage: form.status || 'new',
      is_locked: isContract ? (form.locked || null) : null,
      order_appraisal_now: isContract ? (form.apprNow || null) : null,
      appraisal_contact: isContract ? (form.apprContact || null) : null,
      appraisal_notes: isContract ? (form.apprNotes || null) : null,
      title_company: isContract ? (form.titleCo || null) : null,
      title_contact: isContract ? (form.titleContact || null) : null,
      hoi_company: isContract ? (form.hoi || null) : null,
      closing_date: isContract ? (form.closeDate || null) : null,
      underwriting_path: isContract ? (form.uwPath || null) : null,
      borrower_story: isContract ? (form.story || null) : null,
    };
    setToast({ title: 'New Loan Intake', msg: `${form.first} ${form.last} submitted — notifying recipients` });
    await sbInsert('loan_intakes', row);
    // Fire-and-forget notification (email rules configured in Setup).
    fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'loan.created', context: row }),
    }).catch(() => { /* silent */ });
  }

  return (
    <div>
      <div className="notify-chip"><span className="notify-chip-dot" />On submit → saved to database + notifies LOA Amber Chen</div>
      <div className="form-card">
        <div className="section-header">
          <div className="section-title">New Loan Intake</div>
          <div className="section-sub">Loan Officer submits → LOA assigned automatically</div>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-field">
            <label className="req">Loan Officer</label>
            <select value={form.lo} onChange={set('lo')} required>
              <option value="">— Select —</option>
              {LO_OPTIONS.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="req">Is this a new client or existing in the pipeline?</label>
            <select value={form.kind} onChange={set('kind')} required>
              <option value="">— Select —</option>
              <option value="new">New client</option>
              <option value="existing">Existing in pipeline</option>
            </select>
          </div>

          {form.kind === 'existing' && (
            <div className="form-field full">
              <label className="req">Existing Client</label>
              <select value={form.existingId} onChange={(e) => loadExisting(e.target.value)}>
                <option value="">— Select a client —</option>
                {existingOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.borrower} — {stageByKey(l.stage)?.label || l.stage}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.kind && (
            <div className="form-field full">
              <label className="req">Status</label>
              <select value={form.status} onChange={set('status')}>
                <option value="">— Select —</option>
                {allStatusOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div className="form-field"><label className="req">Borrower First Name</label><input value={form.first} onChange={set('first')} required /></div>
          <div className="form-field"><label className="req">Borrower Last Name</label><input value={form.last} onChange={set('last')} required /></div>
          <div className="form-field"><label>Co-Borrower (if any)</label><input value={form.co} onChange={set('co')} /></div>
          <div className="form-field"><label className="req">Phone</label><input type="tel" value={form.phone} onChange={set('phone')} required /></div>
          <div className="form-field full"><label className="req">Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
          <div className="form-field"><label className="req">Loan Type</label>
            <select value={form.type} onChange={set('type')} required>
              <option>VA</option><option>FHA</option><option>Conventional</option><option>Jumbo</option><option>Non-QM</option>
            </select>
          </div>
          <div className="form-field"><label className="req">Purpose</label>
            <select value={form.purpose} onChange={set('purpose')} required>
              <option>Purchase</option><option>Rate/Term Refi</option><option>Cash-Out Refi</option>
            </select>
          </div>
          <div className="form-field"><label>Estimated Loan Amount</label><input value={form.amt} onChange={set('amt')} /></div>
          <div className="form-field"><label>Estimated Credit Score</label><input value={form.fico} onChange={set('fico')} /></div>
          <div className="form-field"><label>Pre-Approval Amount</label><input value={form.preapp} onChange={set('preapp')} /></div>
          <div className="form-field"><label>Real Estate Agent</label>
            <select value={form.agent} onChange={set('agent')}>
              <option value="">— Select an agent —</option>
              {[...PARTNERS].sort((a,b) => a.name.localeCompare(b.name)).map(p => <option key={p.name}>{p.name}</option>)}
              <option value="__new__">+ Add new agent...</option>
            </select>
          </div>
          <div className="form-field"><label>Lead Source</label>
            <select value={form.src} onChange={set('src')}>
              <option>Realtor Referral</option><option>Past Client</option><option>Self-Generated</option><option>Zillow</option><option>Veteran Network</option><option>Open House</option><option>Other</option>
            </select>
          </div>

          {isPre && (
            <div className="form-field full"><label>Est. Closing Date</label><input type="date" value={form.estClose} onChange={set('estClose')} /></div>
          )}

          {isContract && (
            <div className="form-field full">
              <div className="section-header" style={{ marginTop: 8 }}><div className="section-title">New Contract Details</div></div>
              <div className="form-grid">
                <div className="form-field full"><label className="req">Property Address</label><input value={form.addr} onChange={set('addr')} /></div>
                <div className="form-field"><label>Is it locked?</label>
                  <select value={form.locked} onChange={set('locked')}><option value="">—</option><option>Yes</option><option>No</option></select>
                </div>
                <div className="form-field"><label>Order appraisal right away?</label>
                  <select value={form.apprNow} onChange={set('apprNow')}><option value="">—</option><option>Yes</option><option>No</option></select>
                </div>
                <div className="form-field full"><label>Appraisal Contact</label><input value={form.apprContact} onChange={set('apprContact')} placeholder="Name / phone / email" /></div>
                <div className="form-field full"><label>Appraisal Notes</label><textarea value={form.apprNotes} onChange={set('apprNotes')} /></div>
                <div className="form-field"><label>Title Company</label><input value={form.titleCo} onChange={set('titleCo')} /></div>
                <div className="form-field"><label>Title Contact Info</label><input value={form.titleContact} onChange={set('titleContact')} placeholder="Name / phone / email" /></div>
                <div className="form-field"><label>HOI Company</label><input value={form.hoi} onChange={set('hoi')} /></div>
                <div className="form-field"><label>Closing Date</label><input type="date" value={form.closeDate} onChange={set('closeDate')} /></div>
                <div className="form-field"><label>Underwriting Path</label>
                  <select value={form.uwPath} onChange={set('uwPath')}><option value="">—</option><option>Manual</option><option>Approved / Eligible</option></select>
                </div>
                <div className="form-field full"><label>Borrower / Loan Story</label>
                  <textarea value={form.story} onChange={set('story')} placeholder="Quick to send docs? Situations to be aware of? Best way to contact them?" />
                </div>
              </div>
            </div>
          )}

          {isPost && (
            <div className="form-field full"><label>Property Address</label><input value={form.addrPost} onChange={set('addrPost')} /></div>
          )}

          <div className="form-field full"><label>Other Notes</label><textarea value={form.notes} onChange={set('notes')} /></div>
        </form>
        <div className="form-actions">
          <button className="form-btn secondary" type="button" onClick={() => setForm(f => ({ ...f, lo: '', kind: '', existingId: '', status: '' }))}>Cancel</button>
          <button className="form-btn primary" type="button" onClick={submit}>Submit & Notify LOA</button>
        </div>
      </div>
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <div className="toast-title">{toast.title}</div>
          <div>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
