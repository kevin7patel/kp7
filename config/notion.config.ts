/**
 * Notion → normalized-model mapping. This is the ONLY place that knows Notion
 * database IDs and property names. When a property is added or renamed in Notion,
 * change it here (or pin it with `property: 'Exact Name'`); the rest of the
 * dashboard does not change.
 *
 * Database IDs were discovered read-only on 2026-10-02 via the Notion connector.
 * IDs are not secrets: they are useless without an integration token that Kevin
 * has explicitly shared pages with.
 */

export type EntityKind =
  | 'task'
  | 'project'
  | 'goal'
  | 'dailyLog'
  | 'workout'
  | 'nutrition'
  | 'health'
  | 'automation'
  | 'ignore';

export interface FieldSpec {
  /** Accepted Notion property types, in order of preference. */
  types: string[];
  /** Name patterns; the first property matching both type and a pattern wins. */
  names?: RegExp[];
  /** Pin an exact property name (overrides detection). */
  property?: string;
}

export interface DatabaseConfig {
  id: string;
  name: string;
  entity: EntityKind;
  /** Data-source id (2025-09 API). Distinct from the database id; queried directly when set. */
  dataSourceId?: string;
  /** A failing required source fails the sync, so the last good payload stays live. */
  required?: boolean;
  note?: string;
}

const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] || undefined : undefined);

