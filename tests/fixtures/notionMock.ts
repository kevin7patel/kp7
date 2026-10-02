/**
 * Minimal in-memory Notion API used to exercise the real NotionApiSource without network.
 * The SCHEMA mirrors Kevin's verified Tasks/Projects property names and types
 * (docs/notion-schema.md); every ROW is invented fixture data.
 */
type Json = Record<string, unknown>;

const title = (s: string) => ({ type: 'title', title: [{ plain_text: s }] });
const text = (s: string | null) => ({ type: 'rich_text', rich_text: s ? [{ plain_text: s }] : [] });
const date = (start: string | null) => ({ type: 'date', date: start ? { start, end: null } : null });
const check = (b: boolean) => ({ type: 'checkbox', checkbox: b });
const num = (n: number | null) => ({ type: 'number', number: n });
const select = (s: string | null) => ({ type: 'select', select: s ? { name: s } : null });
const rel = (ids: string[]) => ({ type: 'relation', relation: ids.map((id) => ({ id })) });
const opts = (...names: string[]) => ({ options: names.map((name, i) => ({ id: `o${i}-${name}`, name })) });

export const TASKS_DB = 'fa4ae1d8bafd4aa6bfc4faf35cbb1599';
export const PROJECTS_DB = '35b1e5ca4ec9453392f548e8955323d5';
export const GOALS_DB = '32d38b58768580eb878ac592696f61f3';
export const TASKS_DS = 'ed47cf5c-9013-48bd-8c76-d3fd8806caff';
export const PROJECTS_DS = 'a862fc2e-e045-45a0-972b-6592df011baa';
export const GOALS_DS = '32d38b58-7685-8064-90bb-000b08e4d5ae';

export interface MockOptions {
  today: string;
  yesterday: string;
  tomorrow: string;
  /** Data-source endpoints unavailable → adapter must fall back to legacy database endpoints. */
  legacy?: boolean;
  rateLimitOnce?: boolean;
  /** Add an explicit "Completed" date property (not present in Kevin's real schema). */
  withCompletedDate?: boolean;
  /** Add an explicit "Needs Kevin" checkbox (not present in Kevin's real schema). */
  withNeedsKevin?: boolean;
  /** Make the required Projects source fail. */
  projectsUnshared?: boolean;
}

