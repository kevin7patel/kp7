import type { Fact, MetricValue } from '../shared/types';
import type { MetricContext } from './context';

export interface AttentionItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** In-app route or external URL. */
  href?: string;
  kind: 'work' | 'data';
}

/** "What needs my attention?" — work items first, then data/system gaps. */
export function attention(ctx: MetricContext, m: Record<string, MetricValue>, facts: Fact[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  const v = (id: string) => (m[id]?.quality !== 'missing' ? (m[id]?.value ?? null) : null);

  const overdue = v('tasks.overdue');
  if (overdue) items.push({ id: 'overdue', severity: 'critical', title: `${overdue} overdue task${overdue === 1 ? '' : 's'}`, detail: 'Past their due date and still open.', href: '#/tasks', kind: 'work' });
  const waiting = v('tasks.waitingOnKevin');
  if (waiting) items.push({ id: 'waiting', severity: 'warning', title: `${waiting} waiting on you`, detail: m['tasks.waitingOnKevin']?.note ?? 'Decisions or approvals agents are waiting for.', href: '#/tasks', kind: 'work' });
  const blocked = v('tasks.blocked');
  if (blocked) items.push({ id: 'blocked', severity: 'warning', title: `${blocked} blocked`, detail: 'Open tasks marked blocked.', href: '#/tasks', kind: 'work' });

  if (ctx.source.coverage === 'metadata-only') {
    items.push({
      id: 'connect-api',
      severity: 'info',
      title: 'Connect the Notion API for live status and due dates',
      detail: 'This view is built from a titles-only snapshot. Overdue, Today, Waiting-on-you and completion metrics switch on automatically once the integration token is added.',
      href: '#/settings',
      kind: 'data',
    });
  }
  if (ctx.e.goals.length && ctx.e.goals.every((g) => g.isTemplate)) {
    items.push({ id: 'goals-template', severity: 'info', title: 'Goals Tracker contains only template samples', detail: 'Add personal goals with Start / End values and a Due date, or archive the sample rows.', href: '#/goals', kind: 'data' });
  }
  const intake = facts.find((f) => f.category === 'fitness');
  if (intake && !ctx.e.workouts.length) items.push({ id: 'fitness-intake', severity: 'info', title: 'Fitness intake pending', detail: intake.text, href: intake.sourceUrl ?? '#/body', kind: 'data' });
  if (!ctx.e.dailyLogs.length) items.push({ id: 'daily-log', severity: 'info', title: 'No Daily Log yet', detail: 'Check-in streaks and the habit heatmap start as soon as a Daily Log database (one row per day, checkbox per habit) exists.', href: '#/progress', kind: 'data' });
  for (const [i, w] of ctx.warnings.entries()) items.push({ id: `warn-${i}`, severity: 'info', title: 'Sync note', detail: w, href: '#/sources', kind: 'data' });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
