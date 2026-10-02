import { useEffect, useMemo, useState } from 'react';
import { areaGroup } from '../shared/areas';
import { deviceTimezone, relativeTime } from '../shared/dates';
import type { DashboardPayload } from '../shared/types';
import { computeDashboard } from '../metrics';
import { Icon } from './components/Icon';
import { KEYS, store } from './data/storage';
import { syncView, useDashboard, type SyncView } from './data/useDashboard';
import { fmtDateTime } from './format';
import { useLocation, type Route } from './router';
import { useTheme } from './theme';
import { Body } from './views/Body';
import { Gate } from './views/Gate';
import { Goals } from './views/Goals';
import { Progress } from './views/Progress';
import { Settings } from './views/Settings';
import { Sources } from './views/Sources';
import { Tasks } from './views/Tasks';
import { Today } from './views/Today';

export type AreaFilter = 'all' | 'hotels' | 'personal';

const NAV: { route: Route; hash: string; label: string; icon: string; color?: string }[] = [
  { route: 'today', hash: '#/today', label: 'Today', icon: 'today' },
  { route: 'tasks', hash: '#/tasks', label: 'Tasks', icon: 'tasks', color: 'var(--c-tasks)' },
  { route: 'progress', hash: '#/progress', label: 'Progress', icon: 'progress', color: 'var(--c-habits)' },
  { route: 'body', hash: '#/body/fitness', label: 'Fitness', icon: 'fitness', color: 'var(--c-fitness)' },
  { route: 'body', hash: '#/body/nutrition', label: 'Nutrition', icon: 'nutrition', color: 'var(--c-nutrition)' },
  { route: 'body', hash: '#/body/health', label: 'Health', icon: 'health', color: 'var(--c-health)' },
  { route: 'goals', hash: '#/goals', label: 'Goals', icon: 'goals', color: 'var(--c-goals)' },
];
const TABS: { route: Route; hash: string; label: string; icon: string }[] = [
  { route: 'today', hash: '#/today', label: 'Today', icon: 'today' },
  { route: 'tasks', hash: '#/tasks', label: 'Tasks', icon: 'tasks' },
  { route: 'progress', hash: '#/progress', label: 'Progress', icon: 'progress' },
  { route: 'body', hash: '#/body/fitness', label: 'Body', icon: 'body' },
  { route: 'goals', hash: '#/goals', label: 'Goals', icon: 'goals' },
];
const TITLES: Record<Route, string> = { today: 'Today', tasks: 'Tasks', progress: 'Progress', body: 'Body', goals: 'Goals', sources: 'Sources', settings: 'Settings' };

