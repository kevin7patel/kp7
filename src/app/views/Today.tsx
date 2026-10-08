import { areaLabel } from '../../shared/areas';
import type { DashboardPayload, Task } from '../../shared/types';
import type { Bucket, DashboardModel } from '../../metrics';
import { areaCounts, openTasks, statusCounts, topThree } from '../../metrics/tasks';
import type { AreaFilter } from '../App';
import { HBars, Ring } from '../components/charts';
import { Icon } from '../components/Icon';
import { Card, EmptyState, HeroStat, ProjectRow, ProvenanceChip, Seg, StatTile, TaskRow } from '../components/ui';
import { DOMAIN_COLOR, fmtNum, greeting } from '../format';

const BUCKETS: { key: Bucket; label: string; icon: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: 'alert' },
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'afternoon', label: 'Afternoon', icon: 'clock' },
  { key: 'tonight', label: 'Tonight', icon: 'moon' },
];

export function AreaSeg({ area, setArea }: { area: AreaFilter; setArea: (a: AreaFilter) => void }) {
  return (
    <Seg
      label="Area filter"
      value={area}
      onChange={setArea}
      options={[
        { value: 'all', label: 'All' },
        { value: 'hotels', label: 'Hotels' },
        { value: 'personal', label: 'Personal' },
      ]}
    />
  );
}

function summary(model: DashboardModel): React.ReactNode {
  const m = model.metrics;
  const v = (id: string) => (m[id]?.quality === 'missing' ? null : (m[id]?.value ?? null));
  if (!model.capabilities.status) {
    return (
      <>
        <strong>{fmtNum(v('tasks.records') ?? 0)}</strong> task records in Notion · status and due dates not connected yet
      </>
    );
  }
  const parts: React.ReactNode[] = [];
  const due = v('tasks.dueToday');
  const over = v('tasks.overdue');
  const wait = v('tasks.waitingOnKevin');
  if (due != null) parts.push(<span key="d"><strong>{due}</strong> due today</span>);
  if (over) parts.push(<span key="o"><strong>{over}</strong> overdue</span>);
  if (wait) parts.push(<span key="w"><strong>{wait}</strong> {(m['tasks.waitingOnKevin']?.label ?? 'waiting').toLowerCase()}</span>);
  const done = v('tasks.doneToday');
  if (done) parts.push(<span key="x"><strong>{done}</strong> done</span>);
  return parts.length ? parts.flatMap((p, i) => (i ? [' · ', p] : [p])) : 'Nothing due today.';
}

/** One honest, data-derived coaching line. No scores, no invented targets. */
function coachLine(model: DashboardModel): React.ReactNode {
  const m = model.metrics;
  const v = (id: string) => (m[id]?.quality === 'missing' ? null : (m[id]?.value ?? null));
  if (!model.capabilities.status) return 'Connect live Notion data to unlock your day plan.';
  const overdue = v('tasks.overdue') ?? 0;
  const due = v('tasks.dueToday') ?? 0;
  const top = m['tasks.top3'];
  const next = topThree(model.ctx)[0];
  if (overdue > 0) return <>Clear <span className="em">{overdue} overdue</span> first, then your Top 3.</>;
  if (top && top.quality !== 'missing' && top.ratio === 1) return <>Top 3 complete. <span className="em">Strong day.</span></>;
  if (next) return <>Next up: <span className="em">{next.title}</span></>;
  if (due > 0) return <><span className="em">{due} due today.</span> Knock {due === 1 ? 'it' : 'them'} out early.</>;
  return 'Nothing due today. Move a project forward.';
}

function DayPulse({ model }: { model: DashboardModel }) {
  const m = model.metrics;
  const top = m['tasks.top3']!;
  const known = top.quality !== 'missing';
  const fourth = m['tasks.blocked']!.quality !== 'missing' || m['tasks.highPriority']!.quality === 'missing' ? m['tasks.blocked']! : m['tasks.highPriority']!;
  return (
    <section className="card pulse" aria-label="Day pulse">
      <div className="pulse-ring">
        <Ring ratio={known ? (top.ratio ?? 0) : null} size={176} stroke={14} color="var(--c-tasks)" label={`Top 3: ${known ? (top.note ?? '') : 'unknown'}`}>
          <div>
            <div className={`ring-value${known ? '' : ' unknown'}`}>{known ? top.display : '—'}</div>
            <div className="ring-label">Top 3 done</div>
          </div>
        </Ring>
        <ProvenanceChip m={top} />
      </div>
      <div className="pulse-body">
        <div className="pulse-kicker">
          <span className="eyebrow">Today’s focus</span>
        </div>
        <p className="coach">{coachLine(model)}</p>
        <div className="pulse-stats">
          <HeroStat m={m['tasks.overdue']!} color="var(--critical)" alert />
          <HeroStat m={m['tasks.dueToday']!} color={DOMAIN_COLOR.tasks} />
          <HeroStat m={m['tasks.waitingOnKevin']!} color="var(--warn)" />
          <HeroStat m={fourth} color="var(--serious)" />
        </div>
      </div>
    </section>
  );
}

