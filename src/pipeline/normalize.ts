/**
 * NORMALIZE: raw Notion rows → the dashboard's normalized model.
 * Every field is resolved through config/notion.config.ts, so a schema change in
 * Notion is absorbed here (or by a one-line config pin), never in the UI.
 */
import { dashboardConfig } from '../../config/dashboard.config';
import { notionConfig, type FieldSpec } from '../../config/notion.config';
import { areaFromNotion, classifyArea } from '../shared/areas';
import { dayKey } from '../shared/dates';
import type {
  Automation,
  DailyLog,
  Entities,
  FieldSource,
  Goal,
  HealthSample,
  NutritionEntry,
  Project,
  SchemaReport,
  StatusGroup,
  Task,
  Workout,
} from '../shared/types';
import { readBool, readDate, readNames, readNumber, readRelationIds, readText, resolveFields, statusGroupName } from './sources/notionProps';
import type { NotionValue, RawBundle, RawDataSource, RawRow } from './sources/types';

export interface NormalizeResult {
  entities: Entities;
  taskFields: Record<string, FieldSource>;
  schema: SchemaReport[];
  warnings: string[];
}

const fieldSpecs = notionConfig.fields as unknown as Record<string, Record<string, FieldSpec>>;

export function statusGroupFor(status: string | null, notionGroup: string | null): StatusGroup | null {
  if (!status) return null;
  const r = notionConfig.statusRules;
  if (/complete/i.test(notionGroup ?? '') || r.done.test(status)) return 'done';
  if (r.blocked.test(status)) return 'blocked';
  if (r.waiting.test(status)) return 'waiting';
  if (/to-?do/i.test(notionGroup ?? '')) return 'todo';
  if (/progress/i.test(notionGroup ?? '')) return 'in_progress';
  // "Not started" must not match the in-progress /started/ pattern.
  if (r.todo.test(status)) return 'todo';
  if (r.inProgress.test(status)) return 'in_progress';
  return 'todo';
}

export function priorityRankFor(priority: string | null): number | null {
  if (!priority) return null;
  return notionConfig.priorityRank.find((p) => p.match.test(priority))?.rank ?? null;
}

function prop(row: RawRow, name: string | null | undefined): NotionValue | undefined {
  return name ? row.properties[name] : undefined;
}

function titleOf(row: RawRow, resolved: Record<string, string | null>): string {
  return readText(prop(row, resolved.title)) ?? 'Untitled';
}

function areaFor(row: RawRow, resolved: Record<string, string | null>, title: string): { area: string; source: FieldSource } {
  const value = readNames(prop(row, resolved.area))[0];
  if (value) return { area: areaFromNotion(value), source: 'notion' };
  return { area: classifyArea(title, row.parentTitle), source: 'derived' };
}

function rowDate(row: RawRow, resolved: Record<string, string | null>, tz: string): string | null {
  const d = readDate(prop(row, resolved.date));
  if (d) return dayKey(d.start, tz);
  const t = readText(prop(row, resolved.title));
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t && !Number.isNaN(Date.parse(t)) && /\d{4}/.test(t)) return dayKey(new Date(`${t} 12:00`), tz);
  return row.createdAt ? dayKey(row.createdAt, tz) : null;
}

