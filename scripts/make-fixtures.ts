// Builds invented, API-shaped payloads for state testing (never real data):
//   .data/fixtures/live.json          fresh notion-api payload (from the mocked Notion API)
//   .data/fixtures/live.enc.json      same, encrypted with .data/fixtures/key.txt
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline } from '../src/pipeline/run';
import { NotionApiSource } from '../src/pipeline/sources/notionApi';
import { encryptJson, generateKey } from '../src/shared/crypto';
import { addDays, dayKey } from '../src/shared/dates';
import { createNotionMock } from '../tests/fixtures/notionMock';

const now = new Date();
const today = dayKey(now, 'America/Chicago');
const mock = createNotionMock({ today, yesterday: addDays(today, -1), tomorrow: addDays(today, 1) });
const result = await runPipeline({
  source: 'auto',
  outDir: join(tmpdir(), 'kp7-fixture'),
  publish: false,
  now,
  snapshotFile: '',
  adapter: new NotionApiSource('fixture', () => now, mock.fetchImpl),
});
if (!result.payload) throw new Error(result.error?.message);
const key = generateKey();
await mkdir('.data/fixtures', { recursive: true });
await writeFile('.data/fixtures/live.json', JSON.stringify(result.payload));
await writeFile('.data/fixtures/live.enc.json', JSON.stringify(await encryptJson(result.payload, key, result.payload.generatedAt)));
await writeFile('.data/fixtures/key.txt', key);
console.log(`fixtures written (${result.payload.entities.tasks.length} invented tasks)`);
