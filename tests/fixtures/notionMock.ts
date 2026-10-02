/**
 * Minimal in-memory Notion API (2025-09-03 data-source endpoints + legacy fallback)
 * used to exercise the real NotionApiSource without network access.
 * All content here is invented test fixture data, not Kevin's.
 */
type Json = Record<string, unknown>;

const title = (s: string) => ({ type: 'title', title: [{ plain_text: s }] });
const status = (s: string) => ({ type: 'status', status: { name: s } });
const date = (start: string | null) => ({ type: 'date', date: start ? { start, end: null } : null });
const check = (b: boolean) => ({ type: 'checkbox', checkbox: b });
const num = (n: number | null) => ({ type: 'number', number: n });
const select = (s: string | null) => ({ type: 'select', select: s ? { name: s } : null });
const rel = (ids: string[]) => ({ type: 'relation', relation: ids.map((id) => ({ id })) });

export const TASKS_DB = 'fa4ae1d8bafd4aa6bfc4faf35cbb1599';
export const GOALS_DB = '32d38b58768580eb878ac592696f61f3';
export const PROJECTS_DB = '35b1e5ca4ec9453392f548e8955323d5';

const taskSchema = {
  Name: { type: 'title' },
  Status: {
    type: 'status',
    status: {
      options: [
        { id: 's1', name: 'Not started' },
        { id: 's2', name: 'In progress' },
        { id: 's3', name: 'Waiting on Kevin' },
        { id: 's4', name: 'Blocked' },
        { id: 's5', name: 'Done' },
      ],
      groups: [
        { name: 'To-do', option_ids: ['s1'] },
        { name: 'In progress', option_ids: ['s2', 's3', 's4'] },
        { name: 'Complete', option_ids: ['s5'] },
      ],
    },
  },
  Due: { type: 'date' },
  Priority: { type: 'select' },
  Area: { type: 'select' },
  'Parent item': { type: 'relation' },
  Completed: { type: 'date' },
};

/** Builds rows relative to `today` (YYYY-MM-DD, America/Chicago). */
export function buildTaskPages(today: string, yesterday: string, tomorrow: string) {
  const page = (id: string, props: Json, edited = `${today}T15:00:00.000Z`) => ({
    object: 'page',
    id,
    url: `https://www.notion.so/${id}`,
    created_time: '2026-09-01T12:00:00.000Z',
    last_edited_time: edited,
    properties: props,
  });
  return [
    page('t1', { Name: title('Overdue thing'), Status: status('Not started'), Due: date(yesterday), Priority: select('High'), Area: select('Tru'), 'Parent item': rel([]), Completed: date(null) }),
    page('t2', { Name: title('Morning thing'), Status: status('In progress'), Due: date(today), Priority: select('Low'), Area: select(null), 'Parent item': rel([]), Completed: date(null) }),
    page('t3', { Name: title('Afternoon call'), Status: status('Not started'), Due: date(`${today}T19:30:00.000Z`), Priority: select(null), Area: select(null), 'Parent item': rel([]), Completed: date(null) }),
    page('t4', { Name: title('Approve quote'), Status: status('Waiting on Kevin'), Due: date(tomorrow), Priority: select(null), Area: select('Staybridge'), 'Parent item': rel([]), Completed: date(null) }, '2026-09-28T15:00:00.000Z'),
    page('t5', { Name: title('Stuck item'), Status: status('Blocked'), Due: date(null), Priority: select(null), Area: select(null), 'Parent item': rel([]), Completed: date(null) }),
    page('t6', { Name: title('Shipped item'), Status: status('Done'), Due: date(yesterday), Priority: select(null), Area: select(null), 'Parent item': rel([]), Completed: date(today) }),
    page('t7', { Name: title('Sub task'), Status: status('Done'), Due: date(null), Priority: select(null), Area: select(null), 'Parent item': rel(['t2']), Completed: date(yesterday) }),
  ];
}