export const notionConfig = {
  /** Data-source era API (falls back to 2022-06-28 automatically). */
  apiVersion: '2025-09-03',

  databases: [
    {
      id: 'fa4ae1d8bafd4aa6bfc4faf35cbb1599',
      name: 'Tasks',
      entity: 'task',
      dataSourceId: env('NOTION_TASKS_DATA_SOURCE_ID') ?? 'ed47cf5c-9013-48bd-8c76-d3fd8806caff',
      required: true,
      note: 'HOTELS OPS / GM Command Center — work and personal tasks maintained by Kevin and agents',
    },
    {
      id: '35b1e5ca4ec9453392f548e8955323d5',
      name: 'Projects',
      entity: 'project',
      dataSourceId: env('NOTION_PROJECTS_DATA_SOURCE_ID') ?? 'a862fc2e-e045-45a0-972b-6592df011baa',
      required: true,
      note: 'Real longer-term outcomes (Outcome, Status, Target date)',
    },
    { id: '32d38b58768580eb878ac592696f61f3', name: 'Goals Tracker', entity: 'goal', dataSourceId: '32d38b58-7685-8064-90bb-000b08e4d5ae', note: 'Unconfirmed example/template rows — excluded in V1' },
    { id: '8f041be0615e4cec82c49eccff7ab5d0', name: 'Credit Card Benefits Tracker', entity: 'ignore', note: 'Finance — mapped, not shown on the personal dashboard in v1' },
    { id: 'b5738b587685826e8419810af519df60', name: 'Travel Packing List', entity: 'ignore', note: 'Travel reference' },
  ] satisfies DatabaseConfig[],

  /**
   * Any other data source the integration can see is classified by title.
   * This is how a future "Daily Log", "Workouts" or "Body Metrics" database is
   * picked up automatically, with no code change.
   */
  autoDiscover: true,
  classifyByTitle: [
    { entity: 'dailyLog', match: /daily ?log|check-?ins?|journal|habit|routine/i },
    { entity: 'workout', match: /workout|training|exercise|gym ?log|lifting|sessions?/i },
    { entity: 'nutrition', match: /nutrition|meals?|food|macros?|calorie/i },
    { entity: 'health', match: /health|body|biometric|weight|sleep|whoop|recovery|vitals/i },
    { entity: 'automation', match: /automation|agent registry|registry/i },
    { entity: 'goal', match: /goals?\b|okrs?/i },
    { entity: 'project', match: /projects?\b/i },
  ] satisfies { entity: EntityKind; match: RegExp }[],

  /** Pages whose "Status: …" line is shown verbatim as a fact (e.g. fitness intake). */
  watchedPages: [
    { id: '3ed38b587685817cbbb1d66caef90823', title: 'Build a Better Me', category: 'fitness', label: 'Fitness program status', match: /^status\s*:/i },
  ],

  /** Key hub pages linked from the Sources screen. */
  documents: [
    { id: '3eb38b5876858014b3a3c787feadb219', title: 'Kevin’s Life & Hotel Command Center', kind: 'hub' },
    { id: '3ec38b58768581a0a934e05d34ad624e', title: 'Kevin — Master Checklist', kind: 'checklist' },
    { id: '3ec38b5876858182a056f0b7e2de2aa7', title: 'AI Execution Team — Connection & Handoffs', kind: 'reference' },
    { id: '3ec38b587685810abf68d465adf67d72', title: 'Kevin — Executive Links & Action Desk', kind: 'reference' },
    { id: '3ed38b587685817cbbb1d66caef90823', title: 'Build a Better Me', kind: 'plan' },
  ],

  /** Status option → group. Notion status groups (To-do / In progress / Complete) are used first. */
  statusRules: {
    done: /^(done|complete|completed|closed|finished|resolved|archived|cancel+ed)$/i,
    blocked: /block|stuck/i,
    waiting: /wait|pending|needs? (kevin|review|decision|approval|input)|on hold|approval|decision/i,
    inProgress: /progress|doing|active|started|working|underway/i,
    todo: /to.?do|not started|backlog|inbox|next|open|planned|new/i,
  },
  /** Status / owner text meaning "this needs Kevin" (R14 "Waiting on you"). */
  /** Explicit "needs Kevin" wording only. A plain "Waiting" status means waiting on anyone. */
  waitingOnKevin: /waiting on kevin|needs? kevin|kevin to (decide|approve|review)|needs? (decision|approval)/i,

  priorityRank: [
    { match: /urgent|critical|p0|highest|🔥/i, rank: 1 },
    { match: /high|p1|important/i, rank: 2 },
    { match: /med|normal|p2/i, rank: 3 },
    { match: /low|p3|someday/i, rank: 4 },
  ],

  /**
   * Tasks scope rules (verified 2026-10-02): the "All active" view excludes Done and
   * List = Later / Project. Source = Test rows are test data and are dropped.
   */
  taskScope: {
    deferredLists: ['Later', 'Project'],
    excludeSourceValues: ['Test'],
  },

  /** Goals Tracker holds unconfirmed example rows; V1 shows no goal percentages from it until Kevin confirms. */
  goalsTrackerConfirmed: false,

  /** Titles that ship with Notion templates — never shown as Kevin's goals. */
  templateSampleTitles: ['Increase sales by 20%', 'Acquire 20K new users', 'Launch 3 new products'],

  fields: {
    task: {
      title: { types: ['title'] },
      // Kevin's Tasks keep state in a "Progress" select ("Status" is a formula).
      status: { types: ['status', 'select'], names: [/^status$/i, /^progress$/i, /status|state|stage/i] },
      done: { types: ['checkbox'], names: [/^(done|complete|completed)$/i, /done|complete/i] },
      list: { types: ['select'], names: [/^list$/i] },
      top3: { types: ['select', 'number'], names: [/^top ?3$/i, /top ?(3|three)/i] },
      nextAction: { types: ['rich_text'], names: [/^next action$/i, /next (action|step)/i] },
      source: { types: ['select'], names: [/^source$/i] },
      due: { types: ['date'], names: [/^due/i, /^(?!.*(complet|done|finish|creat|edit|start)).*(due|deadline|do date|when|date)/i] },
      priority: { types: ['select', 'status'], names: [/priority|importance|urgency/i] },
      owner: { types: ['people', 'select', 'multi_select', 'rich_text'], names: [/owner|assignee|assigned|agent|who/i] },
      waitingOnKevin: { types: ['checkbox'], names: [/needs? kevin|kevin|approval|decision/i] },
      blocked: { types: ['checkbox'], names: [/block/i] },
      timeBucket: { types: ['select'], names: [/bucket|time of day|slot|when/i] },
      area: { types: ['select', 'multi_select'], names: [/^area$/i, /area|property|hotel|category|domain|context/i] },
      parent: { types: ['relation'], names: [/parent/i] },
      project: { types: ['relation'], names: [/project/i] },
      completedAt: { types: ['date'], names: [/completed|done on|finished|closed/i] },
    },
    project: {
      title: { types: ['title'] },
      status: { types: ['status', 'select'], names: [/status|state|stage/i] },
      area: { types: ['select', 'multi_select'], names: [/^area$/i, /area|property|hotel|category/i] },
      outcome: { types: ['rich_text'], names: [/outcome|goal|result/i] },
      targetDate: { types: ['date'], names: [/target|due|deadline/i] },
    },
    goal: {
      title: { types: ['title'] },
      status: { types: ['status', 'select'], names: [/status|state/i] },
      start: { types: ['number'], names: [/start|baseline|initial/i] },
      current: { types: ['number', 'rollup', 'formula'], names: [/current|actual|now|latest/i] },
      target: { types: ['number'], names: [/end|target|goal value|finish/i] },
      progress: { types: ['formula', 'number', 'rollup'], names: [/progress|percent|%/i] },
      unit: { types: ['select', 'rich_text'], names: [/unit/i] },
      due: { types: ['date'], names: [/due|deadline|target date|date/i] },
      priority: { types: ['select', 'status'], names: [/priority/i] },
      area: { types: ['select', 'multi_select'], names: [/area|category|domain/i] },
    },
    dailyLog: {
      title: { types: ['title'] },
      date: { types: ['date', 'created_time'], names: [/date|day/i] },
      win: { types: ['rich_text'], names: [/win/i] },
      improvement: { types: ['rich_text'], names: [/improve|better|lesson/i] },
    },
    workout: {
      title: { types: ['title'] },
      date: { types: ['date', 'created_time'], names: [/date|day|when/i] },
      type: { types: ['select', 'multi_select'], names: [/type|focus|split|category/i] },
      duration: { types: ['number', 'formula'], names: [/duration|minutes|mins|time/i] },
      completed: { types: ['checkbox'], names: [/done|complete/i] },
      exercise: { types: ['select', 'rich_text', 'relation'], names: [/exercise|movement|lift/i] },
      sets: { types: ['number'], names: [/sets?/i] },
      reps: { types: ['number'], names: [/reps?/i] },
      weight: { types: ['number'], names: [/weight|load|kg|lb/i] },
    },
    nutrition: {
      title: { types: ['title'] },
      date: { types: ['date', 'created_time'], names: [/date|day/i] },
      calories: { types: ['number', 'formula', 'rollup'], names: [/calor|kcal/i] },
      protein: { types: ['number', 'formula', 'rollup'], names: [/protein/i] },
      carbs: { types: ['number', 'formula', 'rollup'], names: [/carb/i] },
      fat: { types: ['number', 'formula', 'rollup'], names: [/^fat|fats?\b(?!.*body)/i] },
      water: { types: ['number', 'formula'], names: [/water|hydration|fluid/i] },
    },
    health: {
      title: { types: ['title'] },
      date: { types: ['date', 'created_time'], names: [/date|day/i] },
    },
    automation: {
      title: { types: ['title'] },
      tool: { types: ['select', 'rich_text'], names: [/tool|platform|agent/i] },
      status: { types: ['status', 'select'], names: [/status|state/i] },
      external: { types: ['checkbox'], names: [/external|act/i] },
      approval: { types: ['checkbox'], names: [/approval/i] },
      lastRun: { types: ['date', 'last_edited_time'], names: [/last run|ran|run/i] },
      cost: { types: ['number', 'formula'], names: [/cost|\$|price/i] },
    },
  } satisfies Record<string, Record<string, FieldSpec>>,

  /** Number-property name → normalized health metric (unit inferred from the name). */
  healthMetrics: [
    { key: 'weight', label: 'Weight', match: /weight|body ?mass/i, unit: 'lb' },
    { key: 'body_fat', label: 'Body fat', match: /body ?fat|bf ?%/i, unit: '%' },
    { key: 'waist', label: 'Waist', match: /waist/i, unit: 'in' },
    { key: 'sleep_hours', label: 'Sleep', match: /sleep (hours|duration|time)|hours slept|^sleep$/i, unit: 'h' },
    { key: 'sleep_score', label: 'Sleep score', match: /sleep (score|performance)/i, unit: null },
    { key: 'steps', label: 'Steps', match: /steps/i, unit: null },
    { key: 'resting_hr', label: 'Resting HR', match: /resting|rhr/i, unit: 'bpm' },
    { key: 'hrv', label: 'HRV', match: /hrv|heart rate variability/i, unit: 'ms' },
    { key: 'recovery', label: 'Recovery', match: /recovery/i, unit: '%' },
    { key: 'strain', label: 'Strain', match: /strain/i, unit: null },
    { key: 'energy', label: 'Energy', match: /energy/i, unit: '/10' },
    { key: 'mood', label: 'Mood', match: /mood/i, unit: '/10' },
  ],
};

export type NotionConfig = typeof notionConfig;
