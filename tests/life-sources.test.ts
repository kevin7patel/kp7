import { describe, expect, it } from 'vitest';
import { normalize } from '../src/pipeline/normalize';
import { computeDashboard } from '../src/metrics';
import { demoPayload } from '../src/metrics/demo';
import type { RawBundle, RawDataSource, RawRow } from '../src/pipeline/sources/types';

const NOW = new Date('2026-10-02T17:00:00Z');
const text = (type: string, value: string | null) => type === 'select' ? { type, select: value ? { name: value } : null } : { type, [type]: value ? [{ plain_text: value }] : [] };
const date = (value: string | null) => ({ type: 'date', date: value ? { start: value } : null });
const num = (value: number | null) => ({ type: 'number', number: value });
const row = (id: string, properties: RawRow['properties']): RawRow => ({ id, properties, url: null, parentTitle: null, createdAt: '2026-10-01T17:00:00Z', lastEditedAt: null });
const schema = (types: Record<string, string>) => Object.fromEntries(Object.entries(types).map(([name, type]) => [name, { name, type }]));
const bundle = (sources: RawDataSource[]): RawBundle => ({ source: { kind: 'notion-api', label: 'Invented test records', capturedAt: NOW.toISOString(), coverage: 'full', notes: [] }, dataSources: sources, documents: [], facts: [], unmapped: [], errors: [] });

describe('life-system source integrity', () => {
  it('reads only dated workouts from the mixed tracker and counts explicit completion', () => {
    const source: RawDataSource = { databaseId: 'invented-training', dataSourceId: null, title: 'Training & Progress', entity: 'training', origin: 'configured', schema: schema({ Entry: 'title', Type: 'select', Status: 'select', Date: 'date', Minutes: 'number' }), rows: [
      row('finished', { Entry: text('title', 'Strength session'), Type: text('select', 'Workout'), Status: text('select', 'Completed'), Date: date('2026-10-02'), Minutes: num(20) }),
      row('planned', { Entry: text('title', 'Planned session'), Type: text('select', 'Workout'), Status: text('select', 'Planned'), Date: date('2026-10-02'), Minutes: num(30) }),
      row('checkin', { Entry: text('title', 'Morning note'), Type: text('select', 'Check-in'), Status: text('select', 'Completed'), Date: date('2026-10-02') }),
      row('measurements', { Entry: text('title', 'Measurements'), Type: text('select', 'Measurements'), Status: text('select', 'Recorded'), Date: date('2026-10-02') }),
      row('undated', { Entry: text('title', 'Date unknown'), Type: text('select', 'Workout'), Status: text('select', 'Completed'), Date: date(null) }),
    ] };
    const result = normalize(bundle([source]));
    expect(result.entities.workouts.map((x) => x.id)).toEqual(['finished', 'planned']);
    expect(result.entities.dailyLogs).toHaveLength(0);
    expect(result.entities.health).toHaveLength(0);
    const payload = demoPayload(NOW, 'America/Chicago');
    payload.entities.workouts = result.entities.workouts;
    const metrics = computeDashboard(payload, NOW, 'America/Chicago').metrics;
    expect(metrics['fitness.workouts7d']!.value).toBe(1);
    expect(metrics['fitness.minutes7d']!.value).toBe(20);
  });

  it('preserves meal estimates, missing nutrients and local meal date instead of capture date', () => {
    const source: RawDataSource = { databaseId: 'invented-food', dataSourceId: null, title: 'Meal Log', entity: 'nutrition', origin: 'configured', schema: schema({ Meal: 'title', 'Captured at': 'date', Date: 'date', 'Calories high': 'number', 'Calories low': 'number', Calories: 'number', 'Protein g': 'number', 'Added sugar g': 'number', 'Total sugar g': 'number', Basis: 'select', Confidence: 'select' }), rows: [row('meal', {
      Meal: text('title', 'Example lunch'), 'Captured at': date('2026-10-03T12:00:00Z'), Date: date('2026-10-02'), 'Calories high': num(700), 'Calories low': num(400), Calories: num(500), 'Protein g': num(25), 'Added sugar g': num(null), 'Total sugar g': num(8), Basis: text('select', 'Estimated'), Confidence: text('select', 'Medium'),
    })] };
    const result = normalize(bundle([source]));
    expect(result.entities.nutrition[0]).toMatchObject({ date: '2026-10-02', calories: 500, caloriesLow: 400, caloriesHigh: 700, basis: 'Estimated', confidence: 'Medium', protein: 25, addedSugar: null, totalSugar: 8, waterMl: null });
    const payload = demoPayload(NOW, 'America/Chicago');
    payload.entities.nutrition = result.entities.nutrition;
    const metrics = computeDashboard(payload, NOW, 'America/Chicago').metrics;
    expect(metrics['nutrition.calories']!.value).toBe(500);
    expect(metrics['nutrition.calories']!.note).toMatch(/coverage unconfirmed/);
    expect(metrics['nutrition.water']!.value).toBeNull();
  });

  it('does not treat an unknown workout completion flag as a completed workout', () => {
    const payload = demoPayload(NOW, 'America/Chicago');
    payload.entities.workouts = [{ id: 'unknown', date: '2026-10-02', title: 'Completion unknown', type: null, durationMin: 30, completed: null, exercises: [], url: null, prov: { source: 'demo' } }];
    const model = computeDashboard(payload, NOW, 'America/Chicago');
    expect(model.metrics['fitness.workouts7d']!.value).toBeNull();
    expect(model.metrics['fitness.workouts7d']!.note).toMatch(/completion is not recorded/);
    expect(model.metrics['fitness.minutes7d']!.value).toBeNull();
    expect(model.prs).toHaveLength(0);
  });
});
