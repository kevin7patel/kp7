import { dashboardConfig } from '../../config/dashboard.config';
import { addDays, daysBetween, dayKey, dayRange, hourInTz } from '../shared/dates';
import type { MetricValue, Task } from '../shared/types';
import { metric, missing, sourceLabel, type MetricContext } from './context';

export type Bucket = 'overdue' | 'today' | 'afternoon' | 'tonight';

const isOpen = (t: Task) => t.statusGroup !== null && t.statusGroup !== 'done';
const dueDay = (t: Task, tz: string) => (t.due ? dayKey(t.due, tz) : null);

export function hasStatus(ctx: MetricContext): boolean {
  return ctx.taskFields.status !== 'unavailable' && ctx.e.tasks.some((t) => t.statusGroup !== null);
}
export function hasDue(ctx: MetricContext): boolean {
  return ctx.taskFields.due !== 'unavailable';
}

export function openTasks(ctx: MetricContext): Task[] {
  return ctx.e.tasks.filter(isOpen);
}

export function bucketOf(t: Task, ctx: MetricContext): Bucket | null {
  if (!isOpen(t)) return null;
  const d = dueDay(t, ctx.tz);
  if (!d) return null;
  if (d < ctx.today) return 'overdue';
  if (d > ctx.today) return null;
  const tb = t.timeBucket ?? '';
  if (/tonight|evening|night/i.test(tb)) return 'tonight';
  if (/afternoon/i.test(tb)) return 'afternoon';
  if (/morning|today|anytime/i.test(tb)) return 'today';
  if (t.dueHasTime && t.due) {
    const h = hourInTz(t.due, ctx.tz);
    if (h >= dashboardConfig.timeBuckets.tonightFromHour) return 'tonight';
    if (h >= dashboardConfig.timeBuckets.afternoonFromHour) return 'afternoon';
  }
  return 'today';
}

export function buckets(ctx: MetricContext): Record<Bucket, Task[]> {
  const out: Record<Bucket, Task[]> = { overdue: [], today: [], afternoon: [], tonight: [] };
  for (const t of ctx.e.tasks) {
    const b = bucketOf(t, ctx);
    if (b) out[b].push(t);
  }
  const byDue = (a: Task, b: Task) => (a.due ?? '').localeCompare(b.due ?? '') || (a.priorityRank ?? 9) - (b.priorityRank ?? 9);
  for (const k of Object.keys(out) as Bucket[]) out[k].sort(byDue);
  return out;
}

export interface FocusItem {
  task: Task;
  reason: string;
  score: number;
}

/** "What should I focus on next?" — transparent scoring, highest first. */
export function focusNext(ctx: MetricContext, limit = 5): FocusItem[] {
  if (!hasStatus(ctx)) return [];
  const items: FocusItem[] = [];
  for (const t of openTasks(ctx)) {
    const d = dueDay(t, ctx.tz);
    let score = 0;
    let reason = '';
    if (d && d < ctx.today) {
      const days = daysBetween(d, ctx.today);
      score = 1000 + days;
      reason = `Overdue ${days}d`;
    } else if (d === ctx.today) {
      score = 800;
      reason = 'Due today';
    } else if (t.waitingOnKevin) {
      score = 700;
      reason = 'Waiting on you';
    } else if (t.statusGroup === 'blocked') {
      score = 650;
      reason = 'Blocked';
    } else if (d && daysBetween(ctx.today, d) <= 3) {
      score = 500 - daysBetween(ctx.today, d) * 10;
      reason = `Due in ${daysBetween(ctx.today, d)}d`;
    } else if (t.statusGroup === 'in_progress') {
      score = 300;
      reason = 'In progress';
    }
    if (t.priorityRank === 1) {
      score += 250;
      reason ||= 'Top priority';
    } else if (t.priorityRank === 2) {
      score += 120;
      reason ||= 'High priority';
    }
    if (score > 0) items.push({ task: t, reason, score });
  }
  return items.sort((a, b) => b.score - a.score || (a.task.due ?? '9').localeCompare(b.task.due ?? '9')).slice(0, limit);
}

export function upcoming(ctx: MetricContext, days = 7): Task[] {
  const end = addDays(ctx.today, days);
  return openTasks(ctx)
    .filter((t) => {
      const d = dueDay(t, ctx.tz);
      return d !== null && d > ctx.today && d <= end;
    })
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}

export function completedOn(ctx: MetricContext): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of ctx.e.tasks) {
    if (t.statusGroup !== 'done' || !t.completedAt) continue;
    const k = dayKey(t.completedAt, ctx.tz);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return map;
}

