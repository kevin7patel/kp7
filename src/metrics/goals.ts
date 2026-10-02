import { daysBetween, dayKey } from '../shared/dates';
import type { Goal, MetricValue } from '../shared/types';
import { mean, metric, missing, sourceLabel, type MetricContext } from './context';

export interface GoalView {
  goal: Goal;
  daysLeft: number | null;
  remaining: number | null;
}

export function personalGoals(ctx: MetricContext): GoalView[] {
  return ctx.e.goals
    .filter((g) => !g.isTemplate)
    .map((g) => ({
      goal: g,
      daysLeft: g.due ? daysBetween(ctx.today, dayKey(g.due, ctx.tz)) : null,
      remaining: g.target != null && g.current != null ? g.target - g.current : null,
    }))
    .sort((a, b) => (a.goal.statusGroup === 'done' ? 1 : 0) - (b.goal.statusGroup === 'done' ? 1 : 0) || (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9));
}

export function goalMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const goals = personalGoals(ctx);
  const db = ctx.e.goals[0]?.prov.database ?? 'Goals Tracker';
  const templates = ctx.e.goals.filter((g) => g.isTemplate).length;
  const active = goals.filter((g) => g.goal.statusGroup !== 'done');
  const note = templates
    ? `${templates} template sample rows in ${db} are excluded. Add personal goals (Start / End values, Due) to track progress.`
    : `No goals found in ${db}.`;

  if (!goals.length) {
    out['goals.active'] = missing(ctx, { id: 'goals.active', label: 'Active goals', unit: 'goals', period: 'now', source: sourceLabel(ctx, db, [], 'goal'), calculation: 'Personal (non-template) goals not done.', note });
    out['goals.progress'] = missing(ctx, { id: 'goals.progress', label: 'Goal progress', unit: '%', period: 'now', source: sourceLabel(ctx, db, [], 'goal'), calculation: 'Average progress of active goals.', note });
    return out;
  }

  out['goals.active'] = metric(ctx, { id: 'goals.active', label: 'Active goals', value: active.length, unit: 'goals', period: 'now', source: sourceLabel(ctx, db, ['status'], 'goal'), calculation: 'Personal (non-template) goals not in a done status.', quality: 'real' });
  const progresses = active.map((g) => g.goal.progress).filter((p): p is number => p != null);
  const avg = mean(progresses);
  out['goals.progress'] =
    avg != null
      ? metric(ctx, {
          id: 'goals.progress',
          label: 'Goal progress',
          value: Math.round(avg * 100),
          unit: '%',
          ratio: avg,
          period: 'now',
          source: sourceLabel(ctx, db, ['progress', 'start', 'current', 'target'], 'goal'),
          calculation: 'Average progress of active goals: Notion progress property, else (current − start) ÷ (target − start).',
          note: `${progresses.length} of ${active.length} goals have measurable progress.`,
        })
      : missing(ctx, { id: 'goals.progress', label: 'Goal progress', unit: '%', period: 'now', source: sourceLabel(ctx, db, [], 'goal'), calculation: 'Average progress.', note: 'Goals have no progress, start/current/target values yet.' });
  return out;
}
