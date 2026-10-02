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
  if (waiting) {
    const label = (m['tasks.waitingOnKevin']?.label ?? 'Waiting').toLowerCase();
    items.push({ id: 'waiting', severity: 'warning', title: `${waiting} ${label}`, detail: m['tasks.waitingOnKevin']?.note ?? 'Open tasks in a Waiting state.', href: '#/tasks', kind: 'work' });
  }
  const blocked = v('tasks.blocked');
  if (blocked) items.push({ id: 'blocked', severity: 'warning', title: `${blocked} blocked`, detail: 'Open tasks marked blocked.', href: '#/tasks', kind: 'work' });

  if (ctx.source.kind === 'notion-mcp-snapshot') {
    items.push({
      id: 'connect-api',
      severity: 'info',
      title: 'Snapshot only — connect the Notion token for live sync',
      detail:
        ctx.source.coverage === 'metadata-only'
          ? 'This view is built from a titles-only snapshot. Status, due dates and priorities switch on automatically once the integration token is added.'
          : 'These are real Notion values captured by Claude at one point in time. Live 30-minute sync starts once the integration token is added.',
      href: '#/settings',
      kind: 'data',
    });
  }
  if (ctx.e.goals.length && ctx.e.goals.every((g) => g.isTemplate)) {
    items.push({ id: 'goals-template', severity: 'info', title: 'Goals Tracker excluded (unconfirmed example rows)', detail: 'Projects carry your real outcomes for now. Confirm or replace the Goals Tracker rows to show goal progress.', href: '#/goals', kind: 'data' });
  }
  const intake = facts.find((f) => f.category === 'fitness');
  if (intake && !ctx.e.workouts.length) items.push({ id: 'fitness-intake', severity: 'info', title: 'Fitness intake pending', detail: intake.text, href: intake.sourceUrl ?? '#/body', kind: 'data' });
  if (!ctx.e.dailyLogs.length) items.push({ id: 'daily-log', severity: 'info', title: 'No Daily Log yet', detail: 'Check-in streaks and the habit heatmap start as soon as a Daily Log database (one row per day, checkbox per habit) exists.', href: '#/progress', kind: 'data' });
  for (const [i, w] of ctx.warnings.entries()) items.push({ id: `warn-${i}`, severity: 'info', title: 'Sync note', detail: w, href: '#/sources', kind: 'data' });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