function filterPayload(p: DashboardPayload, area: AreaFilter): DashboardPayload {
  if (area === 'all') return p;
  return { ...p, entities: { ...p.entities, tasks: p.entities.tasks.filter((t) => areaGroup(t.area) === area), projects: p.entities.projects.filter((x) => areaGroup(x.area) === area) } };
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function SyncPill({ view, onSync, busy }: { view: SyncView; onSync: () => void; busy: boolean }) {
  const now = new Date();
  return (
    <div className="sync" title={`${view.detail}${view.lastSynced ? ` Last synced ${fmtDateTime(view.lastSynced)}.` : ''}`}>
      <span className={`state ${view.kind}`} aria-hidden />
      <span className="sync-label">
        {view.lastSynced ? (
          <>
            {view.label} · <span className="num">{relativeTime(view.lastSynced, now)}</span>
          </>
        ) : (
          view.label
        )}
      </span>
      <button type="button" onClick={onSync} disabled={busy} aria-label="Sync now">
        <Icon name="sync" size={14} className={busy ? 'spin' : undefined} />
        <span className="desktop-only">Sync now</span>
      </button>
    </div>
  );
}

export function App() {
  const loc = useLocation();
  const theme = useTheme();
  const dash = useDashboard();
  const now = useMinuteClock();
  const tz = deviceTimezone();
  const [area, setAreaState] = useState<AreaFilter>(() => (store.get(KEYS.area) as AreaFilter) || 'all');
  const setArea = (a: AreaFilter) => {
    store.set(KEYS.area, a === 'all' ? null : a);
    setAreaState(a);
  };
  const [hiddenSnapshot, setHiddenSnapshot] = useState(() => store.get(KEYS.hideSnapshot));
  const { state } = dash;
  const view = syncView(state, now);
  const filtered = useMemo(() => (state.payload ? filterPayload(state.payload, area) : null), [state.payload, area]);
  const minuteKey = Math.floor(now.getTime() / 60_000);
  const model = useMemo(() => (filtered ? computeDashboard(filtered, new Date(minuteKey * 60_000), tz) : null), [filtered, minuteKey, tz]);

  const banners = [];
  if (state.mode === 'demo')
    banners.push(
      <div className="banner demo" key="demo" role="status">
        <Icon name="sparkle" className="b-icon" />
        <div>
          <strong>Demo data — synthetic, not yours.</strong>
          <p>Every value on screen is generated for previewing visuals. Nothing here comes from Notion.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => dash.setDemo(false)}>
            Exit demo
          </button>
        </div>
      </div>,
    );
  else if (state.payload && view.kind === 'snapshot' && hiddenSnapshot !== state.payload.source.capturedAt) {
    banners.push(
      <div className="banner info" key="snap" role="status">
        <Icon name="info" className="b-icon" />
        <div>
          <strong>Snapshot mode · titles only</strong>
          <p>
            Real task, project and goal titles read from Notion by Claude on {fmtDateTime(state.payload.source.capturedAt)}. Status, due dates, priorities and live sync switch on once the Notion integration token is configured.
          </p>
        </div>
        <div className="actions">
          <a className="btn" href="#/settings">
            Setup
          </a>
          <button
            className="btn ghost"
            onClick={() => {
              store.set(KEYS.hideSnapshot, state.payload!.source.capturedAt);
              setHiddenSnapshot(state.payload!.source.capturedAt);
            }}
          >
            Hide
          </button>
        </div>
      </div>,
    );
  } else if (state.payload && (view.kind === 'stale' || view.kind === 'error' || view.kind === 'offline')) {
    banners.push(
      <div className={`banner ${view.kind === 'error' ? 'error' : 'warn'}`} key="fresh" role="status">
        <Icon name="alert" className="b-icon" />
        <div>
          <strong>{view.kind === 'stale' && state.payload.source.kind === 'notion-mcp-snapshot' ? 'Snapshot is getting old' : view.label}</strong>
          <p>
            {view.detail} {view.lastSynced ? `Last synced ${fmtDateTime(view.lastSynced)}.` : ''}
          </p>
        </div>
        <div className="actions">
          {state.lastRun && view.kind === 'error' && (
            <a className="btn" href={state.lastRun.url} target="_blank" rel="noreferrer">
              View run
            </a>
          )}
          <button className="btn" onClick={() => void dash.syncNow()}>
            Retry
          </button>
        </div>
      </div>,
    );
  }
  if (state.message)
    banners.push(
      <div className={`banner ${state.message.kind === 'error' ? 'error' : 'info'}`} key="msg" role="status">
        <Icon name={state.message.kind === 'error' ? 'alert' : 'check'} className="b-icon" />
        <div>
          <p style={{ margin: 0, color: 'var(--text)' }}>{state.message.text}</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={dash.dismissMessage}>
            Dismiss
          </button>
        </div>
      </div>,
    );

  let content: React.ReactNode;
  if (loc.route === 'settings') content = <Settings theme={theme} dash={dash} />;
  else if (!state.payload || !model) content = <Gate state={state} dash={dash} />;
  else if (loc.route === 'sources') content = <Sources payload={state.payload} state={state} view={view} />;
  else if (loc.route === 'tasks') content = <Tasks model={model} area={area} setArea={setArea} />;
  else if (loc.route === 'progress') content = <Progress model={model} />;
  else if (loc.route === 'body') content = <Body model={model} tab={loc.tab} facts={state.payload.facts} />;
  else if (loc.route === 'goals') content = <Goals model={model} />;
  else content = <Today model={model} payload={state.payload} area={area} setArea={setArea} />;

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>
            Command Center
            <small>Kevin · personal OS</small>
          </span>
        </div>
        {NAV.map((n) => (
          <a key={n.hash} className="nav-item" href={n.hash} aria-current={n.route === loc.route && (n.route !== 'body' || n.hash.endsWith(loc.tab)) ? 'page' : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span className="lbl">{n.label}</span>
            {n.color && <span className="dot" style={{ background: n.color }} />}
          </a>
        ))}
        <div className="nav-sep" />
        <a className="nav-item" href="#/sources" aria-current={loc.route === 'sources' ? 'page' : undefined} title="Sources">
          <Icon name="sources" />
          <span className="lbl">Sources</span>
        </a>
        <a className="nav-item" href="#/settings" aria-current={loc.route === 'settings' ? 'page' : undefined} title="Settings">
          <Icon name="settings" />
          <span className="lbl">Settings</span>
        </a>
        <div className="sidebar-foot">
          <button className="nav-item" style={{ border: 0, background: 'transparent', cursor: 'pointer' }} onClick={theme.toggle} aria-label={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">
            <Icon name={theme.mode === 'dark' ? 'sun' : 'moon'} />
            <span className="lbl">{theme.mode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{loc.route === 'body' ? loc.tab[0]!.toUpperCase() + loc.tab.slice(1) : TITLES[loc.route]}</h1>
            <div className="sub desktop-only">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="spacer" />
          <SyncPill view={view} onSync={() => void dash.syncNow()} busy={state.syncing} />
          <button className="btn icon ghost mobile-only" onClick={theme.toggle} aria-label="Toggle theme">
            <Icon name={theme.mode === 'dark' ? 'sun' : 'moon'} />
          </button>
          <a className="btn icon ghost mobile-only" href="#/sources" aria-label="Sources">
            <Icon name="sources" />
          </a>
          <a className="btn icon ghost mobile-only" href="#/settings" aria-label="Settings">
            <Icon name="settings" />
          </a>
        </header>
        {banners}
        <main className="view" id="main">
          {content}
        </main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <a key={t.route} href={t.hash} aria-current={loc.route === t.route ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
