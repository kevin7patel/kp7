import { daysBetween, dayKey } from '../shared/dates';
import type { Goal, MetricValue, Project } from '../shared/types';
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

export interface ProjectView {
  project: Project;
  daysLeft: number | null;
  /** Linked-task completion ratio; null unless tasks carry Project relations. */
  ratio: number | null;
}

/** Projects are the real outcome layer in V1: active first, then by target date, then title. */
export function projectList(ctx: MetricContext): ProjectView[] {
  return ctx.e.projects
    .map((p) => ({
      project: p,
      daysLeft: p.targetDate ? daysBetween(ctx.today, dayKey(p.targetDate, ctx.tz)) : null,
      ratio: p.linkedTasks && p.linkedTasks.total > 0 ? p.linkedTasks.done / p.linkedTasks.total : null,
    }))
    .sort(
      (a, b) =>
        (a.project.statusGroup === 'done' ? 1 : 0) - (b.project.statusGroup === 'done' ? 1 : 0) ||
        (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9) ||
        a.project.title.localeCompare(b.project.title),
    );
}

const undatedNote = (n: number) => (n === 0 ? 'Every active project has a target date.' : `${n} active project${n === 1 ? ' has' : 's have'} no target date.`);

export function projectMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const db = ctx.e.projects[0]?.prov.database ?? 'Projects';
  const src = (fields: string[]) => sourceLabel(ctx, db, fields, 'project');
  if (!ctx.e.projects.length) {
    const note = `No rows found in ${db}.`;
    return {
      'projects.active': missing(ctx, { id: 'projects.active', label: 'Active projects', unit: 'projects', period: 'now', source: src([]), calculation: 'Projects not in a done status.', note }),
      'projects.dated': missing(ctx, { id: 'projects.dated', label: 'With target date', unit: 'projects', period: 'now', source: src([]), calculation: 'Active projects with a Target date.', note }),
    };
  }
  const statusKnown = ctx.e.projects.some((p) => p.statusGroup != null);
  const active = ctx.e.projects.filter((p) => p.statusGroup !== 'done');
  const out: Record<string, MetricValue> = {};
  out['projects.active'] = statusKnown
    ? metric(ctx, { id: 'projects.active', label: 'Active projects', value: active.length, unit: 'projects', period: 'now', source: src(['status']), calculation: 'Projects whose Status is not Done.', quality: 'real', note: `${ctx.e.projects.length} projects in total.` })
    : missing(ctx, { id: 'projects.active', label: 'Active projects', unit: 'projects', period: 'now', source: src([]), calculation: 'Projects not in a done status.', note: 'Projects have no Status property.' });
  out['projects.dated'] = ctx.demo || ctx.fieldNames.project?.targetDate
    ? metric(ctx, { id: 'projects.dated', label: 'With target date', value: active.filter((p) => p.targetDate).length, unit: 'projects', ratio: active.length ? active.filter((p) => p.targetDate).length / active.length : null, period: 'now', source: src(['targetDate']), calculation: 'Active projects with a Target date set.', quality: 'real', note: undatedNote(active.filter((p) => !p.targetDate).length) })
    : missing(ctx, { id: 'projects.dated', label: 'With target date', unit: 'projects', period: 'now', source: src([]), calculation: 'Active projects with a Target date.', note: 'Projects have no Target date property.' });
  return out;
}
