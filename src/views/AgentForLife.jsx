import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PARTNERS } from '../data/partners.js';
import {
  generateTasksForClient,
  markTaskCompleted, unmarkTaskCompleted,
} from '../lib/workflows.js';
import { getAllDates, parseLocalDate } from '../lib/clientDates.js';
import { subscribePartners } from '../lib/partnersStore.js';
import { subscribeLoans } from '../lib/loansStore.js';

// Agent for Life — the realtor-partner mirror of Client for Life.
// Reads live from PARTNERS + client_dates + LOANS via the same generator
// CFL uses.
//
// Layout (Kim's E15 rework 2026-08-18): tasks are bucketed by due
// date (Overdue / Today / This Week / This Month / Later), each
// section is collapsible, and every row has a red checkbox that marks
// the task complete via task_completions — same behavior + storage as
// CFL. Kim's mental model: "one page, both surfaces, same interaction."
//
// Kept from the previous layout:
//   * "Birthdays Coming Up" panel at the top (agent birthdays in the
//     next N days), because Kim uses it every morning.
//   * Inline mailing-address expansion when you click an agent's name
//     in either the birthday panel or a task row.
// Everything subscribes to partner + loan changes so an edit anywhere
// else in the app reflects here within a beat.

const DAY_MS = 86400000;
const BIRTHDAY_WINDOW_DAYS = 14;

function fmtMonthDay(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDueDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  // downstream sees fresh data. Also bumps when a task is marked
  // complete — otherwise the row wouldn't drop off the list until the
  // next partner/loan echo.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribePartners(bump), [bump]);
  useEffect(() => subscribeLoans(bump), [bump]);
  useEffect(() => {
    // markTaskCompleted / unmarkTaskCompleted dispatch this event; it
    // lets the checkbox click move the row out of Overdue/Today/etc.
    // immediately, without waiting for a partner/loan subscribe echo.
    const onChange = () => bump();
    window.addEventListener('kdt-workflows-changed', onChange);
    return () => window.removeEventListener('kdt-workflows-changed', onChange);
  }, [bump]);
  const [expandedAgentName, setExpandedAgentName] = useState(null);
  // Per-bucket collapsed state, matching CFL. This Month and Later
  // start collapsed so a long tail doesn't drown the immediate work.
  const [collapsed, setCollapsed] = useState({ 'This Month': true, Later: true });

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

  // Bucket the OPEN tasks into CFL-style Overdue / Today / This Week /
  // This Month / Later. Completed tasks drop off the visible list on
  // the same tick — Kim wanted "check the box, it's gone."
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, [tick]);
  const buckets = useMemo(() => {
    const b = [
      { label: 'Overdue', items: [] },
      { label: 'Today', items: [] },
      { label: 'This Week', items: [] },
      { label: 'This Month', items: [] },
      { label: 'Later', items: [] },
    ];
    for (const it of agentTasks) {
      if (it.completed) continue;
      const days = Math.round((it.due_date - today) / DAY_MS);
      if (days < 0) b[0].items.push(it);
      else if (days === 0) b[1].items.push(it);
      else if (days <= 7) b[2].items.push(it);
      else if (days <= 31) b[3].items.push(it);
      else b[4].items.push(it);
    }
    return b;
  }, [agentTasks, today]);

  const openCount = agentTasks.filter((it) => !it.completed).length;
  const doneCount = agentTasks.filter((it) => it.completed).length;
  const agentsWithTasks = new Set(agentTasks.map((it) => it.client_name)).size;

  const toggleExpanded = (name) => {
    setExpandedAgentName((cur) => (cur === name ? null : name));
  };
  const toggleBucket = (label) => {
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));
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
            {openCount} open · {doneCount} done · across {agentsWithTasks} agent{agentsWithTasks === 1 ? '' : 's'}
          </div>
          {buckets.map((b) => b.items.length > 0 && (
            <AgentSection
              key={b.label}
              label={b.label}
              items={b.items}
              today={today}
              collapsed={!!collapsed[b.label]}
              onToggle={() => toggleBucket(b.label)}
              expandedAgentName={expandedAgentName}
              onExpandAgent={toggleExpanded}
            />
          ))}
        </>
      )}
    </div>
  );
}

