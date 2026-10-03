import { useState } from 'react';
import { dashboardConfig } from '../../../config/dashboard.config';
import type { useDashboard } from '../data/useDashboard';
import { KEYS, store } from '../data/storage';
import type { useTheme } from '../theme';
import { Card, Seg } from '../components/ui';
import { SetupGuide } from './SetupGuide';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const { owner, repo } = dashboardConfig.github;
const REPO_URL = `https://github.com/${owner}/${repo}`;

export function Settings({ theme, dash }: { theme: ReturnType<typeof useTheme>; dash: ReturnType<typeof useDashboard> }) {
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [gh, setGh] = useState('');
  const [, force] = useState(0);
  const hasKey = !!store.get(KEYS.dataKey);
  const hasGh = !!store.get(KEYS.ghToken);

  return (
    <>
      <div className="hero page">
        <div>
          <h2>Settings</h2>
          <p>Preferences are stored on this device only.</p>
        </div>
      </div>
      <SetupGuide dash={dash} onKeyCreated={() => force((n) => n + 1)} />
      <div className="grid" style={{ marginTop: 18 }}>
        <div className="span-6 stack">
          <Card title="Appearance" icon="sun">
            <div className="setting">
              <div className="s-body">
                <div className="s-title">Theme</div>
                <div className="s-desc">System follows your device; a manual choice is remembered.</div>
              </div>
              <Seg
                label="Theme"
                value={theme.pref}
                onChange={theme.set}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
          </Card>

          <Card title="Data" icon="sources">
            <div className="setting">
              <div className="s-body">
                <div className="s-title">Demo mode</div>
                <div className="s-desc">Preview every chart with synthetic data. Clearly labelled; never mixed with Notion data.</div>
              </div>
              <button className="toggle" role="switch" aria-checked={dash.demo} aria-label="Demo mode" onClick={() => dash.setDemo(!dash.demo)} />
            </div>
            <div className="setting" style={{ display: 'block' }}>
              <div className="s-title">Dashboard key {hasKey ? <span className="badge-reward">saved on this device</span> : <span className="pill">not set</span>}</div>
              <div className="s-desc" style={{ marginBottom: 10 }}>
                The published data is encrypted because this repository is public. Paste the key (or open your unlock link) once per device.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input mono" type="password" style={{ flex: '1 1 220px' }} placeholder="Paste dashboard key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} aria-label="Dashboard key" autoComplete="off" spellCheck={false} />
                <button
                  className="btn primary"
                  onClick={() => {
                    try {
                      dash.setKey(keyInput.trim());
                      setKeyInput('');
                      setKeyError(null);
                      force((n) => n + 1);
                    } catch (e) {
                      setKeyError((e as Error).message);
                    }
                  }}
                  disabled={!keyInput.trim()}
                >
                  Save key
                </button>
                {hasKey && (
                  <button
                    className="btn"
                    onClick={() => {
                      dash.setKey(null);
                      force((n) => n + 1);
                    }}
                  >
                    Forget
                  </button>
                )}
              </div>
              {keyError && <div style={{ color: 'var(--critical-ink)', fontSize: 13, marginTop: 6 }}>{keyError}</div>}
            </div>
          </Card>

          <Card title="On-demand Notion sync" icon="sync">
            <div className="s-desc" style={{ color: 'var(--text-2)', fontSize: 13.5, marginBottom: 10 }}>
              Notion is reconciled automatically every 30 minutes. To make <strong>Sync now</strong> trigger an immediate run, store a fine-grained GitHub token limited to the <span className="code">{repo}</span> repository with <em>Actions: read &amp; write</em>. It stays on this device.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input mono" type="password" style={{ flex: '1 1 220px' }} placeholder={hasGh ? 'Token saved — paste to replace' : 'github_pat_…'} value={gh} onChange={(e) => setGh(e.target.value)} aria-label="GitHub token" autoComplete="off" />
              <button
                className="btn"
                disabled={!gh.trim()}
                onClick={() => {
                  store.set(KEYS.ghToken, gh.trim());
                  setGh('');
                  force((n) => n + 1);
                }}
              >
                Save
              </button>
              {hasGh && (
                <button
                  className="btn"
                  onClick={() => {
                    store.set(KEYS.ghToken, null);
                    force((n) => n + 1);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </Card>
        </div>

        <div className="span-6 stack">
          <Card title="Install on iPhone and Mac" icon="download">
            <ol className="steps">
              <li>
                <strong>iPhone:</strong> open the dashboard in Safari → Share → <em>Add to Home Screen</em>.
              </li>
              <li>
                <strong>MacBook (Safari):</strong> File → <em>Add to Dock</em>. <strong>Chrome:</strong> the install icon in the address bar.
              </li>
              <li>Open your unlock link once on each device so the key is stored locally.</li>
            </ol>
          </Card>
          <Card title="About" icon="info">
            <dl className="kv">
              <dt>Version</dt>
              <dd className="num">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</dd>
              <dt>Built</dt>
              <dd className="num">{typeof __BUILD_TIME__ !== 'undefined' ? new Date(__BUILD_TIME__).toLocaleString() : '—'}</dd>
              <dt>Source</dt>
              <dd>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  {owner}/{repo}
                </a>
              </dd>
              <dt>Writes to Notion</dt>
              <dd>Never — read-only by design</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
