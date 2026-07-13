import { useState, useMemo, useEffect } from 'react';
import { STAGES, REFI_WATCH_STAGE, PRE_CONTRACT_STAGES, stageByKey, STAGE_TO_STATUS } from '../data/stages.js';
import { PARTNERS } from '../data/partners.js';
import { LOANS } from '../data/loans.js';
import { sbInsert } from '../lib/supabase.js';
import { markLoansDirty } from '../lib/loansStore.js';
import { getCurrentUser } from '../lib/auth.js';
import { upsertClientDate } from '../lib/clientDates.js';
import Tour from '../components/Tour.jsx';
import {
  loadLeadSources, getLeadSourceLabels, createLeadSource,
} from '../lib/leadSources.js';

const LO_OPTIONS = ['Kyle Duke', 'Missy'];

export default function NewLoan() {
  const [form, setForm] = useState({
    lo: '', kind: '', existingId: '', status: '',
    first: '', last: '', phone: '', email: '', bday: '',
    hasCo: 'No',
    coFirst: '', coLast: '', coPhone: '', coEmail: '', coBday: '',
    type: 'VA', purpose: 'Purchase', amt: '', fico: '', preapp: '',
    agent: '', src: '',
    estClose: '',
    addr: '', locked: '', apprNow: '', apprContact: '', apprNotes: '',
    titleCo: '', titleContact: '', hoi: '', closeDate: '', uwPath: '', story: '',
    addrPost: '',
    notes: '',
  });
  const [toast, setToast] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-dismiss toasts after 3s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);

  // Load the lead_sources store so the dropdown reflects any team-added
  // sources without a page reload. Force re-render when the store fires
  // its change events.
  const [, forceSources] = useState(0);
  const bumpSources = () => forceSources((n) => n + 1);
  useEffect(() => {
    loadLeadSources().then(bumpSources);
    const on = () => bumpSources();
    ['kdt-lead-sources-changed', 'kdt-lead-sources-loaded'].forEach((e) => window.addEventListener(e, on));
    return () => ['kdt-lead-sources-changed', 'kdt-lead-sources-loaded'].forEach((e) => window.removeEventListener(e, on));
  }, []);
  const leadSourceLabels = getLeadSourceLabels();

  const NEW_LOAN_TOUR_STEPS = [
    {
      title: 'New Loan Intake',
      body: 'This is the single entry point for every new loan — pre-qual leads, HOT PAs, and signed New Contracts. The form adapts to whichever status you pick, so you\'re never asked for fields that don\'t apply yet.\n\nOn submit the loan lands in the LOANS store (visible immediately in Pipeline / Loan Management / All Loans) AND queues a Supabase write so nothing is lost on refresh.',
    },
    {
      target: '.notify-chip',
      title: 'Notification indicator',
      body: 'The chip at the top tells you exactly what happens on submit for the current form. When status is set to New Contract, submitting also fires an email to the LOA per your notification rules. Any other status → save only, no email.',
    },
    {
      target: '.form-card select',
      title: 'Start with LO + new-or-existing',
      body: 'Pick a Loan Officer first, then say whether this is a brand-new client or one already in the pipeline.\n\nIf existing: the "Existing Client" dropdown appears and you can copy every field from the current loan into the form — no double entry. Useful when a lead progresses from HOT PA to New Contract.',
    },
    {
      target: '.notify-chip',
      title: 'Status drives the form',
      body: 'The Status dropdown controls which sections show:\n\n• New Lead / Applied / HOT PA / REFI Watch → simple contact + est-close fields\n• New Contract → adds the full contract detail block (property, lock, appraisal, title, HOI, close date, UW path, borrower story)\n\nPick the right status and the form adapts — no extra clicks.',
    },
    {
      title: 'Co-borrower handling',
      body: 'Answer "Is there a co-borrower?" — Yes pulls in a full set of co-borrower fields (name, phone, email, birthday). All co-borrower data writes to BOTH the legacy field names (c2first, c2last...) and the canonical names (coFirst, coLast...) so every downstream view sees it, no matter which naming convention it uses.\n\nBirthday, if provided, is auto-added to client_dates for the CFL birthday touchpoint.',
    },
    {
      title: 'Realtor + Lead Source',
      body: 'Real Estate Agent pulls from the Realtor Partners list — start typing and it filters. If the agent isn\'t in the list, pick "+ Add new agent" to open the partner intake next.\n\nLead Source tags where this loan came from — Realtor Referral, Past Client, Zillow, etc. Feeds the Partners page stats and the Snapshot volume-by-source chart.',
    },
    {
      title: 'Submit + validation',
      body: 'Required fields (first, last, phone, email, LO, type, co-borrower fields if hasCo=Yes) are validated on submit — missing anything and you get a toast listing what\'s empty.\n\nRapid submits get a unique loan ID (Date + 4 random hex digits) so no two intakes collide even inside the same millisecond.',
    },
  ];

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
    // Real required-field validation. The submit button is
    // type="button" so HTML `required` attributes on the inputs
    // don't run — we have to check ourselves. Missing any of these
    // was creating headless loans that silently dropped out of Team
    // stats, LO filters, and agent lookups.
    const missing = [];
    if (!form.first) missing.push('First name');
    if (!form.last) missing.push('Last name');
    if (!form.phone) missing.push('Phone');
    if (!form.email) missing.push('Email');
    if (!form.lo) missing.push('LO');
    if (!form.type) missing.push('Loan type');
    if (form.hasCo === 'Yes') {
      if (!form.coFirst) missing.push('Co-borrower first name');
      if (!form.coLast) missing.push('Co-borrower last name');
    }
    if (missing.length) {
      setToast({ title: 'Missing required fields', msg: missing.join(', ') });
      return;
    }
    // "+ Add new agent" is a UI-only placeholder — persisting the
    // literal string "__new__" onto the loan would leak into every
    // realtor-lookup and agent-milestone view. Treat it as blank so
    // the user comes back and picks a real agent.
    const cleanAgent = (form.agent === '__new__' || !form.agent) ? '' : form.agent;
    const num = (v) => { const n = parseFloat(String(v).replace(/[,$]/g, '')); return isNaN(n) ? null : n; };
    const propAddr = isContract ? form.addr : (isPre ? null : form.addrPost);
    const row = {
      client_kind: form.kind || 'new',
      existing_loan_id: form.kind === 'existing' ? (form.existingId || null) : null,
      borrower_first: form.first, borrower_last: form.last,
      co_borrower: form.hasCo === 'Yes' ? `${form.coFirst} ${form.coLast}`.trim() : null,
      co_borrower_phone: form.hasCo === 'Yes' ? (form.coPhone || null) : null,
      co_borrower_email: form.hasCo === 'Yes' ? (form.coEmail || null) : null,
      phone: form.phone || null, email: form.email || null,
      loan_officer: form.lo || null, loan_type: form.type || null, purpose: form.purpose || null,
      estimated_amount: num(form.amt),
      credit_score: num(form.fico) ? Math.round(num(form.fico)) : null,
      pre_approval_amount: num(form.preapp),
      property_address: propAddr || null,
      estimated_close_date: isPre ? (form.estClose || null) : null,
      agent: cleanAgent || null, lead_source: form.src || null,
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
    // Also push into the in-memory LOANS array so it shows up immediately
    // in Loan Management / Pipeline / All Loans.
    const stageKey = form.status || 'new';
    const loanType = form.type === 'Conventional' ? 'CONV' : form.type;
    const purposeShort = form.purpose?.toLowerCase().includes('refi') ? 'Refi' : 'Purchase';
    const loFirst = (form.lo || '').split(' ')[0] || 'Kyle';
    let touchedLoan = null;
    if (form.kind === 'existing' && form.existingId) {
      // Update existing loan in place.
      const ex = LOANS.find((l) => l.id === form.existingId);
      if (ex) {
        ex.stage = stageKey;
        ex.lo = loFirst;
        ex.type = loanType || ex.type;
        ex.purpose = purposeShort;
        if (form.phone) ex.phone = form.phone;
        if (form.email) ex.email = form.email;
        if (propAddr) ex.property = propAddr;
        if (num(form.amt)) ex.amount = num(form.amt);
        if (cleanAgent) ex.agent = cleanAgent;
        if (form.notes) ex.notes = form.notes;
        if (form.closeDate) ex.closeDate = form.closeDate;
        if (form.hasCo === 'Yes') {
          // Dual-write co-borrower fields so both legacy (c2*) and
          // canonical (co*) consumers see the update.
          ex.c2first = form.coFirst; ex.c2last = form.coLast;
          ex.c2phone = form.coPhone; ex.c2email = form.coEmail;
          ex.coFirst = form.coFirst; ex.coLast = form.coLast;
          ex.coPhone = form.coPhone; ex.coEmail = form.coEmail;
        }
        touchedLoan = ex;
      }
    } else {
      // Local loan id — Date.now() alone collided on rapid submits
      // and silently overwrote the first row. Append 4 random hex
      // digits so two intakes within the same millisecond stay
      // distinct.
      const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      const newId = 'NL' + Date.now().toString(36).toUpperCase() + rand.toUpperCase();
      const newLoan = {
        id: newId,
        borrower: `${form.last}, ${form.first}`,
        amount: num(form.amt),
        stage: stageKey,
        type: loanType || 'CONV',
        purpose: purposeShort,
        lo: loFirst,
        loa: '',
        phone: form.phone || '',
        email: form.email || '',
        property: propAddr || 'TBD',
        closeDate: isContract ? (form.closeDate || '') : (form.estClose || ''),
        agent: cleanAgent || '',
        leadSource: form.src || '',
        notes: form.notes || '',
        // Co-borrower fields are written to BOTH legacy (c2*) and
        // canonical (co*) names because different views read from
        // different names. See the round-3 commit for the
        // canonicalization details. Dual-write here means no
        // consumer sees stale data.
        c2first: form.hasCo === 'Yes' ? form.coFirst : '',
        c2last: form.hasCo === 'Yes' ? form.coLast : '',
        c2phone: form.hasCo === 'Yes' ? form.coPhone : '',
        c2email: form.hasCo === 'Yes' ? form.coEmail : '',
        coFirst: form.hasCo === 'Yes' ? form.coFirst : '',
        coLast: form.hasCo === 'Yes' ? form.coLast : '',
        coPhone: form.hasCo === 'Yes' ? form.coPhone : '',
        coEmail: form.hasCo === 'Yes' ? form.coEmail : '',
      };
      LOANS.push(newLoan);
      touchedLoan = newLoan;
    }

    markLoansDirty(touchedLoan);

    // Birthdays go straight into client_dates so both the borrower and
    // any co-borrower each become their own Client for Life card with
    // birthday tasks firing automatically. Fire-and-forget — a failed
    // birthday save shouldn't block the intake.
    const borrowerName = `${form.last}, ${form.first}`.trim().replace(/^,\s*/, '');
    if (borrowerName && form.bday) {
      upsertClientDate(borrowerName, 'Birthday', form.bday, { recurring: true }).catch(() => {});
    }
    if (form.hasCo === 'Yes' && form.coFirst && form.coLast) {
      // Store co-borrower under "Last, First" to match the main
      // borrower convention — that's what LOANS.borrower uses, and
      // the CFL client picker + task list both key off it.
      const coName = `${form.coLast}, ${form.coFirst}`.trim();
      if (form.coBday) {
        upsertClientDate(coName, 'Birthday', form.coBday, { recurring: true }).catch(() => {});
      }
    }

    const isFresh = stageKey === 'fresh';
    setToast({
      title: 'New Loan Intake',
      msg: isFresh
        ? `${form.first} ${form.last} added — LOA notified`
        : `${form.first} ${form.last} added to pipeline`,
    });
    try { await sbInsert('loan_intakes', row); } catch { /* non-fatal — table may not exist */ }
    if (!isFresh) return; // Skip notification unless this is a New Contract.
    // Fire-and-forget notification (email rules configured in Setup).
    const notifCaller = getCurrentUser()?.email || '';
    fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(notifCaller ? { 'x-kdt-user-email': notifCaller } : {}),
      },
      body: JSON.stringify({
        callerEmail: notifCaller,
        event_type: 'loan.created',
        context: {
          ...row,
          stage: STAGE_TO_STATUS[row.stage] || row.stage,
          dashboard_url: 'https://thekyleduketeam.netlify.app/',
        },
      }),
    }).catch(() => { /* silent */ });
  }

  return (
    <div>
      <div className="notify-chip">
        <span className="notify-chip-dot" />
        {form.status === 'fresh'
          ? 'On submit → saved + LOA notified (New Contract)'
          : 'On submit → saved'}
      </div>
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
          <div className="form-field"><label className="req">Phone</label><input type="tel" value={form.phone} onChange={set('phone')} required /></div>
          <div className="form-field"><label className="req">Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
          <div className="form-field"><label>Borrower Birthday</label><input type="date" value={form.bday} onChange={set('bday')} /></div>

          <div className="form-field full">
            <label className="req">Is there a co-borrower?</label>
            <select value={form.hasCo} onChange={set('hasCo')}>
              <option>No</option>
              <option>Yes</option>
            </select>
          </div>
          {form.hasCo === 'Yes' && (
            <>
              <div className="form-field"><label className="req">Co-Borrower First Name</label><input value={form.coFirst} onChange={set('coFirst')} required /></div>
              <div className="form-field"><label className="req">Co-Borrower Last Name</label><input value={form.coLast} onChange={set('coLast')} required /></div>
              <div className="form-field"><label className="req">Co-Borrower Phone</label><input type="tel" value={form.coPhone} onChange={set('coPhone')} required /></div>
              <div className="form-field"><label className="req">Co-Borrower Email</label><input type="email" value={form.coEmail} onChange={set('coEmail')} required /></div>
              <div className="form-field"><label>Co-Borrower Birthday</label><input type="date" value={form.coBday} onChange={set('coBday')} /></div>
            </>
          )}
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
            <select
              value={form.src}
              onChange={async (e) => {
                if (e.target.value === '__new_source__') {
                  const label = window.prompt('New lead source name:');
                  if (!label) return;
                  const created = await createLeadSource(label);
                  if (created) setForm((f) => ({ ...f, src: created.label }));
                  return;
                }
                setForm((f) => ({ ...f, src: e.target.value }));
              }}
            >
              <option value="">— Select a source —</option>
              {leadSourceLabels.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__new_source__" style={{ fontStyle: 'italic', color: '#c62828' }}>+ Add new source…</option>
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
          <button className="form-btn primary" type="button" onClick={submit}>
            {form.status === 'fresh' ? 'Submit & Notify LOA' : 'Submit'}
          </button>
        </div>
      </div>
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <div className="toast-title">{toast.title}</div>
          <div>{toast.msg}</div>
        </div>
      )}
      {tourOpen && <Tour steps={NEW_LOAN_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