// Collapsible bucket header + list — mirrors CFL's Section pattern but
// tuned for the AFL row shape.
function AgentSection({ label, items, today, collapsed, onToggle, expandedAgentName, onExpandAgent }) {
  const headerColor = label === 'Overdue' ? '#c62828' : label === 'Today' ? '#e65100' : '#555';
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: collapsed ? 8 : '8px 8px 0 0', borderBottom: collapsed ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', userSelect: 'none',
        }}
        role="button"
        aria-expanded={!collapsed}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform .15s ease',
            fontSize: 10, width: 10, color: '#888',
          }}
        >▶</span>
        <div style={{
          fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.6px', color: headerColor,
        }}>
          {label} <span style={{ color: '#888', marginLeft: 6 }}>({items.length})</span>
        </div>
      </div>
      {!collapsed && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {items.map((it, i) => (
            <AgentTaskRow
              key={it.id}
              item={it}
              today={today}
              first={i === 0}
              expanded={expandedAgentName === it.client_name}
              onExpandAgent={onExpandAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Single task row with a red-checkbox complete control. Clicking the
// checkbox marks the task complete (writes to task_completions and
// bumps this view via the kdt-task-completions-changed event). The
// row body remains clickable to expand the agent's mailing-address
// panel — Kim's key AFL flow.
function AgentTaskRow({ item, today, first, expanded, onExpandAgent }) {
  const days = Math.round((item.due_date - today) / DAY_MS);
  const dueLabel = days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `${days}d`;
  const dueIso = toIsoDate(item.due_date);
  const onToggleComplete = (e) => {
    e.stopPropagation();
    if (item.completed) {
      unmarkTaskCompleted(item.task.id, item.client_name, dueIso, item.loan_id);
    } else {
      markTaskCompleted(item.task.id, item.client_name, dueIso, null, null, item.loan_id);
    }
  };
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid #f1f1f1' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 90px 1fr auto 90px', gap: 12,
        padding: '12px 16px', alignItems: 'center',
        background: item.completed ? '#fafafa' : '#fff',
      }}>
        <input
          type="checkbox"
          checked={!!item.completed}
          onChange={onToggleComplete}
          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-red)', margin: 0 }}
          title="Mark complete"
          aria-label="Complete"
        />
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {item.anchor_label || 'Task'}
        </div>
        <button
          type="button"
          onClick={() => onExpandAgent(item.client_name)}
          aria-expanded={expanded}
          style={{
            display: 'block', minWidth: 0, textAlign: 'left', width: '100%',
            background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
          }}
        >
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: item.completed ? '#aaa' : 'var(--brand-black)',
            textDecoration: item.completed ? 'line-through' : 'none',
          }}>
            {item.task.title}
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            <strong style={{ color: 'var(--brand-red)' }}>{item.client_name}</strong>
            {item.agent?.vip && <span style={{ marginLeft: 6, fontSize: 9, background: '#fbc02d', color: '#0A0A0A', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>VIP</span>}
            {' · '}{item.workflow?.name}
            {item.agent?.deals ? ` · ${item.agent.deals} deals` : ''}
            {item.agent?.state ? ` · ${item.agent.state}` : ''}
          </div>
        </button>
        <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>
          <strong style={{ color: '#222', fontWeight: 700 }}>Due</strong> {fmtDueDate(item.due_date)}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, fontWeight: days < 0 ? 700 : 400, color: days < 0 ? '#c62828' : days === 0 ? '#e65100' : '#888' }}>
          {dueLabel}
        </div>
      </div>
      {expanded && <AgentDetailPanel agent={item.agent} />}
    </div>
  );
}

// Birthdays panel — matches the shape and treatment of CFL's original
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
            color: 'inherit',
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
