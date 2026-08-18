import { useState } from 'react';
import {
  CFL_STATUSES, CFL_STATUS_LABELS, setClientCflStatus,
} from '../lib/clientProfiles.js';

// CFL status control — three pills (Active / Do Not Contact / Archived)
// + optional reason. Setting anything other than Active removes the
// client from the CFL follow-up board immediately (their tasks stop
// generating), while leaving their record + stats intact. Rendered on
// both the Client for Life client card and the All Loans past-client
// drawer, both writing the same client_profiles.cfl_status field so
// they stay in sync automatically.
export default function CflStatusRow({ profile, clientName, onChanged }) {
  const current = profile?.cfl_status || 'active';
  const [saving, setSaving] = useState(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState(profile?.cfl_status_reason || '');

  const setStatus = async (nextStatus) => {
    if (nextStatus === current && !reasonOpen) return;
    setSaving(nextStatus);
    await setClientCflStatus(clientName, nextStatus, reason.trim());
    setSaving(null);
    setReasonOpen(false);
    onChanged?.();
  };

  const bg = {
    active: '#e8f5e9',
    do_not_contact: '#fdecea',
    archived: '#f4f4f4',
  }[current] || '#fff';
  const border = {
    active: '#a5d6a7',
    do_not_contact: '#f5cccc',
    archived: '#d0d0d0',
  }[current] || '#e5e5e5';

  return (
    <div style={{
      marginBottom: 18, padding: 12,
      background: bg, border: `1px solid ${border}`, borderRadius: 8,
    }}>
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: reasonOpen ? 10 : 0,
      }}>
        <span style={{
          fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.6px', color: '#555',
          marginRight: 6,
        }}>CFL status</span>
        {CFL_STATUSES.map((s) => {
          const on = s === current;
          const isPending = saving === s;
          return (
            <button
              key={s}
              type="button"
              disabled={!!saving}
              onClick={() => {
                if (s === 'active') return setStatus('active');
                setReasonOpen(true);
                setSaving(null);
              }}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700,
                fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                border: `1px solid ${on ? '#0A0A0A' : '#d0d0d0'}`,
                background: on ? '#0A0A0A' : '#fff',
                color: on ? '#fff' : '#555',
                borderRadius: 999, cursor: saving ? 'wait' : 'pointer',
              }}
            >{isPending ? 'Saving…' : CFL_STATUS_LABELS[s]}</button>
          );
        })}
        {current !== 'active' && profile?.cfl_status_reason && !reasonOpen && (
          <span style={{ fontSize: 11, color: '#666', marginLeft: 4, fontStyle: 'italic' }}>
            "{profile.cfl_status_reason}"
          </span>
        )}
      </div>
      {reasonOpen && (
        <div style={{ marginTop: 6 }}>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason (moved out of state, passed away, requested no contact, etc.)"
            style={{
              width: '100%', padding: '8px 10px', fontSize: 12,
              border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box',
              marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { setReasonOpen(false); setReason(profile?.cfl_status_reason || ''); }}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700,
                fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                background: '#fff', color: '#555', border: '1px solid #d0d0d0',
                borderRadius: 4, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              type="button"
              onClick={() => setStatus('do_not_contact')}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700,
                fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                background: '#c62828', color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer',
              }}
            >Do Not Contact</button>
            <button
              type="button"
              onClick={() => setStatus('archived')}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700,
                fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                background: '#555', color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer',
              }}
            >Archive</button>
          </div>
        </div>
      )}
    </div>
  );
}
