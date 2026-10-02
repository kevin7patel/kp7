import type { DashboardPayload } from '../../shared/types';
import type { DashState, SyncView } from '../data/useDashboard';
import { Icon } from '../components/Icon';
import { Card } from '../components/ui';
import { fmtDateTime } from '../format';

const CATEGORY_LABEL: Record<string, string> = {
  tasks: 'Tasks / To-do',
  projects: 'Projects',
  goals: 'Goals',
  habits: 'Habits',
  routines: 'Daily routines',
  fitness: 'Fitness',
  workouts: 'Workouts',
  nutrition: 'Nutrition',
  health: 'Health',
  body: 'Body metrics',
  sleep: 'Sleep / recovery',
  development: 'Personal development',
  milestones: 'Milestones',
  automations: 'Automations / agents',
  finance: 'Finance',
  travel: 'Travel',
  notes: 'Notes & hub pages',
};

export function Sources({ payload, state, view }: { payload: DashboardPayload; state: DashState; view: SyncView }) {
  const s = payload.source;
  return (
    <>
      <div className="hero page">
        <div>
          <h2>Sources</h2>
          <p>What the dashboard reads from Notion, how fresh it is, and how every number is built.</p>
        </div>
      </div>

      <div className="grid">
        <Card className="span-6" title="Connection" icon="sources">
          <dl className="kv">
            <dt>Source</dt>
            <dd>{s.label}</dd>
            <dt>Coverage</dt>
            <dd>{s.coverage === 'metadata-only' ? 'Titles, hierarchy and edit times only' : s.coverage === 'full' ? 'All mapped properties' : s.coverage}</dd>
            <dt>Read from Notion</dt>
            <dd>{fmtDateTime(s.capturedAt)}</dd>
            <dt>Last synced</dt>
            <dd>{view.lastSynced ? fmtDateTime(view.lastSynced) : '—'}</dd>
            <dt>Delivery</dt>
            <dd>{state.mode === 'encrypted' ? 'Encrypted payload (AES-256-GCM), decrypted on this device' : state.mode === 'plain' ? 'Local payload (this machine)' : state.mode}</dd>
            <dt>Scheduled sync</dt>
            <dd>
              {state.lastRun ? (
                <a href={state.lastRun.url} target="_blank" rel="noreferrer">
                  {state.lastRun.status === 'completed' ? state.lastRun.conclusion : state.lastRun.status} · {fmtDateTime(state.lastRun.updatedAt)} ↗
                </a>
              ) : (
                'Every 30 min via GitHub Actions once configured'
              )}
            </dd>
          </dl>
          {s.notes.length > 0 && (
            <ul style={{ margin: '14px 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13, display: 'grid', gap: 4 }}>
              {s.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="span-6" title="Last pipeline run" icon="sync" hint={fmtDateTime(payload.generatedAt)}>
          <div className="stages" style={{ marginBottom: 14 }}>
            {payload.sync.stages.map((st, i) => (
              <span key={st.stage} style={{ display: 'contents' }}>
                {i > 0 && <span className="stage-arrow">→</span>}
                <span className={`stage ${st.ok ? 'ok' : 'fail'}`} title={st.detail}>
                  <Icon name={st.ok ? 'check' : 'alert'} size={13} />
                  {st.stage}
                </span>
              </span>
            ))}
          </div>
          <div className="list">
            {payload.verification.checks.map((c) => (
              <div className="row" key={c.name} style={{ minHeight: 34 }}>
                <Icon name={c.ok ? 'check' : 'alert'} size={14} />
                <span className="title" style={{ fontWeight: 500 }}>
                  {c.name}
                </span>
                <span className="tag">{c.detail}</span>
              </div>
            ))}
          </div>
          {payload.sync.warnings.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>
              {payload.sync.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid">
        <Card className="span-12" title="Notion → dashboard map" hint="what exists, what’s partial, what’s missing" icon="sources">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Notion sources</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payload.sourceMap.map((e) => (
                  <tr key={e.category}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                    <td>
                      <span className={`map-status ${e.status}`}>{e.status}</span>
                    </td>
                    <td>
                      {e.sources.length ? (
                        e.sources.map((src) => (
                          <div key={src.title}>
                            {src.url ? (
                              <a href={src.url} target="_blank" rel="noreferrer">
                                {src.title}
                              </a>
                            ) : (
                              src.title
                            )}{' '}
                            <span className="tag">{src.note.length > 60 ? `${src.note.slice(0, 60)}…` : src.note}</span>
                          </div>
                        ))
                      ) : (
                        <span className="tag">—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-2)', minWidth: 220 }}>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid">
        <Card className="span-8" title="Schema inspector" hint="Notion properties → logical fields" icon="settings">
          {payload.schema.map((sc) => (
            <details key={sc.databaseId + sc.database} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {sc.database} <span className="tag">· {sc.entity} · {sc.rowCount} rows · {sc.properties.length} properties</span>
              </summary>
              <div className="table-scroll" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Logical field</th>
                      <th>Notion property</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(sc.resolved).map(([field, prop]) => (
                      <tr key={field}>
                        <td className="num">{field}</td>
                        <td>{prop ? <span className="code">{prop}</span> : <span className="tag">not found</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tag" style={{ marginTop: 6 }}>
                Available: {sc.properties.map((p) => `${p.name} (${p.type})`).join(', ') || '—'}
              </div>
            </details>
          ))}
        </Card>
        <Card className="span-4" title="Hub pages" icon="external">
          <div className="list">
            {payload.entities.documents.map((d) => (
              <div className="row" key={d.id}>
                {d.url ? (
                  <a className="title" href={d.url} target="_blank" rel="noreferrer">
                    {d.title}
                    <small>{d.kind}</small>
                  </a>
                ) : (
                  <span className="title">{d.title}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