function normalizeTasks(ds: RawDataSource, resolved: Record<string, string | null>): Task[] {
  const statusSchema = resolved.status ? ds.schema[resolved.status] : undefined;
  const titleById = new Map(ds.rows.map((r) => [r.id.replace(/-/g, ''), titleOf(r, resolved)]));

  return ds.rows.map((row) => {
    const title = titleOf(row, resolved);
    const status = readText(prop(row, resolved.status));
    const doneBox = readBool(prop(row, resolved.done));
    let group = statusGroupFor(status, statusGroupName(statusSchema, status));
    if (doneBox === true) group = 'done';
    else if (doneBox === false && group === null) group = 'todo';

    const owner = readText(prop(row, resolved.owner));
    const waitingBox = readBool(prop(row, resolved.waitingOnKevin));
    const statusKnown = resolved.status != null || resolved.done != null;
    let waitingOnKevin: boolean | null = null;
    if (waitingBox !== null) waitingOnKevin = waitingBox && group !== 'done';
    else if (status && notionConfig.waitingOnKevin.test(status)) waitingOnKevin = group !== 'done';
    else if (group === 'waiting' && owner && /kevin/i.test(owner)) waitingOnKevin = true;
    else if (statusKnown) waitingOnKevin = false;

    const blockedBox = readBool(prop(row, resolved.blocked));
    const blocked = blockedBox !== null ? blockedBox && group !== 'done' : statusKnown ? group === 'blocked' : null;

    const due = readDate(prop(row, resolved.due));
    const completed = readDate(prop(row, resolved.completedAt));
    let completedAt: string | null = null;
    let completedAtSource: FieldSource = 'unavailable';
    if (completed) {
      completedAt = completed.start;
      completedAtSource = 'notion';
    } else if (group === 'done' && row.lastEditedAt) {
      completedAt = row.lastEditedAt;
      completedAtSource = 'derived';
    } else if (statusKnown) {
      completedAtSource = 'derived';
    }

    const parentIds = readRelationIds(prop(row, resolved.parent));
    const parentId = parentIds[0] ?? null;
    const parentTitle = row.parentTitle ?? (parentId ? (titleById.get(parentId.replace(/-/g, '')) ?? null) : null);
    const priority = readText(prop(row, resolved.priority));
    const { area, source: areaSource } = areaFor({ ...row, parentTitle }, resolved, title);

    return {
      id: row.id,
      title,
      url: row.url,
      status,
      statusGroup: group,
      due: due?.start ?? null,
      dueHasTime: due?.hasTime ?? false,
      priority,
      priorityRank: priorityRankFor(priority),
      owner,
      waitingOnKevin,
      blocked,
      timeBucket: readText(prop(row, resolved.timeBucket)),
      area,
      areaSource,
      parentId,
      parentTitle,
      projectIds: readRelationIds(prop(row, resolved.project)),
      completedAt,
      completedAtSource,
      createdAt: row.createdAt,
      lastEditedAt: row.lastEditedAt,
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    } satisfies Task;
  });
}

function normalizeProjects(ds: RawDataSource, resolved: Record<string, string | null>): Project[] {
  const statusSchema = resolved.status ? ds.schema[resolved.status] : undefined;
  return ds.rows.map((row) => {
    const title = titleOf(row, resolved);
    const status = readText(prop(row, resolved.status));
    return {
      id: row.id,
      title,
      url: row.url,
      status,
      statusGroup: statusGroupFor(status, statusGroupName(statusSchema, status)),
      area: areaFor(row, resolved, title).area,
      parentTitle: row.parentTitle,
      lastEditedAt: row.lastEditedAt,
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    };
  });
}

function normalizeGoals(ds: RawDataSource, resolved: Record<string, string | null>): Goal[] {
  const statusSchema = resolved.status ? ds.schema[resolved.status] : undefined;
  const samples = new Set(notionConfig.templateSampleTitles.map((t) => t.toLowerCase()));
  return ds.rows.map((row) => {
    const title = titleOf(row, resolved);
    const status = readText(prop(row, resolved.status));
    const start = readNumber(prop(row, resolved.start));
    const current = readNumber(prop(row, resolved.current));
    const target = readNumber(prop(row, resolved.target));
    let progress = readNumber(prop(row, resolved.progress));
    let progressSource: FieldSource = progress != null ? 'notion' : 'unavailable';
    if (progress != null && progress > 1.0001) progress = progress / 100;
    if (progress == null && current != null && target != null && target !== (start ?? 0)) {
      progress = (current - (start ?? 0)) / (target - (start ?? 0));
      progressSource = 'derived';
    }
    if (progress != null) progress = Math.max(0, Math.min(1, progress));

    let templateReason: string | null = null;
    if (samples.has(title.toLowerCase())) templateReason = 'Matches a Notion template sample title';
    else if (title === 'Untitled') templateReason = 'Empty, untitled row';

    return {
      id: row.id,
      title,
      url: row.url,
      status,
      statusGroup: statusGroupFor(status, statusGroupName(statusSchema, status)),
      start,
      current,
      target,
      unit: readText(prop(row, resolved.unit)),
      progress,
      progressSource,
      due: readDate(prop(row, resolved.due))?.start ?? null,
      priority: readText(prop(row, resolved.priority)),
      area: areaFor(row, resolved, title).area,
      isTemplate: templateReason !== null,
      templateReason,
      lastEditedAt: row.lastEditedAt,
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    };
  });
}

