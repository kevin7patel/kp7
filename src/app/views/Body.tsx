import type { Fact, MetricValue } from '../../shared/types';
import type { DashboardModel } from '../../metrics';
import type { BodyTab } from '../router';
import { Columns, Heatmap, Ring, Sparkline } from '../components/charts';
import { Card, EmptyState, ProvenanceChip, StatTile } from '../components/ui';
import { DOMAIN_COLOR, fmtDay, fmtNum } from '../format';

function TabLinks({ tab }: { tab: BodyTab }) {
  return (
    <nav className="seg" aria-label="Body sections">
      {(['fitness', 'nutrition', 'health'] as const).map((t) => (
        <a key={t} href={`#/body/${t}`} aria-current={tab === t ? 'page' : undefined}>
          {t[0]!.toUpperCase() + t.slice(1)}
        </a>
      ))}
    </nav>
  );
}

function factQuote(facts: Fact[], category: Fact['category']) {
  const f = facts.find((x) => x.category === category);
  return f ? { text: f.text, cite: f.sourceTitle, href: f.sourceUrl } : undefined;
}

function Fitness({ model, facts }: { model: DashboardModel; facts: Fact[] }) {
  const m = model.metrics;
  const has = model.ctx.e.workouts.length > 0;
  return (
    <>
      <div className="grid">
        <StatTile m={m['fitness.workouts7d']!} color={DOMAIN_COLOR.fitness} icon="fitness" spark className="span-3 m-half" />
        <StatTile m={m['fitness.weekStreak']!} color={DOMAIN_COLOR.fitness} icon="flame" className="span-3 m-half" />
        <StatTile m={m['fitness.minutes7d']!} color={DOMAIN_COLOR.fitness} icon="clock" className="span-3 m-half" />
        <StatTile m={m['fitness.lastWorkout']!} color={DOMAIN_COLOR.fitness} icon="calendar" className="span-3 m-half" />
      </div>
      {!has ? (
        <div className="grid">
          <Card className="span-12" title="Workout log" color={DOMAIN_COLOR.fitness}>
            <EmptyState title="No workouts in Notion yet" icon="fitness" quote={factQuote(facts, 'fitness')}>
              The calendar, training frequency, exercise trends and PRs light up as soon as a workout database exists (title containing “Workout”, “Training” or “Exercise”; a Date; optional Exercise, Sets, Reps, Weight, Duration). Nothing is estimated in the meantime.
            </EmptyState>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid">
            <Card className="span-8" title="Workout calendar" hint="12 weeks" color={DOMAIN_COLOR.fitness}>
              <Heatmap cells={model.workoutHeatmap} color={DOMAIN_COLOR.fitness} today={model.ctx.today} label="Workouts by day" />
            </Card>
            <Card className="span-4" title="Personal records">
              {model.prs.length ? (
                <div className="list">
                  {model.prs.slice(0, 5).map((p) => (
                    <div className="row" key={`${p.exercise}-${p.date}`}>
                      <span className="title">
                        {p.exercise}
                        <small>{fmtDay(p.date)}</small>
                      </span>
                      <span className="badge-reward">
                        {p.weight} {p.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No PRs yet" icon="trophy" />
              )}
            </Card>
          </div>
          <div className="grid">
            {model.exerciseTrends.map((t) => (
              <Card key={t.exercise} className="span-4" title={t.exercise} hint="top weight per session" color={DOMAIN_COLOR.fitness}>
                <div style={{ fontWeight: 660, fontSize: 26, marginBottom: 6 }}>
                  {fmtNum(t.series[t.series.length - 1]!.value ?? 0)} <span className="tag">lb</span>
                </div>
                <Sparkline series={t.series} color={DOMAIN_COLOR.fitness} label={`${t.exercise} trend`} format={(v) => `${v} lb`} />
              </Card>
            ))}
            <Card className="span-12" title="Recent workouts">
              <div className="list">
                {[...model.ctx.e.workouts]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((w) => (
                    <div className="row" key={w.id}>
                      <span className="title">
                        {w.title}
                        <small>
                          {fmtDay(w.date)}
                          {w.type ? ` · ${w.type}` : ''}
                        </small>
                      </span>
                      {w.durationMin != null && <span className="pill num">{w.durationMin} min</span>}
                    </div>
                  ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function MacroRing({ m, color }: { m: MetricValue; color: string }) {
  const missing = m.quality === 'missing';
  return (
    <Card className="span-4 m-half" title={m.label} right={<ProvenanceChip m={m} />}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
        <Ring ratio={m.ratio ?? null} size={118} stroke={10} color={color} label={`${m.label} ${m.value ?? 'unknown'}`}>
          <div style={{ fontWeight: 680, fontSize: 22 }}>{missing ? '—' : (m.display ?? fmtNum(m.value ?? 0))}</div>
          {!missing && m.value != null && <div className="tag">{m.target ? `of ${fmtNum(m.target)} ${m.unit}` : m.unit}</div>}
        </Ring>
        <div className="tag" style={{ textAlign: 'center', whiteSpace: 'normal', maxWidth: '100%' }}>
          {missing ? 'Unknown — not tracked yet' : (m.note ?? (m.target ? '' : 'No target set'))}
        </div>
      </div>
    </Card>
  );
}

function Nutrition({ model, facts }: { model: DashboardModel; facts: Fact[] }) {
  const m = model.metrics;
  const has = model.ctx.e.nutrition.length > 0;
  const today = model.ctx.e.nutrition.filter((entry) => entry.date === model.ctx.today);
  return (
    <>
      {today.length > 0 && <div className="banner info" role="status">
        <div><strong>Today so far · {today.length} logged meal{today.length === 1 ? '' : 's'}</strong><p>These are logged subtotals. Full-day coverage is unconfirmed; estimates stay estimates and missing nutrients stay unknown.</p></div>
      </div>}
      <div className="grid">
        <MacroRing m={m['nutrition.calories']!} color={DOMAIN_COLOR.nutrition} />
        <MacroRing m={m['nutrition.protein']!} color={DOMAIN_COLOR.nutrition} />
        <MacroRing m={m['nutrition.water']!} color={DOMAIN_COLOR.tasks} />
      </div>
      {!has ? (
        <div className="grid">
          <Card className="span-12" title="Nutrition log" color={DOMAIN_COLOR.nutrition}>
            <EmptyState title="No meals or macros in Notion yet" icon="nutrition" quote={factQuote(facts, 'fitness')}>
              Targets are never invented. Calories, protein, hydration and weekly consistency appear once a nutrition database (Date + Calories / Protein / Water numbers) exists; target rings appear once targets are set.
            </EmptyState>
          </Card>
        </div>
      ) : (
        <div className="grid">
          <StatTile m={m['nutrition.consistency']!} color={DOMAIN_COLOR.nutrition} icon="calendar" className="span-4" />
          <Card className="span-8" title="Calories · 14 days" color={DOMAIN_COLOR.nutrition} right={<ProvenanceChip m={m['nutrition.calories']!} />}>
            {m['nutrition.calories']!.series ? <Columns series={m['nutrition.calories']!.series} color={DOMAIN_COLOR.nutrition} label="Calories per day" target={m['nutrition.calories']!.target} format={(v) => `${fmtNum(v)} kcal`} /> : <EmptyState title="Calories not tracked" />}
          </Card>
          <Card className="span-12" title="Protein · 14 days" color={DOMAIN_COLOR.nutrition} right={<ProvenanceChip m={m['nutrition.protein']!} />}>
            {m['nutrition.protein']!.series ? <Columns series={m['nutrition.protein']!.series} color={DOMAIN_COLOR.nutrition} label="Protein per day" target={m['nutrition.protein']!.target} format={(v) => `${fmtNum(v)} g`} height={110} /> : <EmptyState title="Protein not tracked" />}
          </Card>
          {today.length > 0 && <Card className="span-12" title="Today's recorded meals" color={DOMAIN_COLOR.nutrition}>
            {today.map((entry) => <div className="setting" key={entry.id}>
              <div className="s-body"><div className="s-title">{entry.label ?? 'Meal'}{entry.prov.url && <> · <a href={entry.prov.url} target="_blank" rel="noreferrer">Open in Notion</a></>}</div>
                <div className="s-desc">{entry.basis ?? 'Basis not recorded'}{entry.confidence ? ` · ${entry.confidence.toLowerCase()} confidence` : ''} · {entry.calories != null ? `${fmtNum(entry.calories)} kcal` : 'Calories unknown'}{entry.caloriesLow != null && entry.caloriesHigh != null ? ` (estimated range ${fmtNum(entry.caloriesLow)}–${fmtNum(entry.caloriesHigh)})` : ''} · {entry.protein != null ? `${fmtNum(entry.protein)} g protein` : 'Protein unknown'} · {entry.totalSugar != null ? `${fmtNum(entry.totalSugar)} g total sugar` : 'Total sugar unknown'} · {entry.addedSugar != null ? `${fmtNum(entry.addedSugar)} g added sugar` : 'Added sugar unknown'}</div>
              </div>
            </div>)}
          </Card>}
        </div>
      )}
    </>
  );
}

function Health({ model, facts }: { model: DashboardModel; facts: Fact[] }) {
  if (!model.health.length) {
    return (
      <div className="grid">
        <Card className="span-12" title="Health metrics" color={DOMAIN_COLOR.health}>
          <EmptyState title="No body or recovery data in Notion yet" icon="health" quote={factQuote(facts, 'health') ?? factQuote(facts, 'fitness')}>
            Weight, body composition, sleep, steps, resting HR, HRV, recovery and energy each get a card with a 30-day trend once any of them are recorded in a Notion health/body database. The dashboard shows values and changes only — no scores and no medical interpretation.
          </EmptyState>
        </Card>
      </div>
    );
  }
  return (
    <>
      <div className="grid">
        {model.health.map((h) => (
          <Card key={h.id} className="span-4" title={h.label} color={DOMAIN_COLOR.health} right={<ProvenanceChip m={h} />}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 680, fontSize: 30, letterSpacing: '-0.02em' }}>{fmtNum(h.value ?? 0)}</span>
              <span className="tag">{h.unit}</span>
              {h.delta && (
                <span className="delta neutral" style={{ marginLeft: 'auto' }}>
                  {h.delta.value > 0 ? '▲' : h.delta.value < 0 ? '▼' : '•'} {fmtNum(Math.abs(h.delta.value))} <span className="tag">7d avg</span>
                </span>
              )}
            </div>
            {h.series && <Sparkline series={h.series} color={DOMAIN_COLOR.health} label={`${h.label}, 30 days`} format={(v) => fmtNum(v, h.unit)} />}
            <div className="tag" style={{ marginTop: 6 }}>Latest · {h.lastUpdated && h.lastUpdated.length === 10 ? fmtDay(h.lastUpdated) : h.period}</div>
          </Card>
        ))}
      </div>
      <p className="tag" style={{ marginTop: 14 }}>Values and changes are shown as recorded. This dashboard does not score or medically interpret health data.</p>
    </>
  );
}

export function Body({ model, tab, facts }: { model: DashboardModel; tab: BodyTab; facts: Fact[] }) {
  return (
    <>
      <div className="hero page">
        <div>
          <h2>{tab === 'fitness' ? 'Fitness' : tab === 'nutrition' ? 'Nutrition' : 'Health'}</h2>
          <p>{tab === 'fitness' ? 'Training frequency, calendar, trends and records.' : tab === 'nutrition' ? 'Intake against your own targets.' : 'Body metrics and recovery trends.'}</p>
        </div>
        <div className="hero-controls">
          <TabLinks tab={tab} />
        </div>
      </div>
      {tab === 'fitness' && <Fitness model={model} facts={facts} />}
      {tab === 'nutrition' && <Nutrition model={model} facts={facts} />}
      {tab === 'health' && <Health model={model} facts={facts} />}
    </>
  );
}
