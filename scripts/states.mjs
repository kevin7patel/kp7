// Behavioural checks for every connection/freshness state against the production build.
// Network is intercepted, so no real data or GitHub access is needed.
//   npx tsx scripts/make-fixtures.ts && node scripts/states.mjs [baseUrl]
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/';
const live = JSON.parse(readFileSync('.data/fixtures/live.json', 'utf8'));
const enc = readFileSync('.data/fixtures/live.enc.json', 'utf8');
const key = readFileSync('.data/fixtures/key.txt', 'utf8').trim();
const out = '.artifacts/screenshots/states';
mkdirSync(out, { recursive: true });

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
const notFound = { status: 404, contentType: 'text/html', body: '<h1>404</h1>' };
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const withCaptured = (iso) => ({ ...live, source: { ...live.source, capturedAt: iso } });
const runs = (conclusion, updated) => ({ workflow_runs: [{ id: 1, status: 'completed', conclusion, updated_at: updated, created_at: updated, html_url: 'https://github.com/kevin7patel/kp7/actions/runs/1', event: 'schedule' }] });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const results = [];

async function scenario(name, { plain, encrypted, gh, storage = {}, hash = '#/today', viewport = { width: 1280, height: 860 }, act, expect: checks }) {
  // Service workers are blocked here so network mocks apply; the real SW is tested separately below.
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await ctx.route('**/data/dashboard.json*', (r) => r.fulfill(plain ? json(plain) : notFound));
  await ctx.route('**/data/dashboard.enc.json*', (r) => r.fulfill(encrypted ? json(encrypted) : notFound));
  await ctx.route('https://api.github.com/**', (r) => r.fulfill(gh ? json(gh) : json({ workflow_runs: [] })));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (act) await act(page, ctx);
  const failures = [];
  for (const [label, fn] of Object.entries(checks)) {
    try {
      if (!(await fn(page))) failures.push(label);
    } catch (e) {
      failures.push(`${label} (${e.message.split('\n')[0]})`);
    }
  }
  if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: `${out}/${name}.png` });
  results.push({ name, ok: failures.length === 0, failures });
  await ctx.close();
}

const text = (page, t) => page.getByText(t, { exact: false }).first().isVisible();
const pill = (page) => page.locator('.sync').first().innerText();

await scenario('live-fresh', {
  plain: withCaptured(hoursAgo(0.1)),
  expect: {
    'pill says Synced': async (p) => /Synced/.test(await pill(p)),
    'no freshness banner': async (p) => (await p.locator('.banner').count()) === 0,
    'overdue count rendered': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
    // No explicit needs-Kevin signal in the schema → honest "Waiting" (on anyone), not "Waiting on you".
    'waiting rendered honestly': async (p) => (await p.locator('section[aria-label="Waiting"] .value').innerText()).trim() === '1',
    'no "Waiting on you" claim': async (p) => (await p.locator('section[aria-label="Waiting on you"]').count()) === 0,
    'day plan has afternoon task': (p) => text(p, 'Afternoon call'),
    'focus ranks Top 3 first': async (p) => /Approve quote/.test(await p.locator('.rank').first().locator('xpath=..').innerText()),
    'projects card lists a project': (p) => text(p, 'Lobby refresh'),
  },
});

await scenario('stale', {
  plain: withCaptured(hoursAgo(5)),
  expect: {
    'pill says Stale': async (p) => /Stale/.test(await pill(p)),
    'stale banner explains': (p) => text(p, 'No successful sync in 5h'),
    'data still shown': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
  },
});

await scenario('sync-error', {
  encrypted: enc,
  storage: { 'kp7.dataKey': key },
  gh: runs('failure', new Date(Date.now() + 60_000).toISOString()),
  expect: {
    'pill says Sync failing': async (p) => /Sync failing/.test(await pill(p)),
    'error banner with run link': (p) => p.getByRole('link', { name: 'View run' }).isVisible(),
    'last good data still shown': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
  },
});

await scenario('locked', {
  encrypted: enc,
  expect: {
    'lock screen shown': (p) => text(p, 'Unlock your dashboard'),
    'no data rendered': async (p) => (await p.locator('section[aria-label="Overdue"]').count()) === 0,
  },
});

await scenario('wrong-key', {
  encrypted: enc,
  storage: { 'kp7.dataKey': 'A'.repeat(43) },
  expect: { 'bad key message': (p) => text(p, 'can’t unlock this data') },
});

await scenario('unlock-link', {
  encrypted: enc,
  hash: `#k=${key}`,
  expect: {
    'unlocked and rendered': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
    'key removed from URL': async (p) => !(await p.evaluate(() => location.hash)).includes('k='),
    'key stored on device': async (p) => (await p.evaluate(() => localStorage.getItem('kp7.dataKey'))) !== null,
  },
});

await scenario('disconnected', {
  expect: {
    'no-data screen': (p) => text(p, 'No data published yet'),
    'demo escape hatch': (p) => p.getByRole('button', { name: 'Preview with demo data' }).isVisible(),
  },
});

