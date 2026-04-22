// GOALS — ported verbatim from legacy/index.html
export const GOALS = {
  'Kyle Duke': {
    period: 'Q2 2026',
    bigGoal: { text: 'Close $10M in personal production this quarter', target: 10000000, actual: 2100000, unit: '$' },
    priorities: [
      { text: 'Recruit 2 new realtor partners per month', target: 6, actual: 2 },
      { text: 'Close 3 VA refis per month', target: 9, actual: 3 },
      { text: 'Launch client-for-life drip campaign', target: 1, actual: 0 },
    ],
    activities: [
      { name: 'Outbound calls', target: 300, actual: 87, unit: 'calls/qtr', cadence: '15/day' },
      { name: 'Agent coffee meetings', target: 30, actual: 9, unit: 'meetings/qtr', cadence: '2/week' },
      { name: 'Past client check-ins', target: 60, actual: 18, unit: 'check-ins/qtr', cadence: '5/week' },
      { name: 'New applications taken', target: 45, actual: 12, unit: 'apps/qtr', cadence: '3/week' },
      { name: 'Social media posts', target: 36, actual: 11, unit: 'posts/qtr', cadence: '3/week' },
    ],
  },
  'Missy': {
    period: 'Q2 2026',
    bigGoal: { text: 'Close $3M in personal production this quarter', target: 3000000, actual: 540000, unit: '$' },
    priorities: [
      { text: 'Build a referral pipeline with 5 agents', target: 5, actual: 1 },
      { text: 'Hit 1 funded loan per week', target: 13, actual: 4 },
      { text: 'Complete VA advanced cert', target: 1, actual: 0 },
    ],
    activities: [
      { name: 'Outbound calls', target: 200, actual: 54, unit: 'calls/qtr', cadence: '10/day' },
      { name: 'Agent coffee meetings', target: 20, actual: 4, unit: 'meetings/qtr', cadence: '1-2/week' },
      { name: 'Past client check-ins', target: 40, actual: 9, unit: 'check-ins/qtr', cadence: '3/week' },
      { name: 'New applications taken', target: 20, actual: 6, unit: 'apps/qtr', cadence: '1-2/week' },
      { name: 'Social media posts', target: 24, actual: 5, unit: 'posts/qtr', cadence: '2/week' },
    ],
  },
};

export function defaultGoalSkeleton() {
  return {
    period: 'Q2 2026',
    bigGoal: { text: 'Set your Q2 big goal', target: 0, actual: 0, unit: '$' },
    priorities: [
      { text: 'Priority 1 (click to edit)', target: 0, actual: 0 },
      { text: 'Priority 2 (click to edit)', target: 0, actual: 0 },
      { text: 'Priority 3 (click to edit)', target: 0, actual: 0 },
    ],
    activities: [
      { name: 'Outbound calls', target: 0, actual: 0, unit: 'calls/qtr', cadence: '' },
      { name: 'Agent meetings', target: 0, actual: 0, unit: 'meetings/qtr', cadence: '' },
      { name: 'Past client check-ins', target: 0, actual: 0, unit: 'check-ins/qtr', cadence: '' },
      { name: 'New applications', target: 0, actual: 0, unit: 'apps/qtr', cadence: '' },
      { name: 'Social media posts', target: 0, actual: 0, unit: 'posts/qtr', cadence: '' },
    ],
  };
}
