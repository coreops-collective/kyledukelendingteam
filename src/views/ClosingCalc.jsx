import { useMemo, useState } from 'react';
import { computeClosing, fmt$, LOGO_SVG } from '../lib/mortgage.js';

const EMBED_CODE = `<iframe src="https://thekyleduketeam.com/?embed=closing-calc" width="100%" height="700" frameborder="0" style="border:1px solid #ddd;border-radius:8px;max-width:760px"></iframe>`;

export default function ClosingCalc() {
  const [s, setS] = useState({ price: 425000, loan: 340000, state: 'FL', type: 'Conventional' });

  const r = useMemo(() => computeClosing(s), [s]);

  const upd = (k, v) => {
    const parsed = isNaN(parseFloat(v)) ? v : parseFloat(v);
    setS(p => ({ ...p, [k]: parsed }));
  };

  const copyEmbed = () => {
    const code = `<iframe src="https://thekyleduketeam.com/?embed=closing-calc" width="100%" height="640" frameborder="0" style="border:1px solid #ddd;border-radius:8px;max-width:760px"></iframe>`;
    if (navigator.clipboard) navigator.clipboard.writeText(code);
  };

  return (
    <div className="calc-wrap">
      <div>
        <div className="form-card">
          <div className="section-header">
            <div className="section-title">Closing Costs Calculator</div>
            <div className="section-sub">The Kyle Duke Team &middot; estimated cash to close</div>
          </div>
          <div style={{ padding: 20 }}>
            <div className="calc-input-row">
              <div className="form-field"><label>Home Price</label><input type="number" value={s.price} onChange={e => upd('price', e.target.value)} /></div>
              <div className="form-field"><label>Loan Amount</label><input type="number" value={s.loan} onChange={e => upd('loan', e.target.value)} /></div>
            </div>
            <div className="calc-input-row">
              <div className="form-field">
                <label>State</label>
                <select value={s.state} onChange={e => upd('state', e.target.value)}>
                  <option>FL</option>
                  <option>NC</option>
                  <option>SC</option>
                  <option>GA</option>
                  <option>TX</option>
                  <option>CO</option>
                  <option>TN</option>
                </select>
              </div>
              <div className="form-field">
                <label>Loan Type</label>
                <select value={s.type} onChange={e => upd('type', e.target.value)}>
                  <option>Conventional</option>
                  <option>VA</option>
                  <option>FHA</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic', paddingTop: 8 }}>Estimates based on national averages plus state-specific transfer tax. Final costs depend on your specific lender, title company, and closing date.</div>
          </div>
        </div>
        <div className="form-card">
          <div className="section-header">
            <div className="section-title">Embed on Your Website</div>
            <div className="section-sub">Copy &amp; paste this iframe code anywhere</div>
          </div>
          <div style={{ padding: 20 }}>
            <div className="embed-box">{EMBED_CODE}</div>
            <button className="embed-copy" onClick={copyEmbed}>Copy Embed Code</button>
          </div>
        </div>
      </div>

      <div id="closeCalcResult" className="calc-result">
        <div style={{ width: 64, height: 64, margin: '0 auto 14px', color: '#fff' }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', fontSize: 12, color: '#fff', textAlign: 'center', marginBottom: 2 }}>The Kyle Duke Team</div>
        <div style={{ fontSize: 9, color: '#888', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 16 }}>Powered by Valor Home Loans</div>
        <div className="calc-result-label">Estimated Cash to Close</div>
        <div className="calc-result-value">{fmt$(Math.round(r.totalCash))}</div>
        <div className="calc-result-sub">closing costs + down payment</div>
        <div className="calc-result-row"><span className="lbl">Lender Fees</span><span className="val">{fmt$(Math.round(r.lenderFees))}</span></div>
        <div className="calc-result-row"><span className="lbl">Appraisal</span><span className="val">{fmt$(r.appraisal)}</span></div>
        <div className="calc-result-row"><span className="lbl">Credit Report</span><span className="val">{fmt$(r.credit)}</span></div>
        <div className="calc-result-row"><span className="lbl">Title Search</span><span className="val">{fmt$(r.titleSearch)}</span></div>
        <div className="calc-result-row"><span className="lbl">Lender Title Ins</span><span className="val">{fmt$(Math.round(r.titleIns))}</span></div>
        <div className="calc-result-row"><span className="lbl">Owner Title Ins</span><span className="val">{fmt$(Math.round(r.ownerTitle))}</span></div>
        <div className="calc-result-row"><span className="lbl">Transfer Tax ({s.state})</span><span className="val">{fmt$(Math.round(r.transferTax))}</span></div>
        <div className="calc-result-row"><span className="lbl">Recording</span><span className="val">{fmt$(r.recording)}</span></div>
        <div className="calc-result-row"><span className="lbl">Survey</span><span className="val">{fmt$(r.survey)}</span></div>
        <div className="calc-result-row"><span className="lbl">Inspection</span><span className="val">{fmt$(r.inspection)}</span></div>
        <div className="calc-result-row"><span className="lbl">Escrow Tax (6mo)</span><span className="val">{fmt$(Math.round(r.escrowTax))}</span></div>
        <div className="calc-result-row"><span className="lbl">Escrow Ins (12mo)</span><span className="val">{fmt$(Math.round(r.escrowIns))}</span></div>
        <div className="calc-result-row"><span className="lbl">Prepaid Interest</span><span className="val">{fmt$(Math.round(r.prepaidInterest))}</span></div>
        <div className="calc-result-row total"><span className="lbl">Closing Costs</span><span className="val">{fmt$(Math.round(r.total))}</span></div>
        <div className="calc-result-row"><span className="lbl">+ Down Payment</span><span className="val">{fmt$(s.price - s.loan)}</span></div>
        <div className="calc-result-row total"><span className="lbl">Total Cash to Close</span><span className="val">{fmt$(Math.round(r.totalCash))}</span></div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #333', fontSize: 10, color: '#888', textAlign: 'center' }}>
          The Kyle Duke Team &middot; NMLS #2172565<br />Estimate only. Final figures provided in your Loan Estimate.
        </div>
      </div>
    </div>
  );
}
