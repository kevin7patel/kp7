import { dashboardConfig } from '../../config/dashboard.config';
import { addDays, dayRange } from '../shared/dates';
import type { MetricValue } from '../shared/types';
import { mean, metric, round, sourceLabel, type MetricContext } from './context';

/**
 * One metric per tracked health series. Deltas are reported neutrally: the
 * dashboard does not decide whether a change is "good" or interpret it medically.
 */
export function healthMetrics(ctx: MetricContext): MetricValue[] {
  const byMetric = new Map<string, typeof ctx.e.health>();
  for (const s of ctx.e.health) byMetric.set(s.metric, [...(byMetric.get(s.metric) ?? []), s]);
  const days = dayRange(addDays(ctx.today, -(dashboardConfig.windows.healthDays - 1)), ctx.today);
  const out: MetricValue[] = [];

  for (const [key, samples] of byMetric) {
    const daily = new Map<string, number[]>();
    for (const s of samples) daily.set(s.date, [...(daily.get(s.date) ?? []), s.value]);
    const series = days.map((date) => ({ date, value: daily.has(date) ? mean(daily.get(date)!) : null }));
    const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1]!;
    const avg = (from: number, to?: number) => mean(series.slice(from, to).map((s) => s.value).filter((v): v is number => v != null));
    const recent = avg(-7);
    const prior = avg(-14, -7);
    const dp = Math.abs(latest.value) < 20 ? 1 : 0;
    out.push(
      metric(ctx, {
        id: `health.${key}`,
        label: latest.label,
        value: round(latest.value, dp),
        unit: latest.unit,
        period: `latest (${latest.date})`,
        source: sourceLabel(ctx, latest.prov.database ?? 'Health', ['date'], 'health'),
        calculation: `Most recent "${latest.label}" value. Trend: daily average over ${dashboardConfig.windows.healthDays} days. Change = last-7-day average minus the prior 7 days.`,
        quality: 'real',
        lastUpdated: latest.date,
        series,
        delta: recent != null && prior != null ? { value: round(recent - prior, dp), period: '7-day avg vs prior 7 days', goodWhen: 'neutral' } : null,
      }),
    );
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
