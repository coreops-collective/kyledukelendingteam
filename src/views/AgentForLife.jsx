import { useMemo } from 'react';
import { LOANS } from '../data/loans.js';
import { PARTNERS } from '../data/partners.js';
import { generateTasksForClient } from '../lib/workflows.js';
import { getAllDates, parseLocalDate } from '../lib/clientDates.js';

// Agent for Life is the realtor-partner mirror of Client for Life.
// Same task-card treatment, same generator, but the "client" iterating
// through is a realtor partner and only workflows tagged with the
// "Agent for Life" category emit here.
export default function AgentForLife() {
  const agentTasks = useMemo(() => {
    const items = [];
    const agents = [...PARTNERS]
      .filter((p) => p.name && p.name.trim() && p.name !== 'Self-Generated')
      .sort((a, b) => (b.deals || 0) - (a.deals || 0));
    for (const p of agents) {
      const agentName = p.name;
      const agentLoans = LOANS.filter((l) => (l.agent || '').trim() === agentName);
      // "Last Deal" anchor = closeDate of the most recent loan for
      // this agent.
      let lastDealDate = null;
      for (const l of agentLoans) {
        if (!l.closeDate) continue;
        const d = parseLocalDate(l.closeDate);
        if (!d) continue;
        if (!lastDealDate || d > lastDealDate) lastDealDate = d;
      }
      const anchors = new Map();
      if (lastDealDate) anchors.set('Last Deal', lastDealDate);
      // Fields on the Partner record itself (set from the Partners
      // drawer: Birthday, Anniversary) are first-class anchors so a
      // workflow task with trigger label "Birthday" pulls straight from
      // partner.birthday without needing a matching client_dates row.
      // Legacy p.bday alias handled for older data.
      const bdayRaw = p.birthday || p.bday;
      if (bdayRaw) {
        const d = parseLocalDate(bdayRaw);
        if (d) anchors.set('Birthday', d);
      }
      if (p.anniversary) {
        const d = parseLocalDate(p.anniversary);
        if (d) anchors.set('Wedding Anniversary', d);
      }
      // client_dates rows keyed to this agent's name still win — Kim
      // can override the drawer-set value or add labels not on the
      // partner card at all (Closing Anniversary, custom milestones).
      getAllDates().forEach((row) => {
        if ((row.client_name || '').trim().toLowerCase() !== agentName.toLowerCase()) return;
        const d = parseLocalDate(row.date_value);
        if (d) anchors.set(row.date_label, d);
      });
      const emitted = generateTasksForClient(agentName, anchors, { category: 'Agent for Life' });
      emitted.forEach((it) => items.push({ ...it, agent: p }));
    }
    items.sort((a, b) => a.due_date - b.due_date);
    return items;
  }, []);
  const openItems = agentTasks.filter((it) => !it.completed);
  const doneItems = agentTasks.filter((it) => it.completed);
  const agentsWithTasks = new Set(agentTasks.map((it) => it.client_name)).size;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            Agent for Life · Task List
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Auto-generated from workflows in the <strong>Agent for Life</strong> category. Anchors: last-deal close date, the Birthday + Anniversary set on the Partner card, and any date rows keyed to the agent.
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
          Build agent workflows on the Workflows &amp; SOPs tab (pick "Agent for Life" category).
        </div>
      </div>
      {agentTasks.length === 0 ? (
        <div style={{ padding: 32, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--brand-black)', marginBottom: 6 }}>
            No agent tasks yet.
          </div>
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
            To populate this list:
            <br />1. Open <strong>Workflows &amp; SOPs</strong> and add a workflow whose Category is set to <strong>Agent for Life</strong>.
            <br />2. Add task(s) with a Date trigger anchored on <em>Last Deal</em> or a custom date label you assign to each agent.
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
              <div
                key={it.id}
                style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12,
                  padding: '12px 16px', borderTop: '1px solid #f1f1f1', alignItems: 'center',
                }}
              >
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  {it.anchor_label || 'Task'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-black)' }}>{it.task.title}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    <strong style={{ color: 'var(--brand-red)' }}>{it.client_name}</strong>
                    {' · '}{it.workflow?.name}
                    {it.agent?.deals ? ` · ${it.agent.deals} deals` : ''}
                    {it.agent?.state ? ` · ${it.agent.state}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Due {it.due_date ? it.due_date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
