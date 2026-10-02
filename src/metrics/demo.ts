/**
 * DEMO DATA — synthetic, generated on the device, never from Notion.
 * Exists so every visualization can be previewed and iterated on before real
 * logs exist. Every record carries prov.source = 'demo' and the payload source
 * kind is 'demo', which forces "Demo" badges and a banner throughout the UI.
 */
import { addDays, dayKey, dayRange } from '../shared/dates';
import type { DailyLog, DashboardPayload, Goal, HealthSample, NutritionEntry, Task, Workout } from '../shared/types';

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prov = { source: 'demo' as const, database: 'Demo' };

const TASK_TITLES: [string, string][] = [
  ['Review weekly STR benchmark', 'hotel'],
  ['Approve vendor quote — lobby lighting', 'tru'],
  ['Sign off pool inspection checklist', 'hotel'],
  ['Call roofing contractor back', 'tru'],
  ['Book flights for conference', 'travel'],
  ['Renew business license', 'hotel'],
  ['Prep GM meeting agenda', 'hotel'],
  ['Order breakfast supplies', 'tru'],
  ['Pay utility bill', 'finance'],
  ['Schedule annual physical', 'health'],
  ['Review payroll exceptions', 'hotel'],
  ['Reply to group-sales inquiry', 'hotel'],
  ['Update guest-room signage', 'tru'],
  ['Meal-prep for the week', 'health'],
  ['Read 20 pages', 'personal'],
  ['Clean home office', 'personal'],
];