function DayPlan({ model }: { model: DashboardModel }) {
  const { ctx } = model;
  if (!model.buckets) {
    const top = ctx.e.tasks.filter((t) => !t.parentTitle);
    const rows = areaCounts(top).map((a) => ({ label: areaLabel(a.area), value: a.count }));
    return (
      <Card title="Day plan" hint="Overdue · Today · Afternoon · Tonight" icon="calendar">
        <EmptyState title="Time buckets need due dates and status" icon="calendar">
          Your Tasks database is readable as titles only right now, so nothing here pretends to know what is due. Once the Notion token is connected, tasks drop into Overdue / Today / Afternoon / Tonight automatically.
        </EmptyState>
        <div style={{ marginTop: 16 }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <h3>Where the {top.length} top-level tasks sit</h3>
            <span className="hint">area derived from titles</span>
            <span className="right">
              <a className="btn ghost" href="#/tasks">
                All tasks →
              </a>
            </span>
          </div>
          <HBars rows={rows} color={DOMAIN_COLOR.tasks} label="Task records by area" />
        </div>
      </Card>
    );
  }
  const total = Object.values(model.buckets).reduce((a, b) => a + b.length, 0);
  return (
    <Card title="Day plan" hint={`${total} open`} icon="calendar" right={<a className="btn ghost" href="#/tasks">All tasks →</a>}>
      <div className="buckets">
        {BUCKETS.map((b) => {
          const list: Task[] = model.buckets![b.key];
          return (
            <div key={b.key} className={`bucket${b.key === 'overdue' && list.length ? ' overdue' : ''}`}>
              <h4>
                <Icon name={b.icon} size={14} />
                {b.label}
                <span className="count">{list.length}</span>
              </h4>
              {list.length === 0 ? (
                <div className="empty-b">{b.key === 'overdue' ? 'Nothing overdue' : 'Clear'}</div>
              ) : (
                <div className="list">
                  {list.slice(0, 5).map((t) => (
                    <TaskRow key={t.id} t={t} today={ctx.today} tz={ctx.tz} showArea={false} showStatus={false} compact />
                  ))}
                  {list.length > 5 && <div className="tag">+{list.length - 5} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FocusNext({ model }: { model: DashboardModel }) {
  const { ctx } = model;
  return (
    <Card title="Focus next" icon="bolt" hint={model.focus.length ? 'ranked' : undefined}>
      {model.focus.length === 0 ? (
        <EmptyState title={model.capabilities.status ? 'Nothing urgent' : 'Ranking needs task status'} icon="bolt">
          {model.capabilities.status
            ? 'No overdue, due-today, waiting or high-priority tasks. Pick from Upcoming on the Tasks screen.'
            : 'Focus is ranked by overdue → due today → waiting on you → priority. It switches on with live status and due dates.'}
        </EmptyState>
      ) : (
        <div className="list">
          {model.focus.map((f, i) => (
            <TaskRow key={f.task.id} t={f.task} today={ctx.today} tz={ctx.tz} reason={f.reason} rank={i + 1} showStatus={false} showArea={false} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Attention({ model }: { model: DashboardModel }) {
  const items = model.attention.slice(0, 5);
  const color = { critical: 'var(--critical)', warning: 'var(--warn)', info: 'var(--accent)' } as const;
  return (
    <Card title="Needs attention" icon="alert" hint={`${model.attention.length}`}>
      {items.length === 0 ? (
        <EmptyState title="All clear" icon="check" />
      ) : (
        <ul className="list">
          {items.map((a) => (
            <li key={a.id} className="row" style={{ alignItems: 'flex-start' }}>
              <span className="swatch" style={{ background: color[a.severity], marginTop: 6 }} aria-label={a.severity} />
              <a className="title" href={a.href} style={{ whiteSpace: 'normal' }} {...(a.href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {a.title}
                <small style={{ whiteSpace: 'normal' }}>{a.detail}</small>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Today({ model, payload, area, setArea }: { model: DashboardModel; payload: DashboardPayload; area: AreaFilter; setArea: (a: AreaFilter) => void }) {
  const m = model.metrics;
  const now = model.ctx.now;
  const sleep = model.health.find((h) => h.id === 'health.sleep_hours');
  const checkFact = payload.facts.find((f) => f.category === 'tasks');

  return (
    <>
      <div className="hero">
        <div>
          <h2>
            {greeting(now)}, Kevin
          </h2>
          <p className="summary">{summary(model)}</p>
        </div>
        <div className="hero-controls">
          <AreaSeg area={area} setArea={setArea} />
        </div>
      </div>

      <DayPulse model={model} />

      <div className="grid">
        <div className="span-8 stack">
          <DayPlan model={model} />
          {model.buckets && (
            <Card title="Upcoming deadlines" hint="next 7 days" icon="calendar" right={<a className="btn ghost" href="#/tasks">All →</a>}>
              {model.upcoming.length ? (
                <div className="list">
                  {model.upcoming.slice(0, 6).map((t) => (
                    <TaskRow key={t.id} t={t} today={model.ctx.today} tz={model.ctx.tz} />
                  ))}
                </div>
              ) : (
                <EmptyState title="Nothing due in the next 7 days" icon="check" />
              )}
            </Card>
          )}
          <Card title="Projects" hint="active outcomes" icon="goals" right={<a className="btn ghost" href="#/goals">All →</a>}>
            {model.projects.some((v) => v.project.statusGroup !== 'done') ? (
              <div className="list">
                {model.projects
                  .filter((v) => v.project.statusGroup !== 'done')
                  .slice(0, 5)
                  .map(({ project, daysLeft, ratio }) => (
                    <ProjectRow key={project.id} p={project} daysLeft={daysLeft} ratio={ratio} color={DOMAIN_COLOR.goals} />
                  ))}
              </div>
            ) : (
              <EmptyState title={model.projects.length ? 'All projects are done' : 'No projects found'} icon="goals" />
            )}
          </Card>
          {checkFact && !model.capabilities.status && (
            <Card title="From your Master Checklist" icon="tasks" flat>
              <EmptyState title="Context from Notion" icon="info" quote={{ text: checkFact.text, cite: checkFact.sourceTitle, href: checkFact.sourceUrl }} />
            </Card>
          )}
        </div>
        <div className="span-4 stack m-first">
          <FocusNext model={model} />
          <Attention model={model} />
        </div>
      </div>

      <div className="grid">
        <StatTile m={m['checkins.morning']!} color={DOMAIN_COLOR.habits} icon="sun" compact className="span-3 m-half" />
        <StatTile m={m['fitness.today']!} color={DOMAIN_COLOR.fitness} icon="fitness" compact className="span-3 m-half" />
        <StatTile m={m['nutrition.protein']!} color={DOMAIN_COLOR.nutrition} icon="nutrition" compact className="span-3 m-half" />
        {sleep ? (
          <StatTile m={sleep} color={DOMAIN_COLOR.health} icon="moon" compact className="span-3 m-half" />
        ) : (
          <StatTile
            m={{ id: 'health.sleep', label: 'Sleep', value: null, unit: 'h', period: 'last night', source: 'Notion · health database', calculation: 'Latest sleep duration.', lastUpdated: null, quality: 'missing', note: 'No sleep data in Notion yet (no wearable connected).' }}
            color={DOMAIN_COLOR.health}
            icon="moon"
            compact
            className="span-3 m-half"
          />
        )}
      </div>

      <div className="grid top">
        <StatTile m={m['tasks.done7d']!.quality !== 'missing' ? m['tasks.done7d']! : m['tasks.doneNow']!} color={DOMAIN_COLOR.tasks} icon="check" spark className="span-4" />
        <Card className="span-8" title="Active by status" icon="tasks" right={<a className="btn ghost" href="#/tasks">Tasks →</a>}>
          {model.capabilities.status ? (
            <HBars rows={statusCounts(openTasks(model.ctx)).map((r) => ({ label: r.label, value: r.count }))} color={DOMAIN_COLOR.tasks} label="Active tasks by status" />
          ) : (
            <EmptyState title="Needs task status" icon="tasks" />
          )}
        </Card>
      </div>
    </>
  );
}