export function recentlyCompleted(ctx: MetricContext, limit = 8): Task[] {
  return ctx.e.tasks
    .filter((t) => t.statusGroup === 'done' && t.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, limit);
}

export function areaCounts(tasks: Task[]): { area: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of tasks) m.set(t.area, (m.get(t.area) ?? 0) + 1);
  return [...m.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count);
}

export function taskMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const db = ctx.e.tasks[0]?.prov.database ?? 'Tasks';
  const statusOk = hasStatus(ctx);
  const dueOk = hasDue(ctx);
  const noStatus = 'Task status is not readable from the current source. Connect the Notion API token to unlock.';
  const noDue = 'No due-date property is readable for tasks.';
  const open = openTasks(ctx);

  out['tasks.records'] = metric(ctx, {
    id: 'tasks.records',
    label: 'Task records',
    value: ctx.e.tasks.length,
    unit: 'tasks',
    period: 'all time',
    source: sourceLabel(ctx, db),
    calculation: 'Count of rows (including sub-tasks) in the Tasks database.',
    quality: 'real',
  });

  out['tasks.open'] = statusOk
    ? metric(ctx, { id: 'tasks.open', label: 'Open tasks', value: open.length, unit: 'tasks', period: 'now', source: sourceLabel(ctx, db, ['status', 'done']), calculation: 'Tasks whose status is not in a done/complete group.' })
    : missing(ctx, { id: 'tasks.open', label: 'Open tasks', unit: 'tasks', period: 'now', source: sourceLabel(ctx, db), calculation: 'Tasks not done.', note: noStatus });

  const b = statusOk && dueOk ? buckets(ctx) : null;
  out['tasks.overdue'] = b
    ? metric(ctx, { id: 'tasks.overdue', label: 'Overdue', value: b.overdue.length, unit: 'tasks', period: 'now', source: sourceLabel(ctx, db, ['status', 'due']), calculation: 'Open tasks with a due date before today.' })
    : missing(ctx, { id: 'tasks.overdue', label: 'Overdue', unit: 'tasks', period: 'now', source: sourceLabel(ctx, db), calculation: 'Open tasks due before today.', note: statusOk ? noDue : noStatus });

  out['tasks.dueToday'] = b
    ? metric(ctx, {
        id: 'tasks.dueToday',
        label: 'Due today',
        value: b.today.length + b.afternoon.length + b.tonight.length,
        unit: 'tasks',
        period: 'today',
        source: sourceLabel(ctx, db, ['status', 'due', 'timeBucket']),
        calculation: 'Open tasks due today (all time buckets).',
      })
    : missing(ctx, { id: 'tasks.dueToday', label: 'Due today', unit: 'tasks', period: 'today', source: sourceLabel(ctx, db), calculation: 'Open tasks due today.', note: statusOk ? noDue : noStatus });

  const waitingKnown = ctx.e.tasks.some((t) => t.waitingOnKevin !== null);
  const waiting = open.filter((t) => t.waitingOnKevin);
  const oldest = waiting.reduce<number | null>((max, t) => {
    if (!t.lastEditedAt) return max;
    const age = (ctx.now.getTime() - Date.parse(t.lastEditedAt)) / 86_400_000;
    return max === null || age > max ? age : max;
  }, null);
  out['tasks.waitingOnKevin'] = waitingKnown
    ? metric(ctx, {
        id: 'tasks.waitingOnKevin',
        label: 'Waiting on you',
        value: waiting.length,
        unit: 'items',
        period: 'now',
        source: sourceLabel(ctx, db, ['status', 'waitingOnKevin', 'owner']),
        calculation: 'Open tasks flagged as needing Kevin (checkbox, or status/owner text such as "Needs Kevin", "Decision", "Approval").',
        note: oldest !== null ? `Oldest untouched for ${Math.floor(oldest)}d (by last edit).` : undefined,
      })
    : missing(ctx, { id: 'tasks.waitingOnKevin', label: 'Waiting on you', unit: 'items', period: 'now', source: sourceLabel(ctx, db), calculation: 'Open tasks needing Kevin’s decision.', note: noStatus });

  out['tasks.blocked'] = statusOk
    ? metric(ctx, { id: 'tasks.blocked', label: 'Blockers', value: open.filter((t) => t.blocked).length, unit: 'items', period: 'now', source: sourceLabel(ctx, db, ['status', 'blocked']), calculation: 'Open tasks with a Blocked status or checkbox.' })
    : missing(ctx, { id: 'tasks.blocked', label: 'Blockers', unit: 'items', period: 'now', source: sourceLabel(ctx, db), calculation: 'Blocked open tasks.', note: noStatus });

  out['tasks.inProgress'] = statusOk
    ? metric(ctx, { id: 'tasks.inProgress', label: 'Working on', value: open.filter((t) => t.statusGroup === 'in_progress').length, unit: 'tasks', period: 'now', source: sourceLabel(ctx, db, ['status']), calculation: 'Tasks in an "In progress" status group.' })
    : missing(ctx, { id: 'tasks.inProgress', label: 'Working on', unit: 'tasks', period: 'now', source: sourceLabel(ctx, db), calculation: 'Tasks in progress.', note: noStatus });

  const proxy = ctx.taskFields.completedAt === 'derived';
  const proxyNote = proxy ? 'Completion date = last-edited time of done tasks (proxy; add a "Completed" date property for exact dates).' : undefined;
  const done = completedOn(ctx);
  const days28 = dayRange(addDays(ctx.today, -27), ctx.today);
  const series = days28.map((date) => ({ date, value: done.get(date)?.length ?? 0 }));
  const done7 = series.slice(-7).reduce((a, s) => a + (s.value ?? 0), 0);
  const prev7 = series.slice(-14, -7).reduce((a, s) => a + (s.value ?? 0), 0);
  const completionOk = statusOk && ctx.taskFields.completedAt !== 'unavailable';

  out['tasks.doneToday'] = completionOk
    ? metric(ctx, { id: 'tasks.doneToday', label: 'Done today', value: done.get(ctx.today)?.length ?? 0, unit: 'tasks', period: 'today', source: sourceLabel(ctx, db, ['status', 'completedAt']), calculation: 'Tasks marked done today.', note: proxyNote })
    : missing(ctx, { id: 'tasks.doneToday', label: 'Done today', unit: 'tasks', period: 'today', source: sourceLabel(ctx, db), calculation: 'Tasks completed today.', note: noStatus });

  out['tasks.done7d'] = completionOk
    ? metric(ctx, {
        id: 'tasks.done7d',
        label: 'Completed · 7 days',
        value: done7,
        unit: 'tasks',
        period: 'last 7 days',
        source: sourceLabel(ctx, db, ['status', 'completedAt']),
        calculation: 'Tasks completed in the last 7 days; sparkline shows daily completions over 28 days.',
        series,
        delta: { value: done7 - prev7, period: 'vs previous 7 days', goodWhen: 'up' },
        note: proxyNote,
      })
    : missing(ctx, { id: 'tasks.done7d', label: 'Completed · 7 days', unit: 'tasks', period: 'last 7 days', source: sourceLabel(ctx, db), calculation: 'Tasks completed in the last 7 days.', note: noStatus });

  const dueLast7 = open.filter((t) => {
    const d = dueDay(t, ctx.tz);
    return d !== null && d >= addDays(ctx.today, -6) && d <= ctx.today;
  }).length;
  out['tasks.completionRate7d'] =
    completionOk && dueOk && done7 + dueLast7 > 0
      ? metric(ctx, {
          id: 'tasks.completionRate7d',
          label: 'Weekly completion',
          value: Math.round((done7 / (done7 + dueLast7)) * 100),
          unit: '%',
          ratio: done7 / (done7 + dueLast7),
          period: 'last 7 days',
          source: sourceLabel(ctx, db, ['status', 'due', 'completedAt']),
          calculation: 'Completed in last 7 days ÷ (completed in last 7 days + open tasks that were due in the last 7 days).',
          note: proxyNote,
        })
      : missing(ctx, {
          id: 'tasks.completionRate7d',
          label: 'Weekly completion',
          unit: '%',
          period: 'last 7 days',
          source: sourceLabel(ctx, db),
          calculation: 'Completed ÷ (completed + due-but-open) over 7 days.',
          note: !completionOk ? noStatus : !dueOk ? noDue : 'Nothing completed or due in the last 7 days.',
        });

  let streak = 0;
  for (let k = done.has(ctx.today) ? ctx.today : addDays(ctx.today, -1); done.has(k); k = addDays(k, -1)) streak++;
  out['tasks.streak'] = completionOk
    ? metric(ctx, { id: 'tasks.streak', label: 'Completion streak', value: streak, unit: 'days', period: 'current', source: sourceLabel(ctx, db, ['status', 'completedAt']), calculation: 'Consecutive days (ending today or yesterday) with at least one completed task.', note: proxyNote })
    : missing(ctx, { id: 'tasks.streak', label: 'Completion streak', unit: 'days', period: 'current', source: sourceLabel(ctx, db), calculation: 'Consecutive days with a completion.', note: noStatus });

  return out;
}
