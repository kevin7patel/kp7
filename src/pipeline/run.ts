/**
 * Sync pipeline CLI:  SYNC → VALIDATE → NORMALIZE → CALCULATE → UPDATE → VERIFY
 *
 *   npm run sync                       # auto: API if NOTION_TOKEN set, else local MCP snapshot
 *   npm run sync -- --source=snapshot  # force the snapshot adapter
 *   npm run sync -- --publish          # also write the encrypted payload (needs DASHBOARD_KEY)
 *
 * Writes only to .data/ (gitignored). It never writes to Notion.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dashboardConfig } from '../../config/dashboard.config';
import { decryptJson, encryptJson, hmacHex } from '../shared/crypto';
import type { DashboardPayload, StageResult } from '../shared/types';
import { computeDashboard } from '../metrics';
import { normalize } from './normalize';
import { buildSourceMap } from './sourceMap';
import { McpSnapshotSource } from './sources/mcpSnapshot';
import { NotionApiError, NotionApiSource } from './sources/notionApi';
import type { RawBundle, SourceAdapter } from './sources/types';
import { validate } from './validate';
import { verify } from './verify';

export interface RunOptions {
  source: 'auto' | 'api' | 'snapshot';
  outDir: string;
  publish: boolean;
  now: Date;
  token?: string;
  key?: string;
  snapshotFile: string;
  /** Injected for tests. */
  adapter?: SourceAdapter;
}

export interface RunResult {
  ok: boolean;
  payload: DashboardPayload | null;
  stages: StageResult[];
  published: boolean;
  changed: boolean | null;
  error?: { code: string; message: string };
}

function pickAdapter(o: RunOptions): SourceAdapter {
  if (o.adapter) return o.adapter;
  if (o.source === 'api' || (o.source === 'auto' && o.token)) {
    if (!o.token) throw Object.assign(new Error('NOTION_TOKEN is not set'), { code: 'no_token' });
    return new NotionApiSource(o.token, () => o.now);
  }
  if (!existsSync(o.snapshotFile)) throw Object.assign(new Error(`No NOTION_TOKEN and no snapshot at ${o.snapshotFile}`), { code: 'no_source' });
  return new McpSnapshotSource(o.snapshotFile);
}

async function stage<T>(stages: StageResult[], name: StageResult['stage'], fn: () => Promise<{ value: T; detail: string }>): Promise<T> {
  const t0 = Date.now();
  try {
    const { value, detail } = await fn();
    stages.push({ stage: name, ok: true, ms: Date.now() - t0, detail });
    return value;
  } catch (err) {
    stages.push({ stage: name, ok: false, ms: Date.now() - t0, detail: (err as Error).message });
    throw err;
  }
}

/** Errors are reduced to a code + generic message so nothing sensitive reaches public logs. */
function publicError(err: unknown): { code: string; message: string } {
  if ((err as { required?: boolean }).required) return { code: 'required_source_failed', message: (err as Error).message };
  if (err instanceof NotionApiError) {
    const map: Record<number, string> = { 401: 'Notion rejected the token (401). Re-create the integration secret.', 403: 'Integration lacks access (403).', 404: 'Database not shared with the integration (404).' };
    return { code: `notion_${err.status}`, message: map[err.status] ?? `Notion API error ${err.status}` };
  }
  const code = (err as { code?: string }).code ?? 'pipeline_error';
  return { code, message: (err as Error).message };
}

