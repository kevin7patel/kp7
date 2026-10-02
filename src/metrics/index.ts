/**
 * Metric calculation layer entry point. Pure: (payload, now, timezone) → view model.
 * Runs in the browser (so "today" is always current) and in the pipeline VERIFY step.
 */
import type { DashboardPayload, MetricValue } from '../shared/types';
import { attention, type AttentionItem } from './attention';
import { makeContext, type MetricContext } from './context';
import { exerciseTrends, fitnessMetrics, personalRecords, workoutHeatmap, type PersonalRecord } from './fitness';
import { goalMetrics, personalGoals, type GoalView } from './goals';
import { habitHeatmap, habitList, habitMetrics, type HeatCell } from './habits';
import { healthMetrics } from './health';
import { nutritionMetrics } from './nutrition';
import { buckets, focusNext, hasDue, hasStatus, recentlyCompleted, taskMetrics, upcoming, type Bucket, type FocusItem } from './tasks';
import type { Task } from '../shared/types';

export interface DashboardModel {
  ctx: MetricContext;
  metrics: Record<string, MetricValue>;
  health: MetricValue[];
  buckets: Record<Bucket, Task[]> | null;
  focus: FocusItem[];
  upcoming: Task[];
  recentDone: Task[];
  habitHeatmap: HeatCell[];
  habits: ReturnType<typeof habitList>;
  workoutHeatmap: HeatCell[];
  prs: PersonalRecord[];
  exerciseTrends: ReturnType<typeof exerciseTrends>;
  goals: GoalView[];
  attention: AttentionItem[];
  capabilities: { status: boolean; due: boolean };
}

export function computeDashboard(payload: DashboardPayload, now: Date, tz: string): DashboardModel {
  const ctx = makeContext(payload, now, tz);
  const metrics: Record<string, MetricValue> = {
    ...taskMetrics(ctx),
    ...habitMetrics(ctx),
    ...fitnessMetrics(ctx),
    ...nutritionMetrics(ctx),
    ...goalMetrics(ctx),
  };
  const capabilities = { status: hasStatus(ctx), due: hasDue(ctx) };
  return {
    ctx,
    metrics,
    health: healthMetrics(ctx),
    buckets: capabilities.status && capabilities.due ? buckets(ctx) : null,
    focus: focusNext(ctx),
    upcoming: capabilities.status && capabilities.due ? upcoming(ctx) : [],
    recentDone: recentlyCompleted(ctx),
    habitHeatmap: habitHeatmap(ctx),
    habits: habitList(ctx),
    workoutHeatmap: workoutHeatmap(ctx),
    prs: personalRecords(ctx),
    exerciseTrends: exerciseTrends(ctx),
    goals: personalGoals(ctx),
    attention: attention(ctx, metrics, payload.facts),
    capabilities,
  };
}

export type { AttentionItem, Bucket, FocusItem, GoalView, HeatCell, PersonalRecord };
