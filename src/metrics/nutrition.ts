import { dashboardConfig } from '../../config/dashboard.config';
import { addDays, dayRange } from '../shared/dates';
import type { MetricValue, NutritionEntry } from '../shared/types';
import { mean, metric, missing, round, sourceLabel, type MetricContext } from './context';

type Key = 'calories' | 'protein' | 'carbs' | 'fat' | 'waterMl';

export function dailyTotals(entries: NutritionEntry[]): Map<string, Record<Key, number | null>> {
  const m = new Map<string, Record<Key, number | null>>();
  for (const e of entries) {
    const t = m.get(e.date) ?? { calories: null, protein: null, carbs: null, fat: null, waterMl: null };
    for (const k of ['calories', 'protein', 'carbs', 'fat', 'waterMl'] as Key[]) {
      if (e[k] != null) t[k] = (t[k] ?? 0) + e[k]!;
    }
    m.set(e.date, t);
  }
  return m;
}

export function nutritionMetrics(ctx: MetricContext): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const db = ctx.e.nutrition[0]?.prov.database ?? 'Nutrition';
  const none = 'No usable meal records loaded from Notion yet. Check Meal Log sharing and sync in Settings.';
  const totals = dailyTotals(ctx.e.nutrition);
  const t = dashboardConfig.targets;
  const days14 = dayRange(addDays(ctx.today, -13), ctx.today);

  const defs: { key: Key; id: string; label: string; unit: string; target: number | null; field: string }[] = [
    { key: 'calories', id: 'nutrition.calories', label: 'Calories', unit: 'kcal', target: t.caloriesKcal, field: 'calories' },
    { key: 'protein', id: 'nutrition.protein', label: 'Protein', unit: 'g', target: t.proteinG, field: 'protein' },
    { key: 'waterMl', id: 'nutrition.water', label: 'Hydration', unit: 'ml', target: t.waterMl, field: 'water' },
  ];

  for (const d of defs) {
    const src = sourceLabel(ctx, db, ['date', d.field], 'nutrition');
    const tracked = ctx.e.nutrition.some((e) => e[d.key] != null);
    if (!tracked) {
      out[d.id] = missing(ctx, { id: d.id, label: d.label, unit: d.unit, period: 'today', source: src, calculation: `Sum of ${d.label.toLowerCase()} logged today.`, note: ctx.e.nutrition.length ? `${d.label} is not tracked in the nutrition log.` : none });
      continue;
    }
    const today = totals.get(ctx.today)?.[d.key] ?? null;
    const series = days14.map((date) => ({ date, value: totals.get(date)?.[d.key] ?? null }));
    const last7 = series.slice(-7).map((s) => s.value).filter((v): v is number => v != null);
    const avg7 = mean(last7);
    out[d.id] = metric(ctx, {
      id: d.id,
      label: d.label,
      value: today != null ? round(today) : null,
      display: today == null ? 'Not logged' : undefined,
      unit: d.unit,
      period: 'today',
      source: src,
      calculation: `Subtotal of known ${d.label.toLowerCase()} values in entries dated today; missing entries and nutrients are unknown. Whole-day coverage is unconfirmed. Trend: logged subtotals, 14 days. 7-day average counts only logged days.`,
      target: d.target,
      ratio: d.target && today != null ? Math.min(1, today / d.target) : null,
      series,
      note: `Logged subtotal · day coverage unconfirmed${avg7 != null ? ` · 7-day avg ${round(avg7)} ${d.unit} (${last7.length} logged days)` : ''}${d.target ? '' : ' · no target set'}`,
    });
  }

  const logged = days14.slice(-7).filter((d) => totals.has(d)).length;
  out['nutrition.consistency'] = ctx.e.nutrition.length
    ? metric(ctx, { id: 'nutrition.consistency', label: 'Days logged · 7 days', value: logged, display: `${logged} / 7`, unit: 'days', ratio: logged / 7, period: 'last 7 days', source: sourceLabel(ctx, db, ['date'], 'nutrition'), calculation: 'Days in the last 7 with at least one nutrition entry.' })
    : missing(ctx, { id: 'nutrition.consistency', label: 'Days logged · 7 days', unit: 'days', period: 'last 7 days', source: sourceLabel(ctx, db, [], 'nutrition'), calculation: 'Days with an entry.', note: none });

  return out;
}
