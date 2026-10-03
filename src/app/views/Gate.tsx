import { useState } from 'react';
import type { DashState, useDashboard } from '../data/useDashboard';
import { Icon } from '../components/Icon';

/** Shown when there is no data to render: loading, locked, wrong key, or nothing published. */
export function Gate({ state, dash }: { state: DashState; dash: ReturnType<typeof useDashboard> }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <div className="center-screen" aria-busy="true">
        <div className="tag">Loading your dashboard…</div>
      </div>
    );
  }

  if (state.status === 'locked' || state.status === 'badkey') {
    return (
      <div className="center-screen">
        <section className="card">
          <div className="card-head">
            <Icon name="lock" />
            <h3>{state.status === 'badkey' ? 'That key can’t unlock this data' : 'Unlock your dashboard'}</h3>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 0 }}>
            Your Notion data is published encrypted because the repository is public. Open your private unlock link, or paste the dashboard key. It is stored only on this device.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                dash.setKey(key.trim());
                setErr(null);
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
            style={{ display: 'grid', gap: 10 }}
          >
            <input className="input mono" type="password" placeholder="Dashboard key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Dashboard key" />
            {err && <div style={{ color: 'var(--critical-ink)', fontSize: 13 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" type="submit" disabled={!key.trim()}>
                Unlock
              </button>
              <button className="btn" type="button" onClick={() => dash.setDemo(true)}>
                Preview with demo data
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <section className="card">
        <div className="card-head">
          <Icon name="sources" />
          <h3>{state.offline ? 'Offline — no cached data yet' : 'No data published yet'}</h3>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 0 }}>
          {state.offline
            ? 'Reconnect to load your dashboard. It will refresh automatically when you are back online.'
            : 'The sync pipeline has not published a payload to this site yet. Once the Notion token and dashboard key are configured, the first sync runs within 30 minutes (or immediately via Sync now).'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => void dash.load()}>
            Try again
          </button>
          <a className="btn" href="#/settings">
            Setup
          </a>
          <button className="btn" onClick={() => dash.setDemo(true)}>
            Preview with demo data
          </button>
        </div>
      </section>
    </div>
  );
}
