import { dashboardConfig } from '../../config/dashboard.config';
import { addDays, daysBetween, startOfWeek } from '../shared/dates';
import type { MetricValue, Workout } from '../shared/types';
import { metric, missing, sourceLabel, type MetricContext } from './context';
import { heatmapGrid, type HeatCell } from './habits';

const counts = (w: Workout) => w.completed !== false;

export interface PersonalRecord {
  exercise: string;
  weight: number;
  reps: number | null;
  unit: string | null;
  date: string;
  previous: number | null;
}

function sessionsByDay(ws: Workout[]): Map<string, Workout[]> {
  const m = new Map<string, Workout[]>();
  for (const w of ws.filter(counts)) m.set(w.date, [...(m.get(w.date) ?? []), w]);
  return m;
}

export function workoutHeatmap(ctx: MetricContext): HeatCell[] {
  const byDay = sessionsByDay(ctx.e.workouts);
  const hasData = ctx.e.workouts.length > 0;
  return heatmapGrid(
    ctx,
    (d) => (!hasData ? null : byDay.has(d) ? Math.min(1, (byDay.get(d)!.reduce((a, w) => a + (w.durationMin ?? 45), 0) || 45) / 90) : 0),
    (d, v) => (v === null ? `${d}: no data` : v === 0 ? `${d}: rest / no workout logged` : `${d}: ${byDay.get(d)!.map((w) => w.title).join(', ')}`),
  );
}

/** A PR is a top weight for an exercise that beat every earlier entry. */
export function personalRecords(ctx: MetricContext, limit = 6): PersonalRecord[] {
  const entries = ctx.e.workouts
    .filter(counts)
    .flatMap((w) => w.exercises.filter((x) => x.weight != null).map((x) => ({ ...x, date: w.date })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const best = new Map<string, number>();
  const prs: PersonalRecord[] = [];
  for (const e of entries) {
    const key = e.exercise.toLowerCase();
    const prev = best.get(key) ?? null;
    if (prev === null || e.weight! > prev) {
      best.set(key, e.weight!);
      if (prev !== null) prs.push({ exercise: e.exercise, weight: e.weight!, reps: e.reps, unit: e.unit, date: e.date, previous: prev });
    }
  }
  return prs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export function exerciseTrends(ctx: MetricContext, top = 3): { exercise: string; series: { date: string; value: number | null }[] }[] {
  const byEx = new Map<string, { date: string; value: number }[]>();
  for (const w of ctx.e.workouts.filter(counts)) {
    for (const x of w.exercises) {
      if (x.weight == null) continue;
      const list = byEx.get(x.exercise) ?? [];
      const existing = list.find((p) => p.date === w.date);
      if (existing) existing.value = Math.max(existing.value, x.weight);
      else list.push({ date: w.date, value: x.weight });
      byEx.set(x.exercise, list);
    }
  }
  return [...byEx.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, top)
    .map(([exercise, pts]) => ({ exercise, series: pts.sort((a, b) => a.date.localeCompare(b.date)) }));
}

export function fitnessMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const ws = ctx.e.workouts.filter(counts);
  const db = ctx.e.workouts[0]?.prov.database ?? 'Workouts';
  const src = sourceLabel(ctx, db, ['date', 'duration'], 'workout');
  const none = 'No workout log found in Notion yet (Build a Better Me is awaiting intake).';
  const target = dashboardConfig.targets.workoutsPerWeek;

  if (!ctx.e.workouts.length) {
    for (const [id, label, unit, period] of [
      ['fitness.workouts7d', 'Workouts · 7 days', 'sessions', 'last 7 days'],
      ['fitness.weekStreak', 'Training streak', 'weeks', 'current'],
      ['fitness.minutes7d', 'Training time · 7 days', 'min', 'last 7 days'],
      ['fitness.lastWorkout', 'Last workout', 'days ago', 'now'],
      ['fitness.today', "Today's workout", null, 'today'],
    ] as const) {
      out[id] = missing(ctx, { id, label, unit, period, source: src, calculation: 'From workout log rows.', note: none });
    }
    return out;
  }

  const byDay = sessionsByDay(ws);
  const inLast = (n: number) => ws.filter((w) => w.date > addDays(ctx.today, -n) && w.date <= ctx.today);
  const thisWeek = startOfWeek(ctx.today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * (11 - i)));
  const perWeek = weeks.map((wk) => ({ date: wk, value: ws.filter((w) => w.date >= wk && w.date < addDays(wk, 7)).length }));
  const last7 = inLast(7);
  const prev7 = ws.filter((w) => w.date > addDays(ctx.today, -14) && w.date <= addDays(ctx.today, -7)).length;

  out['fitness.workouts7d'] = metric(ctx, {
    id: 'fitness.workouts7d',
    label: 'Workouts · 7 days',
    value: last7.length,
    unit: 'sessions',
    period: 'last 7 days',
    source: src,
    calculation: 'Logged workout rows (not marked incomplete) in the last 7 days. Sparkline: sessions per week, 12 weeks.',
    series: perWeek,
    target,
    ratio: target ? Math.min(1, last7.length / target) : null,
    delta: { value: last7.length - prev7, period: 'vs previous 7 days', goodWhen: 'up' },
  });

  let weekStreak = 0;
  const startWk = perWeek[perWeek.length - 1]!.value ? thisWeek : addDays(thisWeek, -7);
  for (let wk = startWk; ws.some((w) => w.date >= wk && w.date < addDays(wk, 7)); wk = addDays(wk, -7)) weekStreak++;
  out['fitness.weekStreak'] = metric(ctx, { id: 'fitness.weekStreak', label: 'Training streak', value: weekStreak, unit: 'weeks', period: 'current', source: src, calculation: 'Consecutive calendar weeks (Mon–Sun) with at least one workout.' });

  const minutes = last7.reduce((a, w) => a + (w.durationMin ?? 0), 0);
  out['fitness.minutes7d'] = last7.some((w) => w.durationMin != null)
    ? metric(ctx, { id: 'fitness.minutes7d', label: 'Training time · 7 days', value: minutes, unit: 'min', period: 'last 7 days', source: src, calculation: 'Sum of workout durations in the last 7 days.' })
    : missing(ctx, { id: 'fitness.minutes7d', label: 'Training time · 7 days', unit: 'min', period: 'last 7 days', source: src, calculation: 'Sum of durations.', note: 'No duration property on workout rows.' });

  const lastDate = [...byDay.keys()].filter((d) => d <= ctx.today).sort().pop() ?? null;
  out['fitness.lastWorkout'] = lastDate
    ? metric(ctx, { id: 'fitness.lastWorkout', label: 'Last workout', value: daysBetween(lastDate, ctx.today), unit: 'days ago', period: 'now', source: src, calculation: 'Days since the most recent logged workout.', note: byDay.get(lastDate)!.map((w) => w.title).join(', ') })
    : missing(ctx, { id: 'fitness.lastWorkout', label: 'Last workout', unit: 'days ago', period: 'now', source: src, calculation: 'Days since last workout.', note: 'No workouts logged yet.' });

  const todays = byDay.get(ctx.today) ?? [];
  out['fitness.today'] = metric(ctx, {
    id: 'fitness.today',
    label: "Today's workout",
    value: todays.length,
    display: todays.length ? todays.map((w) => w.title).join(', ') : 'Not logged',
    unit: null,
    period: 'today',
    source: src,
    calculation: 'Workout rows dated today.',
    quality: 'real',
  });
  return out;
}