function normalizeDailyLogs(ds: RawDataSource, resolved: Record<string, string | null>, tz: string): DailyLog[] {
  const out: DailyLog[] = [];
  for (const row of ds.rows) {
    const date = rowDate(row, resolved, tz);
    if (!date) continue;
    const checks: Record<string, boolean> = {};
    for (const [name, value] of Object.entries(row.properties)) {
      if (value.type === 'checkbox') checks[name] = value.checkbox === true;
    }
    out.push({
      id: row.id,
      date,
      checks,
      win: readText(prop(row, resolved.win)),
      improvement: readText(prop(row, resolved.improvement)),
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    });
  }
  return out;
}

function normalizeWorkouts(ds: RawDataSource, resolved: Record<string, string | null>, tz: string): Workout[] {
  const out: Workout[] = [];
  for (const row of ds.rows) {
    const date = rowDate(row, resolved, tz);
    if (!date) continue;
    const exercise = readText(prop(row, resolved.exercise));
    const sets = readNumber(prop(row, resolved.sets));
    const reps = readNumber(prop(row, resolved.reps));
    const weight = readNumber(prop(row, resolved.weight));
    const hasExercise = exercise != null || sets != null || reps != null || weight != null;
    out.push({
      id: row.id,
      date,
      title: titleOf(row, resolved),
      type: readText(prop(row, resolved.type)),
      durationMin: readNumber(prop(row, resolved.duration)),
      completed: readBool(prop(row, resolved.completed)),
      exercises: hasExercise
        ? [{ exercise: exercise ?? titleOf(row, resolved), sets, reps, weight, unit: resolved.weight && /kg/i.test(resolved.weight) ? 'kg' : 'lb' }]
        : [],
      url: row.url,
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    });
  }
  return out;
}