export function createNotionMock(o: MockOptions) {
  const calls: string[] = [];
  let limited = !o.rateLimitOnce;

  const taskSchema: Json = {
    Name: { type: 'title' },
    Done: { type: 'checkbox' },
    Progress: { type: 'select', select: opts('Inbox', 'To Do', 'In Progress', 'Waiting') },
    Priority: { type: 'select', select: opts('P1 · High', 'P2 · Normal', 'P3 · Low') },
    'Top 3': { type: 'select', select: opts('1', '2', '3') },
    'Next action': { type: 'rich_text' },
    'Due date': { type: 'date' },
    Area: { type: 'select', select: opts('Personal', 'Tru Fort Walton Beach', 'Staybridge Suites Crestview') },
    List: { type: 'select', select: opts('Kevin', 'Agent help', 'Tru', 'Staybridge', 'Project', 'Later') },
    Source: { type: 'select', select: opts('Manual', 'Uploaded file', 'Conversation', 'Email', 'Test') },
    Owner: { type: 'people' },
    Project: { type: 'relation' },
    'Parent item': { type: 'relation' },
    Status: { type: 'formula' },
    'Last updated': { type: 'last_edited_time' },
    ...(o.withCompletedDate ? { Completed: { type: 'date' } } : {}),
    ...(o.withNeedsKevin ? { 'Needs Kevin': { type: 'checkbox' } } : {}),
  };

  const page = (id: string, p: Json, edited = `${o.today}T15:00:00.000Z`) => ({
    object: 'page',
    id,
    url: `https://www.notion.so/${id}`,
    created_time: '2026-09-01T12:00:00.000Z',
    last_edited_time: edited,
    properties: p,
  });
  const task = (id: string, name: string, f: { progress: string; done?: boolean; due?: string | null; priority?: string | null; area?: string | null; list?: string | null; source?: string; top3?: string | null; next?: string | null; project?: string[]; parent?: string[]; completed?: string | null; needsKevin?: boolean }, edited?: string) =>
    page(
      id,
      {
        Name: title(name),
        Done: check(!!f.done),
        Progress: select(f.progress),
        Priority: select(f.priority ?? null),
        'Top 3': select(f.top3 ?? null),
        'Next action': text(f.next ?? null),
        'Due date': date(f.due ?? null),
        Area: select(f.area ?? null),
        List: select(f.list ?? null),
        Source: select(f.source ?? 'Manual'),
        Owner: { type: 'people', people: [] },
        Project: rel(f.project ?? []),
        'Parent item': rel(f.parent ?? []),
        Status: { type: 'formula', formula: { type: 'string', string: 'computed' } },
        'Last updated': { type: 'last_edited_time', last_edited_time: edited ?? `${o.today}T15:00:00.000Z` },
        ...(o.withCompletedDate ? { Completed: date(f.completed ?? null) } : {}),
        ...(o.withNeedsKevin ? { 'Needs Kevin': check(!!f.needsKevin) } : {}),
      },
      edited,
    );

  const taskPages = [
    task('t1', 'Overdue thing', { progress: 'To Do', due: o.yesterday, priority: 'P1 · High', area: 'Tru Fort Walton Beach', list: 'Tru', project: ['p1'] }),
    task('t2', 'Morning thing', { progress: 'In Progress', due: o.today, priority: 'P3 · Low', list: 'Kevin', next: 'Call the vendor' }),
    task('t3', 'Afternoon call', { progress: 'To Do', due: `${o.today}T19:30:00.000Z`, area: 'Personal', list: 'Kevin' }),
    task('t4', 'Approve quote', { progress: 'Waiting', due: o.tomorrow, area: 'Staybridge Suites Crestview', list: 'Kevin', top3: '1', needsKevin: true }, '2026-09-28T15:00:00.000Z'),
    task('t5', 'Someday item', { progress: 'To Do', area: 'Personal', list: 'Later' }),
    task('t6', 'Shipped item', { progress: 'In Progress', done: true, area: 'Personal', list: 'Kevin', project: ['p1'], completed: o.today }),
    task('t7', 'Sub task', { progress: 'To Do', done: true, list: 'Kevin', parent: ['t2'], completed: o.yesterday }),
    task('t8', 'Test row', { progress: 'To Do', source: 'Test', list: 'Kevin' }),
  ];

  const projectSchema: Json = {
    Name: { type: 'title' },
    Outcome: { type: 'rich_text' },
    Area: { type: 'select', select: opts('Personal', 'Tru Fort Walton Beach') },
    Owner: { type: 'people' },
    Status: { type: 'select', select: opts('Needs Review', 'To Do', 'In Progress', 'Waiting', 'Done') },
    'Target date': { type: 'date' },
    'Last updated': { type: 'last_edited_time' },
  };
  const projectPages = [
    page('p1', { Name: title('Lobby refresh'), Outcome: text('New lighting and signage installed.'), Area: select('Tru Fort Walton Beach'), Status: select('In Progress'), 'Target date': date(o.tomorrow) }),
    page('p2', { Name: title('Weekly routine'), Outcome: text('A repeatable weekly plan.'), Area: select('Personal'), Status: select('Needs Review'), 'Target date': date(null) }),
  ];

  const goalSchema: Json = { Name: { type: 'title' }, 'Start value': { type: 'number' }, 'Current value': { type: 'number' }, 'End value': { type: 'number' }, Progress: { type: 'formula' } };
  const goalPages = [
    page('g1', { Name: title('Increase sales by 20%'), 'Start value': num(0), 'End value': num(20), Progress: { type: 'formula', formula: { type: 'number', number: 0.5 } } }),
    page('g2', { Name: title('Weight to 195'), 'Start value': num(208), 'Current value': num(201.5), 'End value': num(195), Progress: { type: 'formula', formula: { type: 'number', number: null } } }),
  ];

  const logSchema: Json = { Day: { type: 'title' }, Date: { type: 'date' }, 'Morning check-in': { type: 'checkbox' }, 'Evening journal': { type: 'checkbox' } };
  const logPages = [o.yesterday, o.today].map((d, i) => page(`l${i}`, { Day: title(d), Date: date(d), 'Morning check-in': check(true), 'Evening journal': check(i === 0) }, `${d}T12:00:00.000Z`));

  const sources: Record<string, { schema: Json; pages: unknown[]; db: string }> = {
    [TASKS_DS]: { schema: taskSchema, pages: taskPages, db: TASKS_DB },
    [PROJECTS_DS]: { schema: projectSchema, pages: projectPages, db: PROJECTS_DB },
    [GOALS_DS]: { schema: goalSchema, pages: goalPages, db: GOALS_DB },
    'ds-log': { schema: logSchema, pages: logPages, db: 'dblog' },
  };
  const byDb = Object.fromEntries(Object.entries(sources).map(([ds, v]) => [v.db, { ...v, ds }]));

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const withNames = (schema: Json) => Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, { name: k, ...(v as Json) }]));
  const paginate = (pages: unknown[], body: { start_cursor?: string }) => {
    const start = body.start_cursor ? Number(body.start_cursor) : 0;
    const next = start + 4 < pages.length ? String(start + 4) : null;
    return { results: pages.slice(start, start + 4), has_more: next !== null, next_cursor: next };
  };
  const unshared = (id: string) => o.projectsUnshared && (id === PROJECTS_DS || id === PROJECTS_DB);

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input).replace('https://api.notion.com/v1', '');
    const method = init?.method ?? 'GET';
    const version = (init?.headers as Record<string, string>)['Notion-Version'];
    calls.push(`${method} ${url} @${version}`);
    if (!limited) {
      limited = true;
      return json(429, { code: 'rate_limited', message: 'slow down' }, { 'retry-after': '0' });
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as { start_cursor?: string }) : {};

    const ds = url.match(/^\/data_sources\/([\w-]+)(\/query)?$/);
    if (ds) {
      if (o.legacy) return json(400, { code: 'invalid_request_url', message: 'Invalid request URL.' });
      const src = sources[ds[1]!];
      if (!src || unshared(ds[1]!)) return json(404, { code: 'object_not_found', message: 'Could not find data source.' });
      return ds[2] ? json(200, paginate(src.pages, body)) : json(200, { properties: withNames(src.schema) });
    }
    const db = url.match(/^\/databases\/(\w+)(\/query)?$/);
    if (db) {
      const src = byDb[db[1]!];
      if (!src || unshared(db[1]!)) return json(404, { code: 'object_not_found', message: 'Could not find database.' });
      if (db[2]) return json(200, paginate(src.pages, body));
      return o.legacy ? json(200, { properties: withNames(src.schema) }) : json(200, { data_sources: [{ id: src.ds, name: 'Main' }] });
    }
    if (url === '/search') {
      return json(200, {
        results: [
          { object: 'data_source', id: TASKS_DS, title: [{ plain_text: 'Tasks' }], parent: { database_id: TASKS_DB } },
          { object: 'data_source', id: 'ds-log', title: [{ plain_text: 'Daily Log' }], parent: { database_id: 'dblog' } },
          { object: 'data_source', id: 'ds-misc', title: [{ plain_text: 'Recipes' }], parent: { database_id: 'dbmisc' } },
        ],
        has_more: false,
        next_cursor: null,
      });
    }
    if (url.startsWith('/blocks/')) {
      return json(200, { results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Intro text' }] } }, { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Status: awaiting intake (fixture).' }] } }] });
    }
    if (url.startsWith('/pages/')) {
      return json(200, { object: 'page', id: url.split('/')[2], url: 'https://www.notion.so/x', last_edited_time: '2026-10-01T00:00:00.000Z', properties: { title: title('Fixture page') } });
    }
    return json(400, { code: 'invalid_request_url', message: `unmocked ${method} ${url}` });
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls };
}