await scenario('guided-setup-key', {
  hash: '#/settings',
  act: async (page) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.setupCopied = value; } } }));
    await page.getByRole('button', { name: 'Generate dashboard key' }).click();
    await page.getByRole('button', { name: 'Copy private unlock link' }).click();
    await page.reload({ waitUntil: 'networkidle' });
  },
  expect: {
    'key persists without regeneration': async (p) => (await p.getByRole('button', { name: 'Generate dashboard key' }).count()) === 0 && (await p.evaluate(() => localStorage.getItem('kp7.dataKey')?.length)) === 43,
    'key is masked': async (p) => (await p.locator('#setup-dashboard-key').getAttribute('type')) === 'password',
    'Pages source is explained': (p) => text(p, 'GitHub Actions'),
    'original food and training links provided': async (p) => (await p.getByRole('link', { name: 'Meal Log', exact: true }).getAttribute('href')).endsWith('4ff20876820c468f8e1c8b5ce430028c') && (await p.getByRole('link', { name: 'Training & Progress', exact: true }).count()) === 1,
    'no live-sync success claimed': (p) => text(p, 'Live connection not verified yet'),
  },
});

await scenario('guided-setup-existing-key', {
  hash: '#/settings',
  encrypted: enc,
  storage: { 'kp7.dataKey': key },
  act: async (page) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.setupCopied = value; } } }));
    await page.getByRole('button', { name: 'Copy private unlock link' }).click();
  },
  expect: {
    'existing key is not replaced': async (p) => (await p.evaluate(() => localStorage.getItem('kp7.dataKey'))) === key && (await p.getByRole('button', { name: 'Generate dashboard key' }).count()) === 0,
    'unlock link uses the production site, not the preview origin': async (p) => (await p.evaluate(() => window.setupCopied)) === `https://kevin7patel.github.io/kp7/#k=${key}`,
    'Notion API payload is verified': (p) => text(p, 'Live Notion data loaded'),
  },
});

await scenario('guided-setup-clipboard-denied', {
  hash: '#/settings',
  storage: { 'kp7.dataKey': key },
  act: async (page) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } }));
    await page.getByRole('button', { name: 'Copy dashboard key' }).click();
  },
  expect: { 'manual copy fallback is explained': (p) => text(p, 'Clipboard access is unavailable') },
});

await scenario('offline-after-load', {
  plain: withCaptured(hoursAgo(0.1)),
  act: async (page, ctx) => {
    await ctx.route('**/data/dashboard.json*', (r) => r.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Sync now' }).click();
    await page.waitForTimeout(800);
  },
  expect: {
    'pill says Offline': async (p) => /Offline/.test(await pill(p)),
    'cached data still shown': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
  },
});

await scenario('sync-now-hosted-no-token', {
  encrypted: enc,
  storage: { 'kp7.dataKey': key },
  act: async (page) => {
    await page.getByRole('button', { name: 'Sync now' }).click();
    await page.waitForTimeout(800);
  },
  expect: { 'explains refresh vs schedule': (p) => text(p, 'Notion is synced every 30 minutes') },
});

await scenario('provenance-popover', {
  plain: withCaptured(hoursAgo(0.1)),
  act: async (page) => {
    await page.locator('section[aria-label="Waiting"] .chip').click();
  },
  expect: {
    'shows source': (p) => text(p, 'Notion · Tasks'),
    'shows calculation': (p) => text(p, 'Active tasks whose status is Waiting'),
  },
});

await scenario('theme-persists', {
  plain: withCaptured(hoursAgo(0.1)),
  act: async (page) => {
    await page.getByRole('button', { name: /Switch to dark mode|Switch to light mode/ }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
  },
  expect: {
    'data-theme applied before app mounts': async (p) => (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark',
  },
});

await scenario('mobile-navigation', {
  plain: withCaptured(hoursAgo(0.1)),
  viewport: { width: 390, height: 844 },
  act: async (page) => {
    await page.locator('.tabbar').getByRole('link', { name: 'Goals' }).click();
    await page.waitForTimeout(300);
  },
  expect: {
    'routed to goals': async (p) => (await p.evaluate(() => location.hash)) === '#/goals',
    'tab marked current': async (p) => (await p.locator('.tabbar a[aria-current="page"]').innerText()).includes('Goals'),
    'projects listed first': (p) => text(p, 'Lobby refresh'),
    'undated project says so': (p) => text(p, 'No target date'),
    'unconfirmed goals excluded': (p) => text(p, 'Goals Tracker excluded for now'),
    'excluded goal not shown as a goal': async (p) => (await p.locator('.goal').count()) === 0,
  },
});

await scenario('area-filter', {
  plain: withCaptured(hoursAgo(0.1)),
  act: async (page) => {
    await page.getByRole('group', { name: 'Area filter' }).getByRole('button', { name: 'Hotels' }).click();
  },
  expect: {
    'hotel overdue task kept': async (p) => (await p.locator('section[aria-label="Overdue"] .value').innerText()).trim() === '1',
    'personal task filtered out': async (p) => !(await p.getByText('Afternoon call').first().isVisible().catch(() => false)),
    'unclassified task filtered out': async (p) => !(await p.getByText('Morning thing').first().isVisible().catch(() => false)),
  },
});

// Real service worker + real preview server: load online, go offline, refresh → cached data, honestly labelled.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  const failures = [];
  await page.goto(base + '#/today', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'networkidle' }); // now controlled by the SW, which caches data
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.waitForTimeout(1200);
  if (!/Offline/.test(await page.locator('.sync').first().innerText())) failures.push('pill not Offline');
  if ((await page.locator('section.card.stat').count()) === 0) failures.push('cached data not shown');
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined); // app shell must load offline
  await page.waitForTimeout(1200);
  if (!(await page.locator('.sidebar').isVisible())) failures.push('app shell did not load offline');
  await page.screenshot({ path: `${out}/service-worker-offline.png` });
  results.push({ name: 'service-worker-offline', ok: failures.length === 0, failures });
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.failures.join('; ')}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} scenario(s) failed` : `All ${results.length} state scenarios passed`);
process.exit(failed ? 1 : 0);
