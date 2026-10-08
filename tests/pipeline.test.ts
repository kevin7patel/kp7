import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeDashboard } from '../src/metrics';
import { runPipeline } from '../src/pipeline/run';
import { McpSnapshotSource } from '../src/pipeline/sources/mcpSnapshot';
import { NotionApiError, NotionApiSource } from '../src/pipeline/sources/notionApi';
import { decryptJson, generateKey } from '../src/shared/crypto';
import type { DashboardPayload } from '../src/shared/types';
import { createNotionMock, type MockOptions } from './fixtures/notionMock';

const NOW = new Date('2026-10-02T17:00:00.000Z'); // 12:00 in America/Chicago
const DAYS = { today: '2026-10-02', yesterday: '2026-10-01', tomorrow: '2026-10-03' };
const TZ = 'America/Chicago';

async function run(opts: Partial<MockOptions> = {}, extra: { publish?: boolean; key?: string; outDir?: string; now?: Date } = {}) {
  const mock = createNotionMock({ ...DAYS, ...opts });
  const outDir = extra.outDir ?? (await mkdtemp(join(tmpdir(), 'kp7-')));
  const result = await runPipeline({ source: 'auto', outDir, publish: !!extra.publish, now: extra.now ?? NOW, key: extra.key, snapshotFile: '', adapter: new NotionApiSource('secret_test', () => extra.now ?? NOW, mock.fetchImpl) });
  return { result, mock, outDir };
}