export function createNotionMock(opts: { today: string; yesterday: string; tomorrow: string; legacy?: boolean; rateLimitOnce?: boolean }) {
  const calls: string[] = [];
  let limited = !opts.rateLimitOnce;
  const taskPages = buildTaskPages(opts.today, opts.yesterday, opts.tomorrow);

  const goalPages = [
    { object: 'page', id: 'g1', url: 'https://www.notion.so/g1', last_edited_time: '2026-09-30T10:00:00.000Z', properties: { Name: title('Increase sales by 20%'), 'Start value': num(0), 'End value': num(20), Progress: { type: 'formula', formula: { type: 'number', number: 0.5 } } } },
    { object: 'page', id: 'g2', url: 'https://www.notion.so/g2', last_edited_time: '2026-09-30T10:00:00.000Z', properties: { Name: title('Weight to 195'), 'Start value': num(208), 'Current value': num(201.5), 'End value': num(195), Progress: { type: 'formula', formula: { type: 'number', number: null } } } },
  ];
  const goalSchema = { Name: { type: 'title' }, 'Start value': { type: 'number' }, 'Current value': { type: 'number' }, 'End value': { type: 'number' }, Progress: { type: 'formula' } };

  const logPages = [opts.yesterday, opts.today].map((d, i) => ({
    object: 'page',
    id: `l${i}`,
    url: null,
    last_edited_time: `${d}T12:00:00.000Z`,
    properties: { Day: title(d), Date: date(d), 'Morning check-in': check(true), 'Evening journal': check(i === 0) },
  }));
  const logSchema = { Day: { type: 'title' }, Date: { type: 'date' }, 'Morning check-in': { type: 'checkbox' }, 'Evening journal': { type: 'checkbox' } };

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input).replace('https://api.notion.com/v1', '');
    const method = init?.method ?? 'GET';
    const version = (init?.headers as Record<string, string>)['Notion-Version'];
    calls.push(`${method} ${url} @${version}`);
    if (!limited) {
      limited = true;
      return json(429, { code: 'rate_limited', message: 'slow down' }, { 'retry-after': '0' });
    }

    const dbMatch = url.match(/^\/databases\/(\w+)$/);
    if (dbMatch && method === 'GET') {
      const id = dbMatch[1];
      if (id === TASKS_DB || id === GOALS_DB) {
        if (opts.legacy) return json(200, { properties: id === TASKS_DB ? taskSchema : goalSchema });
        return json(200, { data_sources: [{ id: `ds-${id}`, name: 'Main' }] });
      }
      return json(404, { code: 'object_not_found', message: 'Could not find database' });
    }
    const dsMatch = url.match(/^\/data_sources\/([\w-]+)(\/query)?$/);
    if (dsMatch) {
      const id = dsMatch[1];
      const isQuery = !!dsMatch[2];
      const schema = id === `ds-${TASKS_DB}` ? taskSchema : id === `ds-${GOALS_DB}` ? goalSchema : id === 'ds-log' ? logSchema : null;
      const pages = id === `ds-${TASKS_DB}` ? taskPages : id === `ds-${GOALS_DB}` ? goalPages : id === 'ds-log' ? logPages : null;
      if (!schema || !pages) return json(404, { code: 'object_not_found', message: 'nope' });
      if (!isQuery) return json(200, { properties: Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, { name: k, ...v }])) });
      // Paginate tasks in pages of 4 to exercise cursors.
      const body = init?.body ? (JSON.parse(String(init.body)) as { start_cursor?: string }) : {};
      const start = body.start_cursor ? Number(body.start_cursor) : 0;
      const slice = pages.slice(start, start + 4);
      const next = start + 4 < pages.length ? String(start + 4) : null;
      return json(200, { results: slice, has_more: next !== null, next_cursor: next });
    }
    const legacyQuery = url.match(/^\/databases\/(\w+)\/query$/);
    if (legacyQuery && opts.legacy) {
      const pages = legacyQuery[1] === TASKS_DB ? taskPages : goalPages;
      return json(200, { results: pages, has_more: false, next_cursor: null });
    }
    if (url === '/search') {
      return json(200, {
        results: [
          { object: 'data_source', id: `ds-${TASKS_DB}`, title: [{ plain_text: 'Tasks' }], parent: { database_id: TASKS_DB } },
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
