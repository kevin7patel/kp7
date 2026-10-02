/**
 * VERIFY: invariants that must hold before a payload is published.
 * A failing check blocks publication (the previous good payload stays live).
 */
import { isValidDateString } from '../shared/dates';
import type { DashboardPayload, VerificationCheck } from '../shared/types';
import { computeDashboard } from '../metrics';
import type { RawBundle } from './sources/types';

export function verify(payload: DashboardPayload, raw: RawBundle, now: Date): { ok: boolean; checks: VerificationCheck[] } {
  const checks: VerificationCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const e = payload.entities;

  // 1. Row counts: every source row became exactly one entity.
  for (const [entity, list] of [
    ['task', e.tasks],
    ['project', e.projects],
    ['goal', e.goals],
    ['automation', e.automations],
  ] as const) {
    const rawCount = raw.dataSources.filter((d) => d.entity === entity).reduce((a, d) => a + d.rows.length, 0);
    add(`${entity} rows preserved`, rawCount === list.length, `${list.length} normalized / ${rawCount} source rows`);
  }

  // 2. IDs unique.
  const ids = [...e.tasks, ...e.projects, ...e.goals].map((x) => x.id.replace(/-/g, ''));
  add('unique record ids', new Set(ids).size === ids.length, `${ids.length} ids`);

  // 3. Dates parse.
  const dates = [
    ...e.tasks.flatMap((t) => [t.due, t.completedAt, t.lastEditedAt]),
    ...e.goals.map((g) => g.due),
    ...e.workouts.map((w) => w.date),
    ...e.nutrition.map((n) => n.date),
    ...e.health.map((h) => h.date),
    ...e.dailyLogs.map((d) => d.date),
  ].filter((d): d is string => d != null);
  const bad = dates.filter((d) => !isValidDateString(d));
  add('dates valid', bad.length === 0, bad.length ? `invalid: ${bad.slice(0, 3).join(', ')}` : `${dates.length} dates`);

  // 4. Provenance: real payloads contain no demo records, and every record is stamped.
  const provs = [...e.tasks, ...e.projects, ...e.goals, ...e.workouts, ...e.nutrition, ...e.health, ...e.dailyLogs].map((x) => x.prov.source);
  add('no demo data in real payload', payload.source.kind === 'demo' || !provs.includes('demo'), `${provs.length} records stamped ${payload.source.kind}`);
  add('provenance stamped', provs.every((p) => p === payload.source.kind), 'all records carry the source kind');

  // 5. Metrics compute without NaN/Infinity and ratios stay in range.
  try {
    const model = computeDashboard(payload, now, payload.timezone);
    const all = [...Object.values(model.metrics), ...model.health];
    const broken = all.filter((m) => (m.value != null && !Number.isFinite(m.value)) || (m.ratio != null && (m.ratio < 0 || m.ratio > 1)));
    add('metrics finite', broken.length === 0, broken.length ? broken.map((m) => m.id).join(', ') : `${all.length} metrics`);
    const missingWithoutReason = all.filter((m) => m.quality === 'missing' && !m.note);
    add('missing metrics explain why', missingWithoutReason.length === 0, `${all.filter((m) => m.quality === 'missing').length} missing, all with reasons`);
  } catch (err) {
    add('metrics finite', false, (err as Error).message);
  }

  // 6. Size guard for static hosting.
  const size = JSON.stringify(payload).length;
  add('payload size', size < 5_000_000, `${(size / 1024).toFixed(1)} KiB`);

  return { ok: checks.every((c) => c.ok), checks };
}