describe('Notion API adapter → pipeline (verified Tasks/Projects schema, invented rows)', () => {
  it('runs every stage, queries known data sources directly, and stays read-only', async () => {
    const { result, mock } = await run();
    expect(result.error).toBeUndefined();
    expect(result.stages.map((s) => s.stage)).toEqual(['SYNC', 'VALIDATE', 'NORMALIZE', 'CALCULATE', 'UPDATE', 'VERIFY']);
    expect(result.stages.every((s) => s.ok)).toBe(true);
    expect(mock.calls.some((c) => c.startsWith('GET /data_sources/ed47cf5c-9013-48bd-8c76-d3fd8806caff'))).toBe(true);
    expect(mock.calls.every((c) => /^GET |^POST \/(data_sources\/[\w-]+\/query|search|databases\/\w+\/query)/.test(c))).toBe(true);
  });

  it('maps Progress/Done/Priority/Area/List/Top 3 and excludes Source = Test', async () => {
    const p = (await run()).result.payload!;
    const t = Object.fromEntries(p.entities.tasks.map((x) => [x.title, x]));
    expect(p.entities.tasks).toHaveLength(7); // 8 rows, Test row dropped, pagination across pages
    expect(t['Test row']).toBeUndefined();
    expect(p.sync.warnings.some((w) => /1 test row excluded/.test(w))).toBe(true);
    expect(t['Morning thing']!.statusGroup).toBe('in_progress');
    expect(t['Approve quote']!.statusGroup).toBe('waiting');
    expect(t['Shipped item']!.statusGroup).toBe('done'); // Done checkbox wins over Progress
    expect(t['Overdue thing']!.priorityRank).toBe(1); // from the select's own option order
    expect(t['Morning thing']!.priorityRank).toBe(3);
    expect(t['Approve quote']!.top3).toBe(1);
    expect(t['Morning thing']!.nextAction).toBe('Call the vendor');
    expect(t['Someday item']!.deferred).toBe(true);
    expect(t['Overdue thing']!.area).toBe('tru');
    expect(t['Approve quote']!.area).toBe('staybridge');
    expect(t['Afternoon call']!.area).toBe('personal');
    expect(t['Morning thing']!.area).toBe('unclassified'); // empty Area is not personal
    expect(t['Sub task']!.parentTitle).toBe('Morning thing');
  });

  it('computes Today metrics from the active scope and never invents completion history', async () => {
    const p = (await run()).result.payload!;
    const m = computeDashboard(p, NOW, TZ);
    const v = (id: string) => m.metrics[id]!;
    expect(v('tasks.open').value).toBe(4); // excludes done and the Later list
    expect(v('tasks.overdue').value).toBe(1);
    expect(v('tasks.dueToday').value).toBe(2);
    expect(v('tasks.inProgress').value).toBe(1);
    expect(v('tasks.doneNow').value).toBe(2);
    expect(v('tasks.deferred').value).toBe(1);
    // Top 3 ring: picks set in Notion are the explicit denominator.
    expect(v('tasks.top3')).toMatchObject({ value: 0, display: '0/1', ratio: 0, quality: 'real' });
    // No explicit "needs Kevin" signal in the real schema → honest "Waiting", not "Waiting on you".
    expect(v('tasks.waitingOnKevin').label).toBe('Waiting');
    expect(v('tasks.waitingOnKevin').value).toBe(1);
    // No completion-date property → no dated completion metrics (last edited is never used).
    for (const id of ['tasks.doneToday', 'tasks.done7d', 'tasks.completionRate7d', 'tasks.streak']) {
      expect(v(id).quality).toBe('missing');
      expect(v(id).note).toMatch(/completion-date property/);
    }
    expect(p.entities.tasks.every((t) => t.completedAt === null)).toBe(true);
    expect(m.buckets!.overdue.map((t) => t.title)).toEqual(['Overdue thing']);
    expect(m.buckets!.today.map((t) => t.title)).toEqual(['Morning thing']);
    expect(m.buckets!.afternoon.map((t) => t.title)).toEqual(['Afternoon call']);
    expect(m.focus.map((f) => f.task.title)).toEqual(['Approve quote', 'Overdue thing', 'Morning thing', 'Afternoon call']);
    expect(m.focus[0]!.reason).toBe('Top 3 · #1');
    expect(m.focus[1]!.reason).toBe('Overdue 1d');
  });

  it('uses an explicit completion date and an explicit needs-Kevin flag when Notion has them', async () => {
    const p = (await run({ withCompletedDate: true, withNeedsKevin: true })).result.payload!;
    const m = computeDashboard(p, NOW, TZ);
    expect(m.metrics['tasks.waitingOnKevin']!.label).toBe('Waiting on you');
    expect(m.metrics['tasks.waitingOnKevin']!.value).toBe(1);
    expect(m.metrics['tasks.doneToday']!.value).toBe(1);
    expect(m.metrics['tasks.done7d']!.value).toBe(2);
    expect(m.metrics['tasks.completionRate7d']!.value).toBe(40); // 2 / (2 + 3 due-but-open)
    expect(m.metrics['tasks.streak']!.value).toBe(2);
  });

  it('normalizes Projects with outcomes and linked-task completion; excludes unconfirmed goals', async () => {
    const p = (await run()).result.payload!;
    const proj = Object.fromEntries(p.entities.projects.map((x) => [x.title, x]));
    expect(proj['Lobby refresh']!.outcome).toBe('New lighting and signage installed.');
    expect(proj['Lobby refresh']!.targetDate).toBe(DAYS.tomorrow);
    expect(proj['Lobby refresh']!.linkedTasks).toEqual({ total: 2, done: 1 });
    expect(proj['Weekly routine']!.linkedTasks).toBeNull();
    expect(p.entities.goals.every((g) => g.isTemplate)).toBe(true);
    expect(p.entities.goals.find((g) => g.title === 'Weight to 195')!.progress).toBeCloseTo(0.5); // math still verified
    const m = computeDashboard(p, NOW, TZ);
    expect(m.metrics['goals.active']!.quality).toBe('missing');
    // Projects are the real outcome layer: dated first, undated still listed (never hidden).
    expect(m.projects.map((v) => v.project.title)).toEqual(['Lobby refresh', 'Weekly routine']);
    expect(m.projects[0]!.daysLeft).toBe(1);
    expect(m.projects[0]!.ratio).toBeCloseTo(0.5);
    expect(m.projects[1]!.ratio).toBeNull();
    expect(m.metrics['projects.active']!).toMatchObject({ value: 2, quality: 'real' });
    expect(m.metrics['projects.dated']!).toMatchObject({ value: 1, quality: 'real' });
    expect(p.entities.dailyLogs).toHaveLength(2); // Daily Log discovered by title
    expect(m.metrics['checkins.morning']!.display).toBe('Done');
    expect(p.facts[0]!.text).toBe('Status: awaiting intake (fixture).');
  });

  it('falls back to legacy database endpoints and retries on 429', async () => {
    const { result, mock } = await run({ legacy: true, rateLimitOnce: true });
    expect(result.ok).toBe(true);
    expect(result.payload!.entities.tasks).toHaveLength(7);
    expect(mock.calls.some((c) => c.includes('@2022-06-28'))).toBe(true);
  });

  it('fails the sync when a required source is unshared, keeping the last good payload', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    await writeFile(join(outDir, 'dashboard.json'), '{"last":"good"}');
    const { result } = await run({ projectsUnshared: true }, { outDir });
    expect(result.ok).toBe(false);
    expect(result.error!.message).toMatch(/Projects/);
    expect(await readFile(join(outDir, 'dashboard.json'), 'utf8')).toBe('{"last":"good"}');
  });

  it('fails loudly and safely on a bad token', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'API token is invalid.' }), { status: 401 })) as unknown as typeof fetch;
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const result = await runPipeline({ source: 'auto', outDir, publish: false, now: NOW, snapshotFile: '', adapter: new NotionApiSource('bad', () => NOW, fetchImpl) });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('notion_401');
    expect(existsSync(join(outDir, 'dashboard.json'))).toBe(false);
    expect(new NotionApiError('x', 401, 'unauthorized')).toBeInstanceOf(Error);
  });

  it('publishes an encrypted payload that decrypts to the same data, and skips unchanged content', async () => {
    const key = generateKey();
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const first = await run({}, { publish: true, key, outDir });
    expect(first.result.changed).toBe(true);
    const env = JSON.parse(await readFile(join(outDir, 'publish', 'dashboard.enc.json'), 'utf8'));
    expect(JSON.stringify(env)).not.toContain('Overdue thing');
    expect((await decryptJson<DashboardPayload>(env, key)).entities.tasks).toHaveLength(7);
    const second = await run({}, { publish: true, key, outDir, now: new Date(NOW.getTime() + 60_000) });
    expect(second.result.changed).toBe(false);
  });
});

