import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeDashboard } from '../src/metrics';
import { runPipeline } from '../src/pipeline/run';
import { McpSnapshotSource } from '../src/pipeline/sources/mcpSnapshot';
import { NotionApiError, NotionApiSource } from '../src/pipeline/sources/notionApi';
import { decryptJson, generateKey } from '../src/shared/crypto';
import type { DashboardPayload } from '../src/shared/types';
import { createNotionMock } from './fixtures/notionMock';

const NOW = new Date('2026-10-02T17:00:00.000Z'); // 12:00 in America/Chicago
const DAYS = { today: '2026-10-02', yesterday: '2026-10-01', tomorrow: '2026-10-03' };

async function runWith(adapter: NotionApiSource | McpSnapshotSource, publish = false, key?: string) {
  const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
  const result = await runPipeline({ source: 'auto', outDir, publish, now: NOW, key, snapshotFile: '', adapter });
  return { result, outDir };
}

describe('Notion API adapter → pipeline (mocked Notion, 2025-09-03 data sources)', () => {
  it('runs every stage and verifies', async () => {
    const mock = createNotionMock(DAYS);
    const { result } = await runWith(new NotionApiSource('secret_test', () => NOW, mock.fetchImpl));
    expect(result.error).toBeUndefined();
    expect(result.stages.map((s) => s.stage)).toEqual(['SYNC', 'VALIDATE', 'NORMALIZE', 'CALCULATE', 'UPDATE', 'VERIFY']);
    expect(result.stages.every((s) => s.ok)).toBe(true);
    expect(result.payload!.verification.ok).toBe(true);
    // Read-only: never PATCH/DELETE, only GET + POST query/search.
    expect(mock.calls.every((c) => /^GET |^POST \/(data_sources\/[\w-]+\/query|search|databases\/\w+\/query)/.test(c))).toBe(true);
  });

  it('normalizes statuses, due buckets, waiting-on-Kevin, hierarchy and areas', async () => {
    const mock = createNotionMock(DAYS);
    const { result } = await runWith(new NotionApiSource('secret_test', () => NOW, mock.fetchImpl));
    const p = result.payload!;
    const byTitle = Object.fromEntries(p.entities.tasks.map((t) => [t.title, t]));
    expect(p.entities.tasks).toHaveLength(7); // pagination across 2 pages
    expect(byTitle['Approve quote']!.statusGroup).toBe('waiting');
    expect(byTitle['Approve quote']!.waitingOnKevin).toBe(true);
    expect(byTitle['Stuck item']!.statusGroup).toBe('blocked');
    expect(byTitle['Shipped item']!.completedAtSource).toBe('notion');
    expect(byTitle['Sub task']!.parentTitle).toBe('Morning thing');
    expect(byTitle['Overdue thing']!.area).toBe('tru');
    expect(byTitle['Overdue thing']!.areaSource).toBe('notion');
    expect(p.taskFields.due).toBe('notion');

    const m = computeDashboard(p, NOW, 'America/Chicago');
    expect(m.metrics['tasks.open']!.value).toBe(5);
    expect(m.metrics['tasks.overdue']!.value).toBe(1);
    expect(m.metrics['tasks.dueToday']!.value).toBe(2);
    expect(m.metrics['tasks.waitingOnKevin']!.value).toBe(1);
    expect(m.metrics['tasks.blocked']!.value).toBe(1);
    expect(m.metrics['tasks.inProgress']!.value).toBe(1);
    expect(m.metrics['tasks.doneToday']!.value).toBe(1);
    expect(m.metrics['tasks.done7d']!.value).toBe(2);
    expect(m.metrics['tasks.completionRate7d']!.value).toBe(40); // 2 / (2 + 3 due-but-open)
    expect(m.metrics['tasks.streak']!.value).toBe(2);
    expect(m.buckets!.overdue.map((t) => t.title)).toEqual(['Overdue thing']);
    expect(m.buckets!.today.map((t) => t.title)).toEqual(['Morning thing']);
    expect(m.buckets!.afternoon.map((t) => t.title)).toEqual(['Afternoon call']);
    expect(m.focus.map((f) => f.task.title)).toEqual(['Overdue thing', 'Morning thing', 'Afternoon call', 'Approve quote', 'Stuck item']);
    expect(m.focus[0]!.reason).toBe('Overdue 1d');
  });

  it('flags template goals, derives progress, discovers a Daily Log, and reports unshared databases', async () => {
    const mock = createNotionMock(DAYS);
    const { result } = await runWith(new NotionApiSource('secret_test', () => NOW, mock.fetchImpl));
    const p = result.payload!;
    const goals = Object.fromEntries(p.entities.goals.map((g) => [g.title, g]));
    expect(goals['Increase sales by 20%']!.isTemplate).toBe(true);
    expect(goals['Weight to 195']!.progress).toBeCloseTo(0.5);
    expect(goals['Weight to 195']!.progressSource).toBe('derived');
    expect(p.entities.dailyLogs).toHaveLength(2);
    expect(p.source.coverage).toBe('partial');
    expect(p.sync.warnings.some((w) => /Projects: not shared/.test(w))).toBe(true);
    expect(p.facts[0]!.text).toBe('Status: awaiting intake (fixture).');

    const m = computeDashboard(p, NOW, 'America/Chicago');
    expect(m.metrics['checkins.morning']!.display).toBe('Done');
    expect(m.metrics['checkins.morning']!.note).toMatch(/^Streak 2d/);
    expect(m.metrics['checkins.evening']!.display).toBe('Not yet');
    expect(m.metrics['goals.active']!.value).toBe(1);
    expect(m.metrics['goals.progress']!.value).toBe(50);
  });

  it('falls back to legacy database endpoints and retries on 429', async () => {
    const mock = createNotionMock({ ...DAYS, legacy: true, rateLimitOnce: true });
    const { result } = await runWith(new NotionApiSource('secret_test', () => NOW, mock.fetchImpl));
    expect(result.ok).toBe(true);
    expect(result.payload!.entities.tasks).toHaveLength(7);
    expect(mock.calls.some((c) => c.includes('@2022-06-28'))).toBe(true);
  });

  it('fails loudly and safely on a bad token', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'API token is invalid.' }), { status: 401 })) as unknown as typeof fetch;
    const { result } = await runWith(new NotionApiSource('bad', () => NOW, fetchImpl));
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('notion_401');
    expect(result.stages[0]).toMatchObject({ stage: 'SYNC', ok: false });
    expect(new NotionApiError('x', 401, 'unauthorized')).toBeInstanceOf(Error);
  });

  it('publishes an encrypted payload that decrypts to the same data, and skips unchanged content', async () => {
    const key = generateKey();
    const mock = createNotionMock(DAYS);
    const adapter = new NotionApiSource('secret_test', () => NOW, mock.fetchImpl);
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const first = await runPipeline({ source: 'auto', outDir, publish: true, now: NOW, key, snapshotFile: '', adapter });
    expect(first.changed).toBe(true);
    const env = JSON.parse(await readFile(join(outDir, 'publish', 'dashboard.enc.json'), 'utf8'));
    expect(JSON.stringify(env)).not.toContain('Overdue thing');
    const dec = await decryptJson<DashboardPayload>(env, key);
    expect(dec.entities.tasks).toHaveLength(7);
    const second = await runPipeline({ source: 'auto', outDir, publish: true, now: new Date(NOW.getTime() + 60_000), key, snapshotFile: '', adapter });
    expect(second.changed).toBe(false);
  });
});