function normalizeNutrition(ds: RawDataSource, resolved: Record<string, string | null>, tz: string): NutritionEntry[] {
  const out: NutritionEntry[] = [];
  for (const row of ds.rows) {
    const date = rowDate(row, resolved, tz);
    if (!date) continue;
    let water = readNumber(prop(row, resolved.water));
    if (water != null && resolved.water && /oz/i.test(resolved.water)) water = water * 29.5735;
    else if (water != null && resolved.water && /\bl\b|liter|litre/i.test(resolved.water)) water = water * 1000;
    out.push({
      id: row.id,
      date,
      calories: readNumber(prop(row, resolved.calories)),
      protein: readNumber(prop(row, resolved.protein)),
      carbs: readNumber(prop(row, resolved.carbs)),
      fat: readNumber(prop(row, resolved.fat)),
      waterMl: water,
      label: readText(prop(row, resolved.title)),
      prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
    });
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function normalizeHealth(ds: RawDataSource, resolved: Record<string, string | null>, tz: string): HealthSample[] {
  const out: HealthSample[] = [];
  for (const row of ds.rows) {
    const date = rowDate(row, resolved, tz);
    if (!date) continue;
    for (const [name, value] of Object.entries(row.properties)) {
      if (!['number', 'formula', 'rollup'].includes(value.type)) continue;
      const n = readNumber(value);
      if (n == null) continue;
      const rule = notionConfig.healthMetrics.find((m) => m.match.test(name));
      const unit = rule?.unit === 'lb' && /kg/i.test(name) ? 'kg' : (rule?.unit ?? null);
      out.push({
        id: `${row.id}:${slug(name)}`,
        date,
        metric: rule?.key ?? slug(name),
        label: rule?.label ?? name,
        value: n,
        unit,
        prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
      });
    }
  }
  return out;
}

function normalizeAutomations(ds: RawDataSource, resolved: Record<string, string | null>): Automation[] {
  return ds.rows.map((row) => ({
    id: row.id,
    name: titleOf(row, resolved),
    tool: readText(prop(row, resolved.tool)),
    status: readText(prop(row, resolved.status)),
    canActExternally: readBool(prop(row, resolved.external)),
    approvalRequired: readBool(prop(row, resolved.approval)),
    lastRun: readDate(prop(row, resolved.lastRun))?.start ?? null,
    monthlyCost: readNumber(prop(row, resolved.cost)),
    prov: { source: 'none', database: ds.title, url: row.url ?? undefined },
  }));
}

export function normalize(bundle: RawBundle, tz: string = dashboardConfig.timezone): NormalizeResult {
  const entities: Entities = {
    tasks: [],
    projects: [],
    goals: [],
    dailyLogs: [],
    workouts: [],
    nutrition: [],
    health: [],
    automations: [],
    documents: bundle.documents,
  };
  const schema: SchemaReport[] = [];
  const warnings: string[] = [];
  let taskResolved: Record<string, string | null> | null = null;

  for (const ds of bundle.dataSources) {
    const specs = fieldSpecs[ds.entity];
    if (!specs) continue;
    const resolved = resolveFields(ds.schema, specs);
    schema.push({
      database: ds.title,
      databaseId: ds.databaseId,
      entity: ds.entity,
      rowCount: ds.rows.length,
      properties: Object.values(ds.schema).map((p) => ({ name: p.name, type: p.type })),
      resolved,
    });

    switch (ds.entity) {
      case 'task':
        taskResolved ??= resolved;
        entities.tasks.push(...normalizeTasks(ds, resolved));
        break;
      case 'project':
        entities.projects.push(...normalizeProjects(ds, resolved));
        break;
      case 'goal':
        entities.goals.push(...normalizeGoals(ds, resolved));
        break;
      case 'dailyLog':
        entities.dailyLogs.push(...normalizeDailyLogs(ds, resolved, tz));
        break;
      case 'workout':
        entities.workouts.push(...normalizeWorkouts(ds, resolved, tz));
        break;
      case 'nutrition':
        entities.nutrition.push(...normalizeNutrition(ds, resolved, tz));
        break;
      case 'health':
        entities.health.push(...normalizeHealth(ds, resolved, tz));
        break;
      case 'automation':
        entities.automations.push(...normalizeAutomations(ds, resolved));
        break;
      default:
        break;
    }
  }

  // Stamp provenance with the actual source kind.
  for (const list of Object.values(entities) as { prov?: { source: string } }[][]) {
    for (const item of list) if (item.prov) item.prov.source = bundle.source.kind;
  }

  const r = taskResolved ?? {};
  const statusKnown = r.status != null || r.done != null;
  const taskFields: Record<string, FieldSource> = {
    status: statusKnown ? 'notion' : 'unavailable',
    due: r.due ? 'notion' : 'unavailable',
    priority: r.priority ? 'notion' : 'unavailable',
    owner: r.owner ? 'notion' : 'unavailable',
    waitingOnKevin: r.waitingOnKevin ? 'notion' : statusKnown ? 'derived' : 'unavailable',
    blocked: r.blocked ? 'notion' : statusKnown ? 'derived' : 'unavailable',
    timeBucket: r.timeBucket ? 'notion' : r.due ? 'derived' : 'unavailable',
    completedAt: r.completedAt ? 'notion' : statusKnown ? 'derived' : 'unavailable',
    area: r.area ? 'notion' : 'derived',
    hierarchy: r.parent || entities.tasks.some((t) => t.parentTitle) ? 'notion' : 'unavailable',
  };

  const metadataOnly = bundle.source.coverage === 'metadata-only';
  if (taskResolved && !statusKnown && !metadataOnly) warnings.push('Tasks: no Status/Done property readable — open/done metrics unavailable.');
  if (taskResolved && !r.due && !metadataOnly) warnings.push('Tasks: no due-date property readable — Today/Overdue unavailable.');

  return { entities, taskFields, schema, warnings };
}
