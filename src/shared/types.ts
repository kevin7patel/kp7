/**
 * Normalized data model shared by the pipeline (Node) and the dashboard (browser).
 *
 * Layers:  Notion → source adapter (raw) → normalize (these types) → metrics → UI.
 * The UI never sees raw Notion responses; only these shapes.
 */

/** Where a value ultimately came from. Drives the provenance chips in the UI. */
export type SourceKind = 'notion-api' | 'notion-mcp-snapshot' | 'demo' | 'none';

/** How trustworthy / direct a displayed value is. */
export type Quality = 'real' | 'derived' | 'demo' | 'missing';

export type StatusGroup = 'todo' | 'in_progress' | 'waiting' | 'blocked' | 'done';

/** Which logical fields were actually populated from Notion for a record type. */
export type FieldSource = 'notion' | 'derived' | 'unavailable';

export interface Provenance {
  source: SourceKind;
  /** Notion database / data source name the record came from. */
  database?: string;
  url?: string;
}

export interface Task {
  id: string;
  title: string;
  url: string | null;
  status: string | null;
  statusGroup: StatusGroup | null;
  /** YYYY-MM-DD or full ISO datetime when the Notion date has a time. */
  due: string | null;
  dueHasTime: boolean;
  priority: string | null;
  /** 1 = highest. Null when no priority property exists. */
  priorityRank: number | null;
  owner: string | null;
  waitingOnKevin: boolean | null;
  blocked: boolean | null;
  /** Explicit time-of-day bucket from Notion (e.g. "Afternoon"), if such a property exists. */
  timeBucket: string | null;
  area: string;
  areaSource: FieldSource;
  parentId: string | null;
  parentTitle: string | null;
  projectIds: string[];
  completedAt: string | null;
  /** 'notion' = explicit completion date; 'derived' = last-edited time of a done task (proxy). */
  completedAtSource: FieldSource;
  createdAt: string | null;
  lastEditedAt: string | null;
  prov: Provenance;
}

export interface Project {
  id: string;
  title: string;
  url: string | null;
  status: string | null;
  statusGroup: StatusGroup | null;
  area: string;
  parentTitle: string | null;
  lastEditedAt: string | null;
  prov: Provenance;
}

export interface Goal {
  id: string;
  title: string;
  url: string | null;
  status: string | null;
  statusGroup: StatusGroup | null;
  start: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  /** 0..1 when known (explicit progress property, or derived from start/current/target). */
  progress: number | null;
  progressSource: FieldSource;
  due: string | null;
  priority: string | null;
  area: string;
  /** True when the row looks like Notion template sample content rather than a personal goal. */
  isTemplate: boolean;
  templateReason: string | null;
  lastEditedAt: string | null;
  prov: Provenance;
}

/** One row of a daily log / habit tracker. `checks` maps habit name → done. */
export interface DailyLog {
  id: string;
  date: string;
  checks: Record<string, boolean>;
  win: string | null;
  improvement: string | null;
  prov: Provenance;
}

export interface ExerciseEntry {
  exercise: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: string | null;
}

export interface Workout {
  id: string;
  date: string;
  title: string;
  type: string | null;
  durationMin: number | null;
  completed: boolean | null;
  exercises: ExerciseEntry[];
  url: string | null;
  prov: Provenance;
}

export interface NutritionEntry {
  id: string;
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  waterMl: number | null;
  label: string | null;
  prov: Provenance;
}

export interface HealthSample {
  id: string;
  date: string;
  /** Normalized metric key, e.g. "weight", "sleep_hours", "resting_hr". */
  metric: string;
  label: string;
  value: number;
  unit: string | null;
  prov: Provenance;
}

export interface Automation {
  id: string;
  name: string;
  tool: string | null;
  status: string | null;
  canActExternally: boolean | null;
  approvalRequired: boolean | null;
  lastRun: string | null;
  monthlyCost: number | null;
  prov: Provenance;
}

export interface DocRef {
  id: string;
  title: string;
  url: string | null;
  path: string | null;
  lastEditedAt: string | null;
  kind: 'hub' | 'checklist' | 'plan' | 'reference' | 'database';
}

/** A short, quotable statement read from a Notion page (e.g. a program's status line). */
export interface Fact {
  id: string;
  category: Category;
  label: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string | null;
  capturedAt: string;
}

export type Category =
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'habits'
  | 'routines'
  | 'fitness'
  | 'workouts'
  | 'nutrition'
  | 'health'
  | 'body'
  | 'sleep'
  | 'development'
  | 'milestones'
  | 'automations'
  | 'finance'
  | 'travel'
  | 'notes';

export type MappingStatus = 'connected' | 'partial' | 'missing' | 'template';

/** One row of the "what did we find in Notion" map shown on the Sources screen. */
export interface SourceMapEntry {
  category: Category;
  status: MappingStatus;
  sources: { title: string; url: string | null; note: string }[];
  note: string;
}

/** Schema snapshot of a Notion data source and how logical fields were resolved. */
export interface SchemaReport {
  database: string;
  databaseId: string;
  entity: string;
  rowCount: number;
  properties: { name: string; type: string }[];
  resolved: Record<string, string | null>;
}

export interface StageResult {
  stage: 'SYNC' | 'VALIDATE' | 'NORMALIZE' | 'CALCULATE' | 'UPDATE' | 'VERIFY';
  ok: boolean;
  ms: number;
  detail: string;
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Entities {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  dailyLogs: DailyLog[];
  workouts: Workout[];
  nutrition: NutritionEntry[];
  health: HealthSample[];
  automations: Automation[];
  documents: DocRef[];
}

export interface SourceInfo {
  kind: SourceKind;
  label: string;
  /** When the source data was read from Notion. */
  capturedAt: string;
  /** full = every property readable; metadata-only = titles/hierarchy/timestamps only. */
  coverage: 'full' | 'partial' | 'metadata-only' | 'none';
  notes: string[];
}

export interface DashboardPayload {
  schemaVersion: 1;
  generatedAt: string;
  timezone: string;
  source: SourceInfo;
  sync: { ok: boolean; stages: StageResult[]; warnings: string[] };
  entities: Entities;
  /** Which logical task fields are available from the source (drives honest empty states). */
  taskFields: Record<string, FieldSource>;
  sourceMap: SourceMapEntry[];
  schema: SchemaReport[];
  facts: Fact[];
  verification: { ok: boolean; checks: VerificationCheck[] };
}

/** Encrypted envelope published to static hosting (the repo is public). */
export interface EncryptedEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  ct: string;
  generatedAt: string;
}

/** A computed, display-ready metric with full provenance metadata. */
export interface MetricValue {
  id: string;
  label: string;
  value: number | null;
  unit: string | null;
  /** Optional pre-formatted value (e.g. "3 / 7"). */
  display?: string;
  period: string;
  source: string;
  calculation: string;
  lastUpdated: string | null;
  quality: Quality;
  /** Why the metric is missing, or a caveat for derived values. */
  note?: string;
  target?: number | null;
  /** 0..1 for ring/meter display when meaningful. */
  ratio?: number | null;
  series?: { date: string; value: number | null }[];
  delta?: { value: number; period: string; goodWhen: 'up' | 'down' | 'neutral' } | null;
}