describe('MCP snapshot adapter (metadata only)', () => {
  it('produces honest "unavailable" fields and missing metrics with reasons', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const file = join(outDir, 'snap.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      file,
      JSON.stringify({
        kind: 'notion-mcp-snapshot',
        capturedAt: '2026-10-02T18:50:00Z',
        capturedBy: 'test',
        coverage: 'metadata-only',
        limits: ['titles only'],
        databases: [
          { id: 'tasksdb', title: 'Tasks', path: 'HUB', lastEditedAt: null, entity: 'task' },
          { id: 'goalsdb', title: 'Goals Tracker', path: null, lastEditedAt: null, entity: 'goal' },
        ],
        pages: [
          { id: 'a', title: 'Parent row', path: 'HUB / Tasks', lastEditedAt: '2026-10-02T03:00:00Z' },
          { id: 'b', title: 'Child row', path: 'HUB / Tasks / Parent row', lastEditedAt: '2026-10-01T00:06:00Z' },
          { id: 'c', title: 'Acquire 20K new users', path: 'Goals Tracker', lastEditedAt: null },
          { id: 'd', title: 'Unrelated page', path: 'Elsewhere', lastEditedAt: null },
        ],
        documents: [],
        facts: [{ id: 'f', category: 'fitness', label: 'L', text: 'Status: pending', sourceTitle: 'P', sourceId: 'p' }],
      }),
    );
    const { result } = await runWith(new McpSnapshotSource(file));
    const p = result.payload!;
    expect(result.ok).toBe(true);
    expect(p.entities.tasks.map((t) => [t.title, t.parentTitle])).toEqual([
      ['Parent row', null],
      ['Child row', 'Parent row'],
    ]);
    expect(p.entities.tasks.every((t) => t.statusGroup === null && t.prov.source === 'notion-mcp-snapshot')).toBe(true);
    expect(p.taskFields.status).toBe('unavailable');
    const m = computeDashboard(p, NOW, 'America/Chicago');
    expect(m.metrics['tasks.records']!.value).toBe(2);
    expect(m.metrics['tasks.records']!.quality).toBe('real');
    for (const id of ['tasks.open', 'tasks.overdue', 'tasks.dueToday', 'tasks.waitingOnKevin', 'goals.active']) {
      expect(m.metrics[id]!.quality).toBe('missing');
      expect(m.metrics[id]!.note).toBeTruthy();
    }
    expect(m.focus).toEqual([]);
    expect(m.attention.some((a) => a.id === 'connect-api')).toBe(true);
    expect(m.attention.some((a) => a.id === 'goals-template')).toBe(true);
  });
});
