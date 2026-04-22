import { useMemo, useState } from 'react';
import { computeMortgage, fmt$, LOGO_SVG } from '../lib/mortgage.js';

const EMBED_CODE = `<iframe src="https://thekyleduketeam.com/?embed=mortgage-calc" width="100%" height="700" frameborder="0" style="border:1px solid #ddd;border-radius:8px;max-width:760px"></iframe>`;

export default function MortgageCalc() {
  const [s, setS] = useState({
    price: 425000, down: 85000, rate: 6.625, term: 30, tax: 5400, ins: 1800, hoa: 0,
    loanType: 'Conventional', vaFirstUse: true, vaExempt: false,
  });

  const r = useMemo(() => computeMortgage(s), [s]);

  const upd = (k, v) => {
    if (k === 'loanType') { setS(p => ({ ...p, loanType: v })); return; }
    if (k === 'term') { setS(p => ({ ...p, term: parseInt(v) || 30 })); return; }
    if (typeof v === 'boolean') { setS(p => ({ ...p, [k]: v })); return; }
    setS(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  };

  const copyEmbed = () => {
    const code = `<iframe src="https://thekyleduketeam.com/?embed=mortgage-calc" width="100%" height="640" frameborder="0" style="border:1px solid #ddd;border-radius:8px;max-width:760px"></iframe>`;
    if (navigator.clipboard) navigator.clipboard.writeText(code);
  };

  return (
    <div className="calc-wrap">
      <div>
        <div className="form-card">
          <div className="section-header">
            <div className="section-title">Mortgage Calculator</div>
            <div className="section-sub">The Kyle Duke Team &middot; Fannie Mae / Freddie Mac / VA guidelines</div>
          </div>
          <div style={{ padding: 20 }}>
            <div className="calc-input-row">
              <div className="form-field">
                <label>Loan Type</label>
                <select value={s.loanType} onChange={e => upd('loanType', e.target.value)}>
                  <option>Conventional</option>
                  <option>FHA</option>
                  <option>VA</option>
                </select>
              </div>
              <div className="form-field">
                <label>Loan Term (years)</label>
                <select value={s.term} onChange={e => upd('term', e.target.value)}>
                  <option value="30">30 years</option>
                  <option value="20">20 years</option>
                  <option value="15">15 years</option>
                  <option value="10">10 years</option>
                </select>
              </div>
            </div>
            <div className="calc-input-row">
              <div className="form-field"><label>Home Price</label><input type="number" value={s.price} onChange={e => upd('price', e.target.value)} /></div>
              <div className="form-field"><label>Down Payment</label><input type="number" value={s.down} onChange={e => upd('down', e.target.value)} /></div>
            </div>
            <div className="calc-input-row">
              <div className="form-field"><label>Interest Rate (%)</label><input type="number" step="0.001" value={s.rate} onChange={e => upd('rate', e.target.value)} /></div>
              <div className="form-field"><label>LTV</label><input value={`${r.ltv.toFixed(1)}%`} disabled style={{ background: '#f4f4f6' }} /></div>
            </div>
            <div className="calc-input-row">
              <div className="form-field"><label>Property Tax (yr)</label><input type="number" value={s.tax} onChange={e => upd('tax', e.target.value)} /></div>
              <div className="form-field"><label>Home Insurance (yr)</label><input type="number" value={s.ins} onChange={e => upd('ins', e.target.value)} /></div>
            </div>
            <div className="calc-input-row">
              <div className="form-field"><label>HOA (mo)</label><input type="number" value={s.hoa} onChange={e => upd('hoa', e.target.value)} /></div>
              <div className="form-field"><label>Down % (auto)</label><input value={`${r.downPct.toFixed(1)}%`} disabled style={{ background: '#f4f4f6' }} /></div>
            </div>
            {s.loanType === 'VA' && (
              <div className="calc-input-row">
                <div className="form-field">
                  <label>VA Loan Use</label>
                  <select value={s.vaFirstUse !== false ? 'true' : 'false'} onChange={e => upd('vaFirstUse', e.target.value === 'true')}>
                    <option value="true">First Use</option>
                    <option value="false">Subsequent Use</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Funding Fee Exempt</label>
                  <select value={s.vaExempt === true ? 'true' : 'false'} onChange={e => upd('vaExempt', e.target.value === 'true')}>
                    <option value="false">No</option>
                    <option value="true">Yes (SC disability)</option>
                  </select>
                </div>
              </div>
            )}
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

      <div id="mtgCalcResult" className="calc-result">
        <div style={{ width: 64, height: 64, margin: '0 auto 14px', color: '#fff' }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', fontSize: 12, color: '#fff', textAlign: 'center', marginBottom: 2 }}>The Kyle Duke Team</div>
        <div style={{ fontSize: 9, color: '#888', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 16 }}>Powered by Valor Home Loans</div>
        <div className="calc-result-label">Estimated Monthly Payment</div>
        <div className="calc-result-value">{fmt$(Math.round(r.total))}</div>
        <div className="calc-result-sub">{r.loanType} &middot; {fmt$(Math.round(r.totalLoanAmt))} loan &middot; {r.ltv.toFixed(1)}% LTV</div>
        <div className="calc-result-row"><span className="lbl">Principal &amp; Interest</span><span className="val">{fmt$(Math.round(r.pi))}</span></div>
        <div className="calc-result-row"><span className="lbl">Property Tax</span><span className="val">{fmt$(Math.round(r.taxM))}</span></div>
        <div className="calc-result-row"><span className="lbl">Home Insurance</span><span className="val">{fmt$(Math.round(r.insM))}</span></div>
        {r.hoaM > 0 && (<div className="calc-result-row"><span className="lbl">HOA</span><span className="val">{fmt$(Math.round(r.hoaM))}</span></div>)}
        {r.miM > 0 && (<div className="calc-result-row"><span className="lbl">{r.miLabel}</span><span className="val">{fmt$(Math.round(r.miM))}</span></div>)}
        <div className="calc-result-row total"><span className="lbl">Total Monthly</span><span className="val">{fmt$(Math.round(r.total))}</span></div>
        {r.upfrontFee > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #333', fontSize: 10, color: '#aaa' }}>
            <strong style={{ color: '#fff' }}>{r.upfrontLabel}:</strong> {fmt$(Math.round(r.upfrontFee))}<br />
            <span style={{ color: '#888' }}>Rolled into loan amount</span>
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #333', fontSize: 10, color: '#888', textAlign: 'center' }}>
          The Kyle Duke Team &middot; NMLS #2172565<br />Estimate only. Actual payment may vary.
        </div>
      </div>
    </div>
  );
}
