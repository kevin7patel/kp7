import { dayKey } from '../shared/dates';
import type { DashboardPayload, Entities, FieldSource, MetricValue, Quality, SourceInfo } from '../shared/types';

export interface MetricContext {
  e: Entities;
  now: Date;
  tz: string;
  today: string;
  source: SourceInfo;
  taskFields: Record<string, FieldSource>;
  /** Resolved Notion property names per entity (from the schema report). */
  fieldNames: Record<string, Record<string, string | null>>;
  demo: boolean;
  /** Sync warnings carried from the payload (shown in "Needs attention"). */
  warnings: string[];
}

export function makeContext(payload: DashboardPayload, now: Date, tz: string): MetricContext {
  const fieldNames: Record<string, Record<string, string | null>> = {};
  for (const s of payload.schema) fieldNames[s.entity] ??= s.resolved;
  return {
    e: payload.entities,
    now,
    tz,
    today: dayKey(now, tz),
    source: payload.source,
    taskFields: payload.taskFields,
    fieldNames,
    demo: payload.source.kind === 'demo',
    warnings: payload.sync.warnings,
  };
}

/** Human-readable source string, e.g. "Notion · Tasks · Status, Due". */
export function sourceLabel(ctx: MetricContext, db: string, fields: string[] = [], entity = 'task'): string {
  if (ctx.demo) return 'Demo data (generated, not from Notion)';
  const names = fields.map((f) => ctx.fieldNames[entity]?.[f] ?? null).filter((n): n is string => !!n);
  const via = ctx.source.kind === 'notion-mcp-snapshot' ? 'Notion snapshot' : 'Notion';
  return [via, db, names.join(', ')].filter(Boolean).join(' · ');
}

export function metric(ctx: MetricContext, m: Omit<MetricValue, 'quality' | 'lastUpdated'> & { quality?: Quality; lastUpdated?: string | null }): MetricValue {
  const quality: Quality = m.quality === 'missing' ? 'missing' : ctx.demo ? 'demo' : (m.quality ?? 'derived');
  return { ...m, quality, lastUpdated: m.lastUpdated ?? (quality === 'missing' ? null : ctx.source.capturedAt) };
}

export function missing(
  ctx: MetricContext,
  m: Pick<MetricValue, 'id' | 'label' | 'unit' | 'period' | 'source' | 'calculation'> & { note: string },
): MetricValue {
  return metric(ctx, { ...m, value: null, quality: 'missing' });
}

export const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
