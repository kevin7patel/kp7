import { describe, expect, it } from 'vitest';
import { classifyArea } from '../src/shared/areas';
import { DecryptError, decryptJson, encryptJson, generateKey, hmacHex, isPlausibleKey } from '../src/shared/crypto';
import { addDays, dayKey, daysBetween, hourInTz, relativeTime, startOfWeek } from '../src/shared/dates';
import { readDate, readNumber, readText, resolveField, resolveFields } from '../src/pipeline/sources/notionProps';
import { statusGroupFor } from '../src/pipeline/normalize';
import { computeDashboard } from '../src/metrics';
import { demoPayload } from '../src/metrics/demo';
import { notionConfig } from '../config/notion.config';

describe('dates', () => {
  it('computes timezone-aware day keys without shifting date-only values', () => {
    expect(dayKey('2026-10-02T03:30:00Z', 'America/Chicago')).toBe('2026-10-01');
    expect(dayKey('2026-10-02', 'Asia/Tokyo')).toBe('2026-10-02');
    expect(hourInTz('2026-10-02T19:30:00Z', 'America/Chicago')).toBe(14);
  });
  it('does calendar arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday → previous Monday
    expect(relativeTime('2026-10-02T10:00:00Z', new Date('2026-10-02T10:05:00Z'))).toBe('5m ago');
  });
});

describe('crypto', () => {
  it('round-trips and rejects a wrong key', async () => {
    const key = generateKey();
    expect(isPlausibleKey(key)).toBe(true);
    expect(isPlausibleKey('short')).toBe(false);
    const env = await encryptJson({ hello: 'world', n: [1, 2, 3] }, key, '2026-10-02T00:00:00Z');
    expect(await decryptJson(env, key)).toEqual({ hello: 'world', n: [1, 2, 3] });
    await expect(decryptJson(env, generateKey())).rejects.toBeInstanceOf(DecryptError);
  });
  it('hmac is stable per key', async () => {
    const key = generateKey();
    expect(await hmacHex('abc', key)).toBe(await hmacHex('abc', key));
    expect(await hmacHex('abc', key)).not.toBe(await hmacHex('abc', generateKey()));
  });
});

describe('Notion property readers', () => {
  it('reads common property shapes', () => {
    expect(readText({ type: 'title', title: [{ plain_text: 'A' }, { plain_text: 'B' }] })).toBe('AB');
    expect(readText({ type: 'status', status: { name: 'Done' } })).toBe('Done');
    expect(readNumber({ type: 'formula', formula: { type: 'number', number: 0.25 } })).toBe(0.25);
    expect(readNumber({ type: 'rollup', rollup: { type: 'number', number: 3 } })).toBe(3);
    expect(readNumber({ type: 'number', number: null })).toBeNull();
    expect(readDate({ type: 'date', date: { start: '2026-10-02T09:00:00.000-05:00', end: null } })).toMatchObject({ hasTime: true });
    expect(readDate({ type: 'date', date: null })).toBeNull();
  });
  it('resolves fields by type and name, honouring pins and avoiding double assignment', () => {
    const schema = {
      Name: { name: 'Name', type: 'title' },
      'Completed date': { name: 'Completed date', type: 'date' },
      'Do Date': { name: 'Do Date', type: 'date' },
      Stage: { name: 'Stage', type: 'status' },
    };
    const r = resolveFields(schema, notionConfig.fields.task);
    expect(r.title).toBe('Name');
    expect(r.status).toBe('Stage');
    expect(r.due).toBe('Do Date');
    expect(r.completedAt).toBe('Completed date');
    expect(resolveField(schema, { types: ['date'], property: 'Missing' })).toBeNull();
  });
  it('groups statuses', () => {
    expect(statusGroupFor('Done', null)).toBe('done');
    expect(statusGroupFor('Anything', 'Complete')).toBe('done');
    expect(statusGroupFor('Needs Kevin review', 'In progress')).toBe('waiting');
    expect(statusGroupFor('Blocked', 'In progress')).toBe('blocked');
    expect(statusGroupFor('Doing', null)).toBe('in_progress');
    expect(statusGroupFor('Backlog', null)).toBe('todo');
    expect(statusGroupFor('Not started', null)).toBe('todo');
    expect(statusGroupFor(null, null)).toBeNull();
  });
});

describe('areas', () => {
  it('classifies by keyword with first-match-wins', () => {
    expect(classifyArea('Staybridge pool permit renewal')).toBe('staybridge');
    expect(classifyArea('Tru lobby lamp')).toBe('tru');
    expect(classifyArea('Finish packing list')).toBe('travel');
    expect(classifyArea('Buy new socks')).toBe('personal');
    expect(classifyArea('Update hotel signage', 'Tru: exterior refresh')).toBe('hotel');
    expect(classifyArea('Order replacement part', 'Staybridge: laundry room')).toBe('staybridge');
  });
});

describe('demo data', () => {
  it('is always labelled demo and computes every visual', () => {
    const now = new Date('2026-10-02T17:00:00Z');
    const p = demoPayload(now, 'America/Chicago');
    const m = computeDashboard(p, now, 'America/Chicago');
    const all = [...Object.values(m.metrics), ...m.health];
    expect(all.every((x) => x.quality === 'demo' || x.quality === 'missing')).toBe(true);
    expect(all.filter((x) => x.quality === 'demo').length).toBeGreaterThan(15);
    expect(m.prs.length).toBeGreaterThan(0);
    expect(m.health.length).toBe(4);
    expect(m.habitHeatmap.length).toBe(84);
  });
});
