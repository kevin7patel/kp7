// Diagnoses Notion integration access without reading any record content.
// Prints: the integration's workspace, every database/data source shared with it
// (names + IDs only), and the access status of each configured source.
// Usage: NOTION_TOKEN=... node scripts/notion-access.mjs  (appends to $GITHUB_STEP_SUMMARY when set)
import { appendFileSync } from 'node:fs';

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error('NOTION_TOKEN is not set');
  process.exit(1);
}

// Configured sources (mirrors config/notion.config.ts; IDs are not secrets).
const configured = [
  { name: 'Tasks', db: 'fa4ae1d8bafd4aa6bfc4faf35cbb1599', ds: 'ed47cf5c-9013-48bd-8c76-d3fd8806caff', required: true },
  { name: 'Projects', db: '35b1e5ca4ec9453392f548e8955323d5', ds: 'a862fc2e-e045-45a0-972b-6592df011baa', required: true },
  { name: 'Meal Log', db: '4ff20876820c468f8e1c8b5ce430028c', ds: 'd54e44a6-8fbf-4829-9959-0a4c1f2e33a4' },
  { name: 'Training & Progress', db: '327983e6b19c43bebfd868335e0c6850', ds: '55cedb1b-58f8-49c3-a2ce-7bea7e4f161e' },
];

async function call(path, { method = 'GET', body, version = '2025-09-03' } = {}) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': version, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const plain = (rich) => (Array.isArray(rich) ? rich.map((t) => t.plain_text ?? '').join('') : '') || '(untitled)';
const compact = (id) => (id ?? '').replace(/-/g, '');
const out = ['### Notion access diagnosis', ''];

const me = await call('users/me');
if (me.status !== 200) {
  out.push(`- Token rejected by Notion (HTTP ${me.status}). Re-copy the Internal Integration Secret into NOTION_TOKEN.`);
} else {
  out.push(`- Integration: **${me.json.name ?? '(unnamed)'}** · workspace: **${me.json.bot?.workspace_name ?? 'unknown'}**`);

  const shared = [];
  let cursor;
  do {
    const r = await call('search', { method: 'POST', body: { filter: { property: 'object', value: 'data_source' }, page_size: 100, start_cursor: cursor } });
    if (r.status !== 200) break;
    for (const d of r.json.results ?? []) shared.push({ title: plain(d.title), ds: compact(d.id), db: compact(d.parent?.database_id) });
    cursor = r.json.has_more ? r.json.next_cursor : undefined;
  } while (cursor);
  out.push(`- Databases shared with the integration: **${shared.length}**`);
  for (const s of shared) out.push(`  - ${s.title} (database ${s.db || '?'}, data source ${s.ds})`);

  out.push('', '| Source | Required | Data source | Database | Result |', '|---|---|---|---|---|');
  for (const c of configured) {
    const ds = await call(`data_sources/${c.ds}`);
    const db = await call(`databases/${c.db}`);
    const ok = ds.status === 200 || db.status === 200;
    const match = shared.find((s) => s.ds === compact(c.ds) || s.db === compact(c.db));
    const result = ok ? 'readable' : match ? 'shared but not readable' : 'NOT SHARED';
    out.push(`| ${c.name} | ${c.required ? 'yes' : 'no'} | ${ds.status} | ${db.status} | ${result} |`);
  }
}

const text = out.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
