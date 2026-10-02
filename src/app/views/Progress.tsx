import { dashboardConfig } from '../../../config/dashboard.config';
import type { DashboardModel } from '../../metrics';
import { Columns, DotStrip, Heatmap, Meter, Ring } from '../components/charts';
import { Icon } from '../components/Icon';
import { Card, EmptyState, ProvenanceChip, SectionTitle, StatTile } from '../components/ui';
import { DOMAIN_COLOR, fmtDay } from '../format';

export function Progress({ model }: { model: DashboardModel }) {
  const m = model.metrics;
  const done = m['tasks.done7d']!;
  const rate = m['tasks.completionRate7d']!;
  const workouts = m['fitness.workouts7d']!;
  const hasLogs = model.ctx.e.dailyLogs.length > 0;
  const today = model.ctx.today;

  return (
    <>
      <div className="hero page">
        <div>
          <h2>Progress</h2>
          <p>Evidence of consistency — streaks count real days; missed days stay visible.</p>
        </div>
      </div>

      <div className="grid">
        <StatTile m={done} color={DOMAIN_COLOR.tasks} icon="check" spark className="span-3 m-half" />
        <StatTile m={m['tasks.streak']!} color={DOMAIN_COLOR.tasks} icon="flame" className="span-3 m-half" />
        <StatTile m={m['habits.consistency']!} color={DOMAIN_COLOR.habits} icon="calendar" className="span-3 m-half" />
        <StatTile m={workouts} color={DOMAIN_COLOR.fitness} icon="fitness" spark className="span-3 m-half" />
      </div>

      <div className="grid">
        <Card className="span-8" title="Tasks completed per day" hint="28 days" color={DOMAIN_COLOR.tasks} right={<ProvenanceChip m={done} />}>
          {done.quality === 'missing' || !done.series ? (
            <EmptyState title="Completion history needs task status" icon="progress">
              {done.note}
            </EmptyState>
          ) : (
            <Columns series={done.series} color={DOMAIN_COLOR.tasks} label="Tasks completed per day" height={150} format={(v) => `${v} done`} />
          )}
        </Card>
        <Card className="span-4" title="Weekly completion" right={<ProvenanceChip m={rate} />}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
            <Ring ratio={rate.ratio ?? null} size={132} stroke={11} color={DOMAIN_COLOR.tasks} label={`Weekly completion ${rate.value ?? 'unknown'}%`}>
              <div style={{ fontWeight: 680, fontSize: 30 }}>{rate.value != null ? `${rate.value}%` : '—'}</div>
              <div className="tag">7 days</div>
            </Ring>
            <div style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>{rate.quality === 'missing' ? rate.note : rate.calculation}</div>
          </div>
        </Card>
      </div>

      <SectionTitle title="Daily check-ins" hint="9 AM check-in · 10 PM journal (Build a Better Me)" />
      <div className="grid">
        {dashboardConfig.checkins.map((c) => {
          const cm = m[`checkins.${c.id}`]!;
          return (
            <Card key={c.id} className="span-6" title={c.label} color={DOMAIN_COLOR.habits} right={<ProvenanceChip m={cm} />}>
              {cm.quality === 'missing' ? (
                <EmptyState title="Not tracked yet" icon="calendar">
                  {cm.note}
                </EmptyState>
              ) : (
                <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                  <Ring ratio={cm.ratio ?? null} color={DOMAIN_COLOR.habits} label={`${c.label} consistency`}>
                    <div style={{ fontWeight: 660, fontSize: 20 }}>{cm.ratio != null ? `${Math.round(cm.ratio * 100)}%` : '—'}</div>
                  </Ring>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 18 }}>
                      {cm.display} {cm.display === 'Done' && <span className="badge-reward"><Icon name="check" size={12} /> today</span>}
                    </div>
                    <div className="tag" style={{ marginBottom: 8 }}>{cm.note}</div>
                    {cm.series && <DotStrip series={cm.series} color={DOMAIN_COLOR.habits} label={`${c.label}, last 28 days`} />}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid">
        <Card className="span-8" title="Habit calendar" hint={`${dashboardConfig.windows.heatmapWeeks} weeks`} color={DOMAIN_COLOR.habits}>
          {hasLogs ? (
            <Heatmap cells={model.habitHeatmap} color={DOMAIN_COLOR.habits} today={today} label="Habit completion by day" />
          ) : (
            <EmptyState title="Streak calendar starts with a Daily Log" icon="calendar">
              Create a Notion database named “Daily Log” with a Date and one checkbox per habit (e.g. Morning check-in, Evening journal). It is discovered and charted automatically — no code change.
            </EmptyState>
          )}
        </Card>
        <Card className="span-4" title="Habits" hint="28-day rate">
          {model.habits.length ? (
            <div className="list">
              {model.habits.map((h) => (
                <div className="row" key={h.name} style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 560, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {h.name}
                      {h.streak >= 3 && (
                        <span className="badge-reward" title={`${h.streak}-day streak`}>
                          <Icon name="flame" size={12} />
                          {h.streak}
                        </span>
                      )}
                    </div>
                    {h.rate != null && <Meter ratio={h.rate} color={DOMAIN_COLOR.habits} label={`${h.name} rate`} />}
                  </div>
                  <div className="num" style={{ textAlign: 'right', fontWeight: 620 }}>
                    {h.rate != null ? `${Math.round(h.rate * 100)}%` : '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No habits tracked" icon="calendar" />
          )}
        </Card>
      </div>

      <SectionTitle title="Training consistency" />
      <div className="grid">
        <Card className="span-6" title="Sessions per week" hint="12 weeks" color={DOMAIN_COLOR.fitness} right={<ProvenanceChip m={workouts} />}>
          {workouts.quality === 'missing' || !workouts.series ? (
            <EmptyState title="No workouts logged" icon="fitness">
              {workouts.note}
            </EmptyState>
          ) : (
            <Columns series={workouts.series} color={DOMAIN_COLOR.fitness} label="Workouts per week" format={(v) => `${v} sessions`} target={workouts.target} xLabel={(d) => `wk ${fmtDay(d).replace(/^\w+, /, '')}`} />
          )}
        </Card>
        <Card className="span-6" title="Recent personal records" icon="trophy">
          {model.prs.length ? (
            <div className="list">
              {model.prs.map((p) => (
                <div className="row" key={`${p.exercise}-${p.date}`}>
                  <span className="title">
                    {p.exercise}
                    <small>
                      {fmtDay(p.date)} · previous best {p.previous} {p.unit}
                    </small>
                  </span>
                  <span className="badge-reward">
                    <Icon name="trophy" size={12} /> {p.weight} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No records yet" icon="trophy">
              PRs are calculated when a workout log has exercise + weight properties.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