describe('MCP snapshot adapter', () => {
  it('v1 (titles only) produces honest unavailable fields and reasons', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const file = join(outDir, 'snap.json');
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
        ],
        documents: [],
        facts: [],
      }),
    );
    const result = await runPipeline({ source: 'auto', outDir, publish: false, now: NOW, snapshotFile: '', adapter: new McpSnapshotSource(file) });
    const p = result.payload!;
    expect(p.entities.tasks.map((t) => [t.title, t.parentTitle])).toEqual([
      ['Parent row', null],
      ['Child row', 'Parent row'],
    ]);
    expect(p.taskFields.status).toBe('unavailable');
    const m = computeDashboard(p, NOW, TZ);
    expect(m.metrics['tasks.records']!.value).toBe(2);
    for (const id of ['tasks.open', 'tasks.overdue', 'tasks.waitingOnKevin', 'goals.active']) expect(m.metrics[id]!.quality).toBe('missing');
    expect(m.attention.some((a) => a.id === 'connect-api')).toBe(true);
  });

  it('v2 (structured rows) maps through the same normalizer and marks deferred as unknown', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'kp7-'));
    const file = join(outDir, 'snap.json');
    await writeFile(
      file,
      JSON.stringify({
        kind: 'notion-mcp-snapshot',
        version: 2,
        capturedAt: '2026-10-02T19:52:00Z',
        capturedBy: 'test',
        coverage: 'partial',
        limits: ['active view only'],
        dataSources: [
          {
            databaseId: 'tasksdb',
            dataSourceId: 'tasksds',
            title: 'Tasks',
            entity: 'task',
            schema: { Name: { type: 'title' }, Done: { type: 'checkbox' }, Progress: { type: 'select', options: ['Inbox', 'To Do', 'In Progress', 'Waiting'] }, Priority: { type: 'select', options: ['P1 · High', 'P2 · Normal'] }, 'Top 3': { type: 'select' }, 'Due date': { type: 'date' }, Area: { type: 'select' }, List: { type: 'select' }, 'Next action': { type: 'rich_text' } },
            rows: [
              { id: 'r1', url: null, lastEditedAt: null, values: { Name: 'Alpha', Done: false, Progress: 'Waiting', Priority: 'P1 · High', 'Top 3': '2', Area: 'Personal', List: 'Kevin', 'Next action': 'Check [Example.com](https://example.com) first' } },
              { id: 'r2', url: null, lastEditedAt: null, values: { Name: 'Beta', Done: true, Progress: 'To Do', Area: 'Tru Fort Walton Beach', List: 'Tru', 'Due date': '2026-10-01' } },
            ],
          },
        ],
        documents: [],
        facts: [],
      }),
    );
    const result = await runPipeline({ source: 'auto', outDir, publish: false, now: NOW, snapshotFile: '', adapter: new McpSnapshotSource(file) });
    const m = computeDashboard(result.payload!, NOW, TZ);
    expect(m.metrics['tasks.open']!.value).toBe(1);
    expect(m.metrics['tasks.waitingOnKevin']!.label).toBe('Waiting');
    expect(m.metrics['tasks.doneNow']!.value).toBe(1);
    expect(m.metrics['tasks.deferred']!.quality).toBe('missing');
    expect(m.focus[0]!.reason).toBe('Top 3 · #2 — Check Example.com first');
    expect(result.payload!.entities.tasks[0]!.priorityRank).toBe(1);
    expect(result.payload!.entities.tasks[0]!.nextAction).toBe('Check Example.com first'); // Markdown links → plain text, like the API
  });
});
