import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PARTNERS } from '../data/partners.js';
import { generateTasksForClient } from '../lib/workflows.js';
import { getAllDates, parseLocalDate } from '../lib/clientDates.js';
import { subscribePartners } from '../lib/partnersStore.js';
import { subscribeLoans } from '../lib/loansStore.js';

// Agent for Life — the realtor-partner mirror of Client for Life.
// Reads live from PARTNERS + client_dates + LOANS via the same generator
// CFL uses, and adds:
//   - a "Birthdays Coming Up" panel at the top, showing partner
//     birthdays in the next N days (default 14, similar shape to CFL's
//     BirthdaysPanel)
//   - inline expansion on every agent name/card that surfaces the
//     agent's mailing address + phone + email + birthday so the LO /
//     LOA can send a card without leaving the tab.
// Everything subscribes to partner + loan changes so an edit anywhere
// else in the app reflects here within a beat.

const DAY_MS = 86400000;
const BIRTHDAY_WINDOW_DAYS = 14;

function fmtMonthDay(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Next occurrence of a month/day pair from a raw birthday value.
// If the date has already passed this calendar year, roll to next year.
function nextBirthday(raw, today) {
  const d = parseLocalDate(raw);
  if (!d) return null;
  const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
}

export default function AgentForLife() {
  // Bump tick on every partner + loan subscribe event so every memo
  // downstream sees fresh data.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribePartners(bump), [bump]);
  useEffect(() => subscribeLoans(bump), [bump]);
  const [expandedAgentName, setExpandedAgentName] = useState(null);

  const agents = useMemo(() => (
    [...PARTNERS]
      .filter((p) => p.name && p.name.trim() && p.name !== 'Self-Generated')
      .sort((a, b) => (b.deals || 0) - (a.deals || 0))
  ), [tick]);

  // Birthdays panel data — every agent whose birthday (partner.birthday,
  // falling back to a client_dates row keyed to their name) lands in
  // the next BIRTHDAY_WINDOW_DAYS. Matches CFL's approach (project to
  // this year, roll to next if already passed) but with a sliding
  // window instead of "current calendar month."
  const upcomingBirthdays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = [];
    for (const p of agents) {
      // Prefer partner-card birthday. Fall back to client_dates row
      // if not set on the card. (Kim mostly types birthdays into the
      // partner card; the client_dates fallback catches legacy data.)
      let raw = p.birthday || p.bday || null;
      if (!raw) {
        const nameLc = p.name.trim().toLowerCase();
        for (const row of getAllDates().values()) {
          if ((row.client_name || '').trim().toLowerCase() !== nameLc) continue;
          if (!/birthday/i.test(row.date_label)) continue;
          raw = row.date_value;
          break;
        }
      }
      if (!raw) continue;
      const next = nextBirthday(raw, today);
      if (!next) continue;
      const daysAway = Math.round((next - today) / DAY_MS);
      if (daysAway < 0 || daysAway > BIRTHDAY_WINDOW_DAYS) continue;
      rows.push({
        agent: p,
        raw,
        next,
        monthDay: fmtMonthDay(next),
        daysAway,
      });
    }
    return rows.sort((a, b) => a.daysAway - b.daysAway);
  }, [agents, tick]);

  // Task list — same generator + anchor logic that was here before.
  // Split out into its own memo so a birthday-only re-render doesn't
  // re-run every generator call. Uses `agents` so it also re-runs on
  // subscribePartners tick.
  const agentTasks = useMemo(() => {
    const items = [];
    for (const p of agents) {
      const agentName = p.name;
      const agentLoans = LOANS.filter((l) => (l.agent || '').trim() === agentName);
      // Collect FUNDED closings ascending — the ordered list is what
      // the First Closing + Third Closing anchors project from. A loan
      // counts as funded when stage === 'funded' OR status === 'Funded'
      // (matches how the rest of the app decides).
      const fundedCloseDates = [];
      for (const l of agentLoans) {
        if (!l.closeDate) continue;
        const stage = (l.stage || '').toLowerCase();
        const status = (l.status || '').toLowerCase();
        if (stage !== 'funded' && status !== 'funded') continue;
        const d = parseLocalDate(l.closeDate);
        if (d) fundedCloseDates.push(d);
      }
      fundedCloseDates.sort((a, b) => a - b);
      const firstClosingDate = fundedCloseDates[0] || null;
      const thirdClosingDate = fundedCloseDates[2] || null;
      // "Last Deal" stays the LATEST closeDate across ALL loans (funded
      // or not) — keeps existing "N days after Last Deal" workflows
      // pointing at the most recent activity.
      let lastDealDate = null;
      for (const l of agentLoans) {
        if (!l.closeDate) continue;
        const d = parseLocalDate(l.closeDate);
        if (!d) continue;
        if (!lastDealDate || d > lastDealDate) lastDealDate = d;
      }
      // The generator does a CASE-INSENSITIVE trigger_label lookup, so
      // every key we insert here is lowercased. Matches CFL's
      // buildAnchorsForClient behavior; drop the cast and workflows go
      // dark silently.
      const anchors = new Map();
      if (lastDealDate) anchors.set('last deal', lastDealDate);
      if (firstClosingDate) anchors.set('first closing', firstClosingDate);
      if (thirdClosingDate) anchors.set('third closing', thirdClosingDate);
      // Fields on the Partner record itself (set from the Partners
      // drawer: Birthday, Anniversary) are first-class anchors so a
      // workflow task with trigger label "Birthday" pulls straight from
      // partner.birthday without needing a matching client_dates row.
      // Legacy p.bday alias handled for older data.
      const bdayRaw = p.birthday || p.bday;
      if (bdayRaw) {
        const d = parseLocalDate(bdayRaw);
        if (d) anchors.set('birthday', d);
      }
      if (p.anniversary) {
        const d = parseLocalDate(p.anniversary);
        if (d) anchors.set('wedding anniversary', d);
      }
      getAllDates().forEach((row) => {
        if ((row.client_name || '').trim().toLowerCase() !== agentName.toLowerCase()) return;
        const d = parseLocalDate(row.date_value);
        if (d) anchors.set(row.date_label.toLowerCase(), d);
      });
      // Pass the agent record so is_vip / has_mailing_address conditions
      // on Agent-for-Life workflow tasks can gate correctly.
      const emitted = generateTasksForClient(agentName, anchors, {
        category: 'Agent for Life',
        agent: p,
      });
      emitted.forEach((it) => items.push({ ...it, agent: p }));
    }
    items.sort((a, b) => a.due_date - b.due_date);
    return items;
  }, [agents, tick]);

  const openItems = agentTasks.filter((it) => !it.completed);
  const doneItems = agentTasks.filter((it) => it.completed);
  const agentsWithTasks = new Set(agentTasks.map((it) => it.client_name)).size;

  const toggleExpanded = (name) => {
    setExpandedAgentName((cur) => (cur === name ? null : name));
  };

  return (
    <div>
      {/* Page header — copy explains what powers the tab. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            Agent for Life
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Live-sourced from the Partners tab. Birthdays project from each partner's card; tasks fire from Agent-for-Life workflows.
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
          Edit dates on the Partners drawer · build workflows on Workflows &amp; SOPs.
        </div>
      </div>

      {/* Birthdays Coming Up panel. Only shown when at least one agent
          has a birthday in the window; otherwise the panel would just
          be a noisy empty box. */}
      {upcomingBirthdays.length > 0 && (
        <BirthdaysPanel
          rows={upcomingBirthdays}
          expandedAgentName={expandedAgentName}
          onToggle={toggleExpanded}
        />
      )}

      {agentTasks.length === 0 ? (
        <div style={{ padding: 32, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--brand-black)', marginBottom: 6 }}>
            No agent tasks yet.
          </div>
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
            To populate this list:
            <br />1. Open <strong>Workflows &amp; SOPs</strong> and add a workflow whose Category is set to <strong>Agent for Life</strong>.
            <br />2. Add task(s) with a Date trigger anchored on <em>Last Deal</em>, <em>Birthday</em>, or a custom date label you assign to each agent.
            <br />3. Any active agent with a matching anchor date will show up here.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 14px', background: '#f7f9fc', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#555' }}>
            {openItems.length} open · {doneItems.length} done · across {agentsWithTasks} agent{agentsWithTasks === 1 ? '' : 's'}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {openItems.map((it) => (
              <AgentTaskRow
                key={it.id}
                item={it}
                expanded={expandedAgentName === it.client_name}
                onToggle={toggleExpanded}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Birthdays panel — matches the shape and treatment of CFL's
// BirthdaysPanel, but for realtor partners.
function BirthdaysPanel({ rows, expandedAgentName, onToggle }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('kdt-afl-birthdays-open') !== '0'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('kdt-afl-birthdays-open', open ? '1' : '0'); } catch {}
  }, [open]);
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'transparent',
            border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform .15s ease',
              color: '#fff', fontSize: 14, lineHeight: 1, width: 14,
            }}
          >▶</span>
          <div>
            <div className="section-title">Birthdays Coming Up · Next {BIRTHDAY_WINDOW_DAYS} Days</div>
            <div className="section-sub">{rows.length} agent{rows.length === 1 ? '' : 's'} · click a name for their mailing address</div>
          </div>
        </button>
      </div>
      {open && (
        <div className="section-body" style={{ padding: 0 }}>
          {rows.map(({ agent, monthDay, daysAway }) => {
            const isExpanded = expandedAgentName === agent.name;
            const isUrgent = daysAway <= 3;
            return (
              <div key={agent.name} style={{ borderTop: '1px solid #f1f1f1' }}>
                <button
                  type="button"
                  onClick={() => onToggle(agent.name)}
                  aria-expanded={isExpanded}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 140px 100px', gap: 10,
                    padding: '10px 18px', width: '100%',
                    background: isUrgent ? '#fff8e1' : '#fff',
                    border: 0, textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--brand-red)' }}>
                    {agent.name}
                    {agent.vip && <span style={{ marginLeft: 6, fontSize: 10, background: '#fbc02d', color: '#0A0A0A', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>VIP</span>}
                  </div>
                  <div style={{ color: '#555' }}>{monthDay}</div>
                  <div style={{ textAlign: 'right', fontSize: 11, fontWeight: isUrgent ? 700 : 400, color: isUrgent ? '#c62828' : '#888' }}>
                    {daysAway === 0 ? 'TODAY' : `${daysAway}d away`}
                  </div>
                </button>
                {isExpanded && <AgentDetailPanel agent={agent} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Task row + inline expansion. The whole row is clickable — collapses/
// expands the AgentDetailPanel with the mailing address, phone, email,
// birthday, and last-deal count.
function AgentTaskRow({ item, expanded, onToggle }) {
  return (
    <div style={{ borderTop: '1px solid #f1f1f1' }}>
      <button
        type="button"
        onClick={() => onToggle(item.client_name)}
        aria-expanded={expanded}
        style={{
          display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12,
          padding: '12px 16px', width: '100%',
          background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {item.anchor_label || 'Task'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-black)' }}>{item.task.title}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            <strong style={{ color: 'var(--brand-red)' }}>{item.client_name}</strong>
            {item.agent?.vip && <span style={{ marginLeft: 6, fontSize: 9, background: '#fbc02d', color: '#0A0A0A', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>VIP</span>}
            {' · '}{item.workflow?.name}
            {item.agent?.deals ? ` · ${item.agent.deals} deals` : ''}
            {item.agent?.state ? ` · ${item.agent.state}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#888' }}>
          Due {item.due_date ? item.due_date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
        </div>
      </button>
      {expanded && <AgentDetailPanel agent={item.agent} />}
    </div>
  );
}

// Mailing-address-first mini panel. Kim's use case for clicking an
// agent's card is "I need to send them something in the mail" — so the
// address is the hero. Phone / email / birthday are supporting info.
function AgentDetailPanel({ agent }) {
  if (!agent) return null;
  const mailing = agent.mailing_address || agent.addr || '';
  const phone = agent.phone || '';
  const email = agent.email || '';
  const birthday = agent.birthday || agent.bday || '';
  const anniversary = agent.anniversary || '';
  const label = (t) => (
    <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 3 }}>
      {t}
    </div>
  );
  return (
    <div style={{ background: '#f7f9fc', borderTop: '1px dashed #d0d0d0', padding: '14px 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          {label('Mailing Address')}
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: mailing ? 'var(--brand-black)' : '#c62828', fontWeight: mailing ? 400 : 700 }}>
            {mailing || 'No mailing address on file — add it on the Partners tab.'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: 12 }}>
          <div>{label('Phone')}<div style={{ color: phone ? '#222' : '#999' }}>{phone || '—'}</div></div>
          <div>{label('Email')}<div style={{ color: email ? '#222' : '#999' }}>{email || '—'}</div></div>
          <div>{label('Birthday')}<div style={{ color: birthday ? '#222' : '#999' }}>{birthday || '—'}</div></div>
          {anniversary && (
            <div>{label('Wedding Anniversary')}<div>{anniversary}</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
