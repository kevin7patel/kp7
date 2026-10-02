import { addDays, daysBetween, dayKey } from '../../shared/dates';
import type { DashboardModel } from '../../metrics';
import { Meter, Ring } from '../components/charts';
import { Card, EmptyState, StatTile } from '../components/ui';
import { DOMAIN_COLOR, fmtDay, fmtNum } from '../format';

function Timeline({ model }: { model: DashboardModel }) {
  const { today, tz } = model.ctx;
  const dated = model.goals.filter((g) => g.goal.due && g.goal.statusGroup !== 'done');
  if (!dated.length) return null;
  const end = dated.reduce((max, g) => (dayKey(g.goal.due!, tz) > max ? dayKey(g.goal.due!, tz) : max), addDays(today, 30));
  const span = Math.max(1, daysBetween(today, end));
  const pct = (d: string) => Math.max(0, Math.min(100, (daysBetween(today, d) / span) * 100));
  const pos = (d: string) => `${pct(d)}%`;
  const align = (d: string) => (pct(d) > 82 ? 'translateX(-100%)' : pct(d) < 12 ? 'none' : 'translateX(-50%)');
  return (
    <Card className="span-12" title="Milestone timeline" hint={`today → ${fmtDay(end)}`} color={DOMAIN_COLOR.goals}>
      <div className="timeline" role="list" aria-label="Goal due dates">
        <div className="axis" />
        <div className="mark today" style={{ left: '0%' }} title="Today" />
        <div className="label below" style={{ left: '0%', transform: 'none' }}>
          Today
        </div>
        {dated.map((g, i) => {
          const d = dayKey(g.goal.due!, tz);
          return (
            <div key={g.goal.id} role="listitem">
              <div className="mark" style={{ left: pos(d) }} title={`${g.goal.title} — ${fmtDay(d)}`} />
              <div className={`label${i % 2 ? ' below' : ''}`} style={{ left: pos(d), transform: align(d) }}>
                {g.goal.title.length > 26 ? `${g.goal.title.slice(0, 25)}…` : g.goal.title}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function Goals({ model }: { model: DashboardModel }) {
  const m = model.metrics;
  const templates = model.ctx.e.goals.filter((g) => g.isTemplate);
  return (
    <>
      <div className="hero page">
        <div>
          <h2>Goals</h2>
          <p>Measurable distance to target, with due-date countdowns.</p>
        </div>
      </div>
      <div className="grid">
        <StatTile m={m['goals.active']!} color={DOMAIN_COLOR.goals} icon="goals" className="span-6 m-half" />
        <StatTile m={m['goals.progress']!} color={DOMAIN_COLOR.goals} icon="progress" className="span-6 m-half" />
      </div>

      {model.goals.length === 0 ? (
        <div className="grid">
          <Card className="span-12" title="Personal goals" color={DOMAIN_COLOR.goals}>
            <EmptyState title="No personal goals in Notion yet" icon="goals">
              Your Goals Tracker currently holds only Notion template sample rows, so nothing is shown as your goal. Add rows with a title, Start value, End value (target), a current value or Progress, and a Due date — progress rings and the timeline fill in automatically.
            </EmptyState>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid">
            {model.goals.map(({ goal: g, daysLeft, remaining }) => (
              <Card key={g.id} className="span-6">
                <div className="goal">
                  <Ring ratio={g.progress} size={84} stroke={8} color={DOMAIN_COLOR.goals} label={`${g.title} ${g.progress != null ? Math.round(g.progress * 100) : 'unknown'}%`}>
                    <div style={{ fontWeight: 680, fontSize: 18 }}>{g.progress != null ? `${Math.round(g.progress * 100)}%` : '—'}</div>
                  </Ring>
                  <div className="g-body">
                    <div className="g-title">
                      {g.url ? (
                        <a href={g.url} target="_blank" rel="noreferrer">
                          {g.title}
                        </a>
                      ) : (
                        g.title
                      )}
                    </div>
                    <div className="g-meta">
                      {g.start != null && g.target != null && (
                        <span className="num">
                          {fmtNum(g.start)} → <strong style={{ color: 'var(--text)' }}>{g.current != null ? fmtNum(g.current) : '?'}</strong> → {fmtNum(g.target)} {g.unit ?? ''}
                        </span>
                      )}
                      {remaining != null && (
                        <span>
                          {fmtNum(Math.abs(remaining))} {g.unit ?? ''} to go
                        </span>
                      )}
                      {daysLeft != null && <span>{daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d past due`}</span>}
                      <span>{g.progressSource === 'derived' ? 'progress derived' : g.progressSource === 'notion' ? 'progress from Notion' : 'no progress value'}</span>
                    </div>
                    {g.progress != null && (
                      <div style={{ marginTop: 10 }}>
                        <Meter ratio={g.progress} color={DOMAIN_COLOR.goals} label={`${g.title} progress`} />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="grid">
            <Timeline model={model} />
          </div>
        </>
      )}

      {templates.length > 0 && (
        <div className="grid">
          <Card className="span-12" title="Excluded rows" hint="not shown as goals" flat>
            <div className="list">
              {templates.map((g) => (
                <div className="row" key={g.id}>
                  {g.url ? (
                    <a className="title" href={g.url} target="_blank" rel="noreferrer">
                      {g.title}
                      <small>{g.templateReason}</small>
                    </a>
                  ) : (
                    <span className="title">
                      {g.title}
                      <small>{g.templateReason}</small>
                    </span>
                  )}
                  <span className="pill">Template sample</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