export async function runPipeline(o: RunOptions): Promise<RunResult> {
  const stages: StageResult[] = [];
  try {
    const raw = await stage<RawBundle>(stages, 'SYNC', async () => {
      const bundle = await pickAdapter(o).load();
      const rows = bundle.dataSources.reduce((a, d) => a + d.rows.length, 0);
      return { value: bundle, detail: `${bundle.source.label}: ${bundle.dataSources.length} data sources, ${rows} rows` };
    });

    const validated = await stage(stages, 'VALIDATE', async () => {
      const v = validate(raw);
      return { value: v, detail: `${v.dropped} rows dropped, ${v.warnings.length} warnings` };
    });

    const norm = await stage(stages, 'NORMALIZE', async () => {
      const n = normalize(validated.bundle, dashboardConfig.timezone);
      const e = n.entities;
      return { value: n, detail: `${e.tasks.length} tasks, ${e.projects.length} projects, ${e.goals.length} goals, ${e.dailyLogs.length} daily logs, ${e.workouts.length} workouts, ${e.nutrition.length} nutrition, ${e.health.length} health samples` };
    });

    const payload: DashboardPayload = {
      schemaVersion: 1,
      generatedAt: o.now.toISOString(),
      timezone: dashboardConfig.timezone,
      source: raw.source,
      sync: { ok: true, stages, warnings: [...validated.warnings, ...norm.warnings] },
      entities: norm.entities,
      taskFields: norm.taskFields,
      sourceMap: buildSourceMap(validated.bundle, norm.entities, norm.taskFields, raw.facts),
      schema: norm.schema,
      facts: raw.facts,
      verification: { ok: false, checks: [] },
    };

    await stage(stages, 'CALCULATE', async () => {
      const model = computeDashboard(payload, o.now, payload.timezone);
      const all = [...Object.values(model.metrics), ...model.health];
      const missing = all.filter((m) => m.quality === 'missing').length;
      return { value: null, detail: `${all.length} metrics (${all.length - missing} computed, ${missing} missing with reasons)` };
    });

    // Invariants gate publication: a payload that fails them is never encrypted/published.
    const verification = verify(payload, validated.bundle, o.now, norm.excluded);
    payload.verification = verification;

    let published = false;
    let changed: boolean | null = null;
    const plainPath = join(o.outDir, 'dashboard.json');
    const encPath = join(o.outDir, 'publish', 'dashboard.enc.json');
    await stage(stages, 'UPDATE', async () => {
      await mkdir(o.outDir, { recursive: true });
      await writeFile(plainPath, JSON.stringify(payload, null, 2));
      if (!o.publish) return { value: null, detail: `wrote ${plainPath}` };
      if (!verification.ok) throw new Error('Invariant checks failed — encrypted payload not published');
      if (!o.key) throw Object.assign(new Error('DASHBOARD_KEY is not set'), { code: 'no_key' });
      await mkdir(dirname(encPath), { recursive: true });
      // Content hash ignores timestamps so unchanged Notion data does not produce a new commit.
      const stableFacts = payload.facts.map(({ capturedAt: _volatile, ...f }) => f);
      const contentHash = await hmacHex(JSON.stringify({ e: payload.entities, f: stableFacts, s: payload.sourceMap, w: payload.sync.warnings }), o.key);
      const hashPath = join(o.outDir, 'publish', 'content.hmac');
      const previous = existsSync(hashPath) ? (await readFile(hashPath, 'utf8')).trim() : null;
      changed = previous !== contentHash;
      await writeFile(encPath, JSON.stringify(await encryptJson(payload, o.key, payload.generatedAt)));
      await writeFile(hashPath, contentHash);
      published = true;
      return { value: null, detail: `encrypted payload written (${changed ? 'content changed' : 'no content change'})` };
    });

    // VERIFY: read the written output back and confirm it round-trips to the same data.
    await stage(stages, 'VERIFY', async () => {
      const back = JSON.parse(await readFile(plainPath, 'utf8')) as DashboardPayload;
      const same = (p: DashboardPayload) => p.generatedAt === payload.generatedAt && p.entities.tasks.length === payload.entities.tasks.length && p.entities.goals.length === payload.entities.goals.length;
      if (!same(back)) throw new Error('Written payload does not match computed payload');
      if (published && o.key) {
        const dec = await decryptJson<DashboardPayload>(JSON.parse(await readFile(encPath, 'utf8')), o.key);
        if (!same(dec)) throw new Error('Encrypted payload does not decrypt to the computed payload');
      }
      const passed = verification.checks.filter((c) => c.ok).length;
      if (!verification.ok) throw new Error(`${passed}/${verification.checks.length} invariant checks passed`);
      return { value: null, detail: `${passed}/${verification.checks.length} invariants passed; output read back${published ? ' and decrypted' : ''} successfully` };
    });

    payload.sync.ok = stages.every((s) => s.ok);
    await writeFile(plainPath, JSON.stringify(payload, null, 2));
    return { ok: payload.sync.ok, payload, stages, published, changed };
  } catch (err) {
    return { ok: false, payload: null, stages, published: false, changed: null, error: publicError(err) };
  }
}

async function main() {
  const args = new Map(process.argv.slice(2).map((a) => (a.includes('=') ? (a.replace(/^--/, '').split('=') as [string, string]) : [a.replace(/^--/, ''), 'true'])));
  const outDir = args.get('out') ?? '.data';
  const result = await runPipeline({
    source: (args.get('source') as RunOptions['source']) ?? 'auto',
    outDir,
    publish: args.get('publish') === 'true',
    now: args.get('now') ? new Date(args.get('now')!) : new Date(),
    token: process.env.NOTION_TOKEN || undefined,
    key: process.env.DASHBOARD_KEY || undefined,
    snapshotFile: args.get('snapshot') ?? join('.data', 'raw', 'notion-mcp-snapshot.json'),
  });

  for (const s of result.stages) console.log(`${s.ok ? '✓' : '✗'} ${s.stage.padEnd(9)} ${String(s.ms).padStart(5)}ms  ${s.detail}`);
  if (result.payload) {
    for (const c of result.payload.verification.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  }
  // Machine-readable status for the GitHub Action (contains no Notion content).
  const status = { ok: result.ok, at: new Date().toISOString(), changed: result.changed, error: result.error ?? null };
  await mkdir(dirname(join(outDir, 'status.json')), { recursive: true });
  await writeFile(join(outDir, 'status.json'), JSON.stringify(status, null, 2));
  if (!result.ok) {
    console.error(`Sync failed: ${result.error?.message ?? 'see stages above'}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && /run\.ts$/.test(process.argv[1]);
if (isMain) void main();
