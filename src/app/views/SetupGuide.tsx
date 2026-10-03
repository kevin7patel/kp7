import { useState } from 'react';
import { dashboardConfig } from '../../../config/dashboard.config';
import { notionConfig } from '../../../config/notion.config';
import { generateKey } from '../../shared/crypto';
import { KEYS, store } from '../data/storage';
import type { useDashboard } from '../data/useDashboard';
import { Card } from '../components/ui';
import { Icon } from '../components/Icon';

const { owner, repo } = dashboardConfig.github;
const repository = `https://github.com/${owner}/${repo}`;
const site = `https://${owner}.github.io/${repo}/`;
const sourceLink = (id: string) => `https://app.notion.com/p/${id.replace(/-/g, '')}`;

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="btn" href={href} target="_blank" rel="noreferrer">{children}<Icon name="external" size={14} /></a>;
}

export function SetupGuide({ dash, onKeyCreated }: { dash: ReturnType<typeof useDashboard>; onKeyCreated: () => void }) {
  const [notice, setNotice] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const key = store.get(KEYS.dataKey) ?? generatedKey;
  const { state } = dash;
  const live = state.mode === 'encrypted' && state.payload?.source.kind === 'notion-api';
  const locked = state.status === 'locked' || state.status === 'badkey';

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied. Keep it private.`);
    } catch {
      setNotice('Clipboard access is unavailable. Select the key below and copy it yourself.');
    }
  }

  return (
    <Card title="Set up your Command Center" icon="bolt" className="setup-guide">
      <div className="setup-intro">
        <p>One place for your hotel and personal tasks, projects, food log and training. Your records stay in Notion. This setup uses free GitHub Pages and a read-only Notion connection.</p>
        <span className={`pill ${live ? 'good' : ''}`}>{live ? 'Live Notion data loaded' : locked ? 'Published data needs your private key' : 'Live connection not verified yet'}</span>
      </div>
      <ol className="setup-list">
        <li>
          <h4>Turn on the website</h4>
          <p>Open GitHub Pages. Under <strong>Build and deployment → Source</strong>, choose <strong>GitHub Actions</strong>. The deployment workflow handles the rest.</p>
          <Link href={`${repository}/settings/pages`}>Open website settings</Link>
        </li>
        <li>
          <h4>Connect your Notion records</h4>
          <p>Create <strong>Command Center (read-only)</strong> in <strong>Kevin Patel’s Space</strong>, type <strong>Internal</strong>. Enable <strong>Read content</strong> only; turn off update, insert and comments, and choose <strong>No user information</strong>. Save.</p>
          <Link href="https://www.notion.so/profile/integrations">Open Notion connections</Link>
          <p>Open each original database below. Use <strong>••• → Connections → Command Center (read-only) → Confirm</strong>.</p>
          <div className="setup-actions">
            {notionConfig.databases.filter((d) => ['task', 'project', 'nutrition', 'training'].includes(d.entity)).map((d) => <Link key={d.id} href={sourceLink(d.id)}>{d.name}</Link>)}
            <Link href={sourceLink(notionConfig.watchedPages[0]!.id)}>Build a Better Me</Link>
          </div>
          <p className="tag">Tasks and Projects are required. Meal Log and Training &amp; Progress add food and fitness records. Goals Tracker examples stay excluded. Wearable data appears only after actual records exist.</p>
        </li>
        <li>
          <h4>Add your two private keys in GitHub</h4>
          <p>Copy the <strong>Internal Integration Secret</strong> from Notion’s Configuration tab. In GitHub, add it as <span className="code">NOTION_TOKEN</span>. Paste it directly into GitHub’s secret value box.</p>
          <p>{key ? 'Your dashboard key is saved on this device. Use the same key for the DASHBOARD_KEY GitHub secret.' : locked ? 'Use your existing private unlock link, or paste its dashboard key in the Data card below.' : 'Create your dashboard key below, then add it as the DASHBOARD_KEY GitHub secret.'} Keep the unlock link in your password manager for your other devices.</p>
          <div className="setup-actions">
            {!key && !locked && <button className="btn primary" disabled={state.status === 'loading'} onClick={() => {
              const nextKey = generateKey();
              dash.setKey(nextKey);
              setGeneratedKey(nextKey);
              onKeyCreated();
              setNotice(store.get(KEYS.dataKey) ? 'Dashboard key created on this device. Copy it to GitHub and save your unlock link.' : 'This browser cannot save the key. Copy it to GitHub and save your unlock link before closing this page.');
            }}><Icon name="key" size={15} />Generate dashboard key</button>}
            {key && <>
              <button className="btn" onClick={() => void copy(key, 'Dashboard key')}>Copy dashboard key</button>
              <button className="btn" onClick={() => void copy(`${site}#k=${key}`, 'Private unlock link')}>Copy private unlock link</button>
            </>}
            <Link href={`${repository}/settings/secrets/actions`}>Open GitHub secrets</Link>
          </div>
          {key && <div className="setup-key">
            <label className="tag" htmlFor="setup-dashboard-key">Dashboard key{generatedKey ? ' · created here' : ''}</label>
            <div className="setup-actions">
              <input id="setup-dashboard-key" className="input mono" type={showKey ? 'text' : 'password'} value={key} readOnly autoComplete="off" spellCheck={false} />
              <button className="btn" aria-pressed={showKey} onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide key' : 'Show key'}</button>
            </div>
          </div>}
          <p className="tag">Secrets belong only in GitHub. Keep your key and unlock link out of chats, notes and screenshots.</p>
          <p className="setup-notice" role="status">{notice}</p>
        </li>
        <li>
          <h4>Run the first sync, then open your dashboard</h4>
          <p>Open <strong>Notion sync → Run workflow → main → Run workflow</strong>. After it finishes, refresh here. Automatic sync runs about every 30 minutes; GitHub can delay it.</p>
          <div className="setup-actions">
            <Link href={`${repository}/actions/workflows/sync.yml`}>Open first sync</Link>
            <button className="btn" onClick={() => void dash.load()}>Check connection</button>
            <a className="btn primary" href="#/today">Open Today</a>
          </div>
          {live && <p className="tag">Verified by loading and unlocking a payload read from the Notion API. Open Sources to inspect records and sync checks.</p>}
          <p className="tag">On each device, open your private unlock link once. iPhone: Safari → Share → Add to Home Screen. MacBook: Safari → File → Add to Dock.</p>
        </li>
      </ol>
    </Card>
  );
}
