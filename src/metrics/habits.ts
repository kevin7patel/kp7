import { dashboardConfig } from '../../config/dashboard.config';
import { addDays, dayRange, startOfWeek } from '../shared/dates';
import type { DailyLog, MetricValue } from '../shared/types';
import { metric, missing, sourceLabel, type MetricContext } from './context';

export interface HeatCell {
  date: string;
  /** 0..1 share of tracked items done that day; null = no record (shown as "no data", never as 0). */
  value: number | null;
  label: string;
}

function logsByDate(logs: DailyLog[]): Map<string, DailyLog> {
  const m = new Map<string, DailyLog>();
  for (const l of logs) {
    const prev = m.get(l.date);
    m.set(l.date, prev ? { ...prev, checks: { ...prev.checks, ...l.checks } } : l);
  }
  return m;
}

/** Find the checkbox column that represents a configured check-in. */
function checkColumn(logs: DailyLog[], match: RegExp): string | null {
  for (const l of logs) for (const name of Object.keys(l.checks)) if (match.test(name)) return name;
  return null;
}

export function heatmapGrid(ctx: MetricContext, valueFor: (date: string) => number | null, labelFor: (date: string, v: number | null) => string): HeatCell[] {
  const weeks = dashboardConfig.windows.heatmapWeeks;
  const start = addDays(startOfWeek(ctx.today), -7 * (weeks - 1));
  return dayRange(start, addDays(startOfWeek(ctx.today), 6)).map((date) => {
    const v = date > ctx.today ? null : valueFor(date);
    return { date, value: v, label: labelFor(date, v) };
  });
}

export function habitHeatmap(ctx: MetricContext): HeatCell[] {
  const map = logsByDate(ctx.e.dailyLogs);
  return heatmapGrid(
    ctx,
    (d) => {
      const l = map.get(d);
      if (!l) return null;
      const vals = Object.values(l.checks);
      return vals.length ? vals.filter(Boolean).length / vals.length : null;
    },
    (d, v) => (v === null ? `${d}: no record` : `${d}: ${Math.round(v * 100)}% of habits done`),
  );
}

export function habitList(ctx: MetricContext): { name: string; today: boolean | null; streak: number; rate: number | null }[] {
  const map = logsByDate(ctx.e.dailyLogs);
  const names = new Set<string>();
  for (const l of ctx.e.dailyLogs) for (const n of Object.keys(l.checks)) names.add(n);
  const window = dayRange(addDays(ctx.today, -27), ctx.today);
  return [...names].map((name) => {
    let streak = 0;
    const startDay = map.get(ctx.today)?.checks[name] ? ctx.today : addDays(ctx.today, -1);
    for (let k = startDay; map.get(k)?.checks[name]; k = addDays(k, -1)) streak++;
    const tracked = window.filter((d) => map.has(d));
    const done = tracked.filter((d) => map.get(d)?.checks[name]).length;
    return { name, today: map.get(ctx.today)?.checks[name] ?? null, streak, rate: tracked.length ? done / tracked.length : null };
  });
}

export function habitMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const logs = ctx.e.dailyLogs;
  const db = logs[0]?.prov.database ?? 'Daily Log';
  const map = logsByDate(logs);
  const none = 'No Daily Log database found yet. Check-ins are defined in Build a Better Me as page text, which cannot be charted.';

  for (const c of dashboardConfig.checkins) {
    const id = `checkins.${c.id}`;
    const col = checkColumn(logs, c.match);
    if (!col) {
      out[id] = missing(ctx, { id, label: c.label, unit: null, period: 'today', source: sourceLabel(ctx, db, [], 'dailyLog'), calculation: `Checkbox matching ${c.match} in the Daily Log.`, note: none });
      continue;
    }
    const firstDay = [...map.keys()].sort()[0] ?? ctx.today;
    let streak = 0;
    let k = map.get(ctx.today)?.checks[col] ? ctx.today : addDays(ctx.today, -1);
    for (; map.get(k)?.checks[col]; k = addDays(k, -1)) streak++;
    // Consistency counts days without a row as missed (honest), over min(28 days, days since first record).
    const from = firstDay > addDays(ctx.today, -27) ? firstDay : addDays(ctx.today, -27);
    const window = dayRange(from, ctx.today);
    const doneDays = window.filter((d) => map.get(d)?.checks[col]).length;
    const series = dayRange(addDays(ctx.today, -27), ctx.today).map((date) => ({ date, value: map.has(date) ? (map.get(date)!.checks[col] ? 1 : 0) : null }));
    out[id] = metric(ctx, {
      id,
      label: c.label,
      value: map.get(ctx.today)?.checks[col] ? 1 : 0,
      display: map.get(ctx.today)?.checks[col] ? 'Done' : map.has(ctx.today) ? 'Not yet' : 'No entry',
      unit: null,
      period: 'today',
      source: `${sourceLabel(ctx, db, [], 'dailyLog')} · ${col}`,
      calculation: `Checkbox "${col}". Streak = consecutive days ticked; consistency = ticked days ÷ days in window (missing days count as missed).`,
      ratio: window.length ? doneDays / window.length : null,
      note: `Streak ${streak}d · ${doneDays}/${window.length} days`,
      series,
    });
  }

  const habits = habitList(ctx);
  const rates = habits.map((h) => h.rate).filter((r): r is number => r !== null);
  out['habits.consistency'] = habits.length
    ? metric(ctx, {
        id: 'habits.consistency',
        label: 'Habit consistency',
        value: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) : null,
        unit: '%',
        ratio: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
        period: 'last 28 days',
        source: sourceLabel(ctx, db, [], 'dailyLog'),
        calculation: 'Average, across all habit checkboxes, of ticked days ÷ logged days (28-day window).',
      })
    : missing(ctx, { id: 'habits.consistency', label: 'Habit consistency', unit: '%', period: 'last 28 days', source: sourceLabel(ctx, db, [], 'dailyLog'), calculation: 'Average habit completion.', note: none });

  return out;
}