export function demoPayload(now: Date, tz: string): DashboardPayload {
  const r = rng(7);
  const today = dayKey(now, tz);
  const at = now.toISOString();
  const iso = (day: string, hour = 9) => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const statuses = ['Not started', 'In progress', 'Waiting on Kevin', 'Blocked', 'Done'];

  const tasks: Task[] = [];
  for (let i = 0; i < 46; i++) {
    const [title, area] = TASK_TITLES[i % TASK_TITLES.length]!;
    const offset = Math.round(r() * 16) - 9;
    const due = addDays(today, offset);
    let status = statuses[Math.floor(r() * 3)]!;
    if (offset < -2 && r() < 0.75) status = 'Done';
    if (i % 11 === 3) status = 'Blocked';
    if (i % 9 === 4) status = 'Waiting on Kevin';
    const done = status === 'Done';
    const withTime = offset === 0 && r() < 0.6;
    tasks.push({
      id: `demo-task-${i}`,
      title: i >= TASK_TITLES.length ? `${title} (${Math.floor(i / TASK_TITLES.length) + 1})` : title,
      url: null,
      status,
      statusGroup: done ? 'done' : status === 'Blocked' ? 'blocked' : status.startsWith('Waiting') ? 'waiting' : status === 'In progress' ? 'in_progress' : 'todo',
      due: withTime ? iso(due, 13 + Math.floor(r() * 10)) : due,
      dueHasTime: withTime,
      priority: ['High', 'Medium', 'Low'][Math.floor(r() * 3)]!,
      priorityRank: 2 + Math.floor(r() * 3),
      owner: r() < 0.5 ? 'Kevin' : 'Agent',
      list: r() < 0.6 ? 'Kevin' : 'Agent help',
      deferred: false,
      top3: !done && i < 3 ? i + 1 : null,
      nextAction: r() < 0.7 ? 'Demo next step' : null,
      waitingOnKevin: status.startsWith('Waiting'),
      blocked: status === 'Blocked',
      timeBucket: null,
      area,
      areaSource: 'notion',
      parentId: null,
      parentTitle: null,
      projectIds: [],
      completedAt: done ? iso(addDays(today, -Math.floor(r() * 26)), 15) : null,
      completedAtSource: 'notion',
      createdAt: iso(addDays(today, offset - 7)),
      lastEditedAt: iso(addDays(today, Math.min(0, offset + 1))),
      prov,
    });
  }

  const days = dayRange(addDays(today, -83), today);
  const dailyLogs: DailyLog[] = days
    .filter(() => r() > 0.12)
    .map((date, i) => ({
      id: `demo-log-${i}`,
      date,
      checks: { 'Morning check-in': r() > 0.18, 'Evening journal': r() > 0.32, 'Steps 8k': r() > 0.4, 'No phone after 10': r() > 0.5 },
      win: null,
      improvement: null,
      prov,
    }));

  const workouts: Workout[] = [];
  const lifts = ['Back squat', 'Bench press', 'Deadlift', 'Overhead press'];
  days.forEach((date, i) => {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (![1, 3, 5, 6].includes(dow) || r() < 0.18) return;
    const lift = lifts[i % lifts.length]!;
    const base = { 'Back squat': 225, 'Bench press': 175, Deadlift: 285, 'Overhead press': 105 }[lift]!;
    workouts.push({
      id: `demo-w-${i}`,
      date,
      title: dow === 6 ? 'Zone 2 ride' : `Strength — ${lift}`,
      type: dow === 6 ? 'Cardio' : 'Strength',
      durationMin: 40 + Math.round(r() * 35),
      completed: true,
      exercises: dow === 6 ? [] : [{ exercise: lift, sets: 5, reps: 5, weight: base + Math.round(i / 6) * 5, unit: 'lb' }],
      url: null,
      prov,
    });
  });

  const nutrition: NutritionEntry[] = days.slice(-30).flatMap((date, i) =>
    r() < 0.15
      ? []
      : [{ id: `demo-n-${i}`, date, calories: Math.round(2200 + (r() - 0.5) * 700), protein: Math.round(150 + (r() - 0.5) * 70), carbs: Math.round(220 + (r() - 0.5) * 80), fat: Math.round(75 + (r() - 0.5) * 30), waterMl: Math.round(2400 + (r() - 0.5) * 1200), label: 'Daily total', prov }],
  );

  const health: HealthSample[] = [];
  days.slice(-45).forEach((date, i) => {
    if (r() < 0.8) health.push({ id: `demo-h-w-${i}`, date, metric: 'weight', label: 'Weight', value: Math.round((206 - i * 0.12 + (r() - 0.5) * 1.6) * 10) / 10, unit: 'lb', prov });
    health.push({ id: `demo-h-s-${i}`, date, metric: 'sleep_hours', label: 'Sleep', value: Math.round((6.9 + (r() - 0.5) * 1.6) * 10) / 10, unit: 'h', prov });
    health.push({ id: `demo-h-st-${i}`, date, metric: 'steps', label: 'Steps', value: Math.round(7600 + (r() - 0.5) * 5000), unit: null, prov });
    health.push({ id: `demo-h-r-${i}`, date, metric: 'resting_hr', label: 'Resting HR', value: Math.round(61 - i * 0.04 + (r() - 0.5) * 4), unit: 'bpm', prov });
  });

  const goals: Goal[] = [
    { title: 'Body weight to 195 lb', start: 208, current: 201.4, target: 195, unit: 'lb', due: addDays(today, 70) },
    { title: 'Food-safety certification', start: 0, current: 3, target: 5, unit: 'modules', due: addDays(today, 21) },
    { title: '4 workouts / week for 12 weeks', start: 0, current: 7, target: 12, unit: 'weeks', due: addDays(today, 35) },
    { title: 'Close hotel license items', start: 0, current: 6, target: 9, unit: 'items', due: addDays(today, 14) },
  ].map((g, i) => ({
    id: `demo-goal-${i}`,
    title: g.title,
    url: null,
    status: 'In progress',
    statusGroup: 'in_progress' as const,
    start: g.start,
    current: g.current,
    target: g.target,
    unit: g.unit,
    progress: Math.max(0, Math.min(1, (g.current - g.start) / (g.target - g.start))),
    progressSource: 'derived' as const,
    due: g.due,
    priority: 'High',
    area: 'personal',
    isTemplate: false,
    templateReason: null,
    lastEditedAt: now.toISOString(),
    prov,
  }));

  return {
    schemaVersion: 1,
    generatedAt: at,
    timezone: tz,
    source: { kind: 'demo', label: 'Demo data (synthetic)', capturedAt: at, coverage: 'full', notes: ['Generated on this device for previewing visualizations. Not Kevin’s data.'] },
    sync: { ok: true, stages: [], warnings: [] },
    entities: {
      tasks,
      projects: [
        { id: 'demo-p1', title: 'Front-desk time clock', url: null, status: 'In Progress', statusGroup: 'in_progress', area: 'hotel', outcome: 'Reliable clock-in with verified payroll export.', targetDate: addDays(today, 18), linkedTasks: { total: 6, done: 4 }, parentTitle: null, lastEditedAt: at, prov },
        { id: 'demo-p2', title: 'Weekly training routine', url: null, status: 'Needs Review', statusGroup: 'todo', area: 'health', outcome: 'A repeatable 4-day strength and conditioning plan.', targetDate: null, linkedTasks: null, parentTitle: null, lastEditedAt: at, prov },
      ],
      goals,
      dailyLogs,
      workouts,
      nutrition,
      health,
      automations: [],
      documents: [],
    },
    taskFields: { status: 'notion', due: 'notion', priority: 'notion', owner: 'notion', list: 'notion', top3: 'notion', nextAction: 'notion', waitingOnKevin: 'notion', blocked: 'notion', timeBucket: 'derived', completedAt: 'notion', area: 'notion', hierarchy: 'unavailable' },
    sourceMap: [],
    schema: [],
    facts: [],
    verification: { ok: true, checks: [] },
  };
}
