import { useMemo, useState } from 'react';
import { areaLabel } from '../../shared/areas';
import type { StatusGroup, Task } from '../../shared/types';
import type { DashboardModel } from '../../metrics';
import { areaCounts } from '../../metrics/tasks';
import type { AreaFilter } from '../App';
import { HBars } from '../components/charts';
import { Card, EmptyState, Seg, StatTile, TaskRow } from '../components/ui';
import { DOMAIN_COLOR } from '../format';
import { AreaSeg } from './Today';

type StatusFilter = 'open' | 'waiting' | 'blocked' | 'done' | 'all';

/** Parent rows followed by their sub-tasks, so hierarchy reads naturally. */
function withChildren(tasks: Task[]): Task[] {
  const children = new Map<string, Task[]>();
  const tops: Task[] = [];
  const titles = new Set(tasks.map((t) => t.title));
  for (const t of tasks) {
    if (t.parentTitle && titles.has(t.parentTitle)) children.set(t.parentTitle, [...(children.get(t.parentTitle) ?? []), t]);
    else tops.push(t);
  }
  return tops.flatMap((t) => [t, ...(children.get(t.title) ?? [])]);
}

function matches(t: Task, f: StatusFilter): boolean {
  const g: StatusGroup | null = t.statusGroup;
  if (f === 'all') return true;
  if (f === 'open') return g !== null && g !== 'done';
  if (f === 'waiting') return g === 'waiting' || t.waitingOnKevin === true;
  if (f === 'blocked') return g === 'blocked' || t.blocked === true;
  return g === 'done';
}

export function Tasks({ model, area, setArea }: { model: DashboardModel; area: AreaFilter; setArea: (a: AreaFilter) => void }) {
  const { ctx } = model;
  const statusOk = model.capabilities.status;
  const [filter, setFilter] = useState<StatusFilter>(statusOk ? 'open' : 'all');
  const [q, setQ] = useState('');
  const effective = statusOk ? filter : 'all';

  const groups = useMemo(() => {
    const list = ctx.e.tasks.filter((t) => matches(t, effective) && (!q || `${t.title} ${t.parentTitle ?? ''}`.toLowerCase().includes(q.toLowerCase())));
    const byArea = new Map<string, Task[]>();
    for (const t of list) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
    return [...byArea.entries()]
      .map(([a, ts]) => ({ area: a, tasks: withChildren(ts.sort((x, y) => (x.due ?? '9').localeCompare(y.due ?? '9') || x.title.localeCompare(y.title))) }))
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [ctx.e.tasks, effective, q]);

  const shown = groups.reduce((a, g) => a + g.tasks.length, 0);
  const base = statusOk ? ctx.e.tasks.filter((t) => t.statusGroup !== 'done') : ctx.e.tasks.filter((t) => !t.parentTitle);
  const areaRows = areaCounts(base).map((a) => ({ label: areaLabel(a.area), value: a.count }));
  const derivedArea = ctx.taskFields.area === 'derived';

  return (
    <>
      <div className="hero page">
        <div>
          <h2>Tasks</h2>
          <p>
            {statusOk ? `${model.metrics['tasks.open']!.value} open · ${model.metrics['tasks.done7d']!.value ?? 0} completed this week` : `${ctx.e.tasks.length} records from Notion (titles only)`}
          </p>
        </div>
        <div className="hero-controls">
          <AreaSeg area={area} setArea={setArea} />
        </div>
      </div>

      <div className="grid">
        <StatTile m={model.metrics['tasks.open']!} color={DOMAIN_COLOR.tasks} icon="tasks" compact className="span-3 m-half" />
        <StatTile m={model.metrics['tasks.inProgress']!} color="var(--accent)" icon="bolt" compact className="span-3 m-half" />
        <StatTile m={model.metrics['tasks.doneToday']!} color="var(--good)" icon="check" compact className="span-3 m-half" />
        <StatTile m={model.metrics['tasks.records']!} color="var(--text-3)" icon="sources" compact className="span-3 m-half" />
      </div>

      <div className="grid">
        <Card
          className="span-8"
          title={`${shown} ${effective === 'all' ? 'tasks' : effective}`}
          icon="tasks"
          right={
            statusOk ? (
              <Seg
                label="Status filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'waiting', label: 'Waiting' },
                  { value: 'blocked', label: 'Blocked' },
                  { value: 'done', label: 'Done' },
                  { value: 'all', label: 'All' },
                ]}
              />
            ) : undefined
          }
        >
          <input className="input" type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" style={{ marginBottom: 10 }} />
          {!statusOk && (
            <div style={{ marginBottom: 12 }}>
              <EmptyState title="Status, due date and priority aren’t readable yet" icon="info">
                Showing every task record as a title. Open/done filters, due dates and priorities appear once the Notion token is connected. Sub-tasks are shown under their parent.
              </EmptyState>
            </div>
          )}
          {groups.length === 0 && <EmptyState title="No tasks match" icon="check" />}
          {groups.map((g) => (
            <div key={g.area} style={{ marginTop: 8 }}>
              <div className="eyebrow" style={{ margin: '10px 0 2px' }}>
                {areaLabel(g.area)} · {g.tasks.length}
              </div>
              <div className="list">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} today={ctx.today} tz={ctx.tz} showArea={false} />
                ))}
              </div>
            </div>
          ))}
        </Card>

        <div className="span-4 stack">
          <Card title={statusOk ? 'Open work by area' : 'Tasks by area'} hint={derivedArea ? 'derived from titles' : 'Notion area'} icon="progress">
            <HBars rows={areaRows} color={DOMAIN_COLOR.tasks} label="Tasks by area" />
          </Card>
          <Card title="Upcoming · 7 days" icon="calendar">
            {model.upcoming.length ? (
              <div className="list">
                {model.upcoming.slice(0, 8).map((t) => (
                  <TaskRow key={t.id} t={t} today={ctx.today} tz={ctx.tz} showStatus={false} />
                ))}
              </div>
            ) : (
              <EmptyState title={model.capabilities.due ? 'Nothing due in the next 7 days' : 'Needs due dates'} icon="calendar" />
            )}
          </Card>
          <Card title="Recently completed" icon="check">
            {model.recentDone.length ? (
              <div className="list">
                {model.recentDone.map((t) => (
                  <TaskRow key={t.id} t={t} today={ctx.today} tz={ctx.tz} showStatus={false} reason={t.completedAt ? `done ${new Date(t.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${t.completedAtSource === 'derived' ? ' (by last edit)' : ''}` : undefined} />
                ))}
              </div>
            ) : (
              <EmptyState title={statusOk ? 'No completions yet' : 'Needs task status'} icon="check" />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
