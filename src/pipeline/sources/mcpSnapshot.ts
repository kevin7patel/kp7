/**
 * Adapter for point-in-time snapshots captured by Claude through the Notion MCP
 * connector (never a live sync). It emits the same RawBundle shape as the API adapter.
 *  - v2: structured rows from saved-view / data-source queries with a declared schema.
 *  - v1: titles + hierarchy only; every other field resolves to "unavailable".
 * Snapshots live in gitignored .data/ and must never be committed.
 */
import { readFile } from 'node:fs/promises';
import type { EntityKind } from '../../../config/notion.config';
import type { DocRef, Fact } from '../../shared/types';
import type { NotionPropertySchema, NotionValue, RawBundle, RawDataSource, RawRow, SourceAdapter } from './types';

interface SnapshotPage {
  id: string;
  title: string;
  path: string | null;
  lastEditedAt: string | null;
}

type SnapshotValue = string | boolean | number | null;

/** v2: structured rows from saved-view / data-source queries (flattened values + a declared schema). */
interface SnapshotDataSource {
  databaseId: string;
  dataSourceId: string;
  title: string;
  entity: string;
  schema: Record<string, { type: string; options?: string[] }>;
  rows: { id: string; url: string | null; lastEditedAt: string | null; values: Record<string, SnapshotValue> }[];
}

interface SnapshotFile {
  kind: 'notion-mcp-snapshot';
  version?: 1 | 2;
  capturedAt: string;
  capturedBy: string;
  coverage: 'metadata-only' | 'partial';
  limits: string[];
  /** v1 */
  databases?: { id: string; title: string; path: string | null; lastEditedAt: string | null; entity: string }[];
  pages?: SnapshotPage[];
  /** v2 */
  dataSources?: SnapshotDataSource[];
  goals?: SnapshotPage[];
  documents: (Omit<DocRef, 'url'> & { url?: string | null })[];
  facts: (Omit<Fact, 'sourceUrl' | 'capturedAt'> & { sourceId: string })[];
}

/** MCP query output renders links as Markdown; the API's plain_text has just the label. */
const plain = (s: string) => s.replace(/\[([^\]]+)\]\((?:https?:|mailto:)[^)]*\)/g, '$1');

/** Rebuild a Notion API-shaped property value from a flattened snapshot value. */
function toNotionValue(type: string, v: SnapshotValue): NotionValue {
  const s = v == null ? '' : type === 'title' || type === 'rich_text' ? plain(String(v)) : String(v);
  switch (type) {
    case 'title':
      return { type, title: s ? [{ plain_text: s }] : [] };
    case 'rich_text':
      return { type, rich_text: s ? [{ plain_text: s }] : [] };
    case 'checkbox':
      return { type, checkbox: v === true || s === '__YES__' };
    case 'select':
    case 'status':
      return { type, [type]: s ? { name: s } : null };
    case 'date':
      return { type, date: s ? { start: s, end: null } : null };
    case 'number':
      return { type, number: typeof v === 'number' ? v : s ? Number(s) : null };
    default:
      return { type, [type]: v };
  }
}

function structuredSource(ds: SnapshotDataSource): RawDataSource {
  const schema: Record<string, NotionPropertySchema> = {};
  for (const [name, def] of Object.entries(ds.schema)) {
    const options = def.options?.map((o) => ({ id: o, name: o }));
    schema[name] = { name, type: def.type, ...(options && def.type === 'select' ? { select: { options } } : {}) };
  }
  return {
    databaseId: ds.databaseId,
    dataSourceId: ds.dataSourceId,
    title: ds.title,
    entity: ds.entity as EntityKind,
    origin: 'configured',
    schema,
    rows: ds.rows.map((r) => ({
      id: r.id,
      url: r.url ?? notionUrl(r.id),
      createdAt: null,
      lastEditedAt: r.lastEditedAt,
      properties: Object.fromEntries(Object.entries(ds.schema).map(([name, def]) => [name, toNotionValue(def.type, r.values[name] ?? null)])),
      parentTitle: null,
    })),
  };
}

const TITLE_SCHEMA: Record<string, NotionPropertySchema> = { Name: { name: 'Name', type: 'title' } };
const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`;

/** Which configured database a page path belongs to, and the parent row title if nested. */
type SnapshotDb = NonNullable<SnapshotFile['databases']>[number];

function locate(path: string | null, dbs: SnapshotDb[]): { db: SnapshotDb; parentTitle: string | null } | null {
  if (!path) return null;
  for (const db of dbs) {
    const prefix = db.path ? `${db.path} / ${db.title}` : db.title;
    if (path === prefix) return { db, parentTitle: null };
    if (path.startsWith(`${prefix} / `)) {
      // Rows nested under another row of the same database are sub-tasks; deeper pages are documents.
      const rest = path.slice(prefix.length + 3);
      return db.entity === 'task' ? { db, parentTitle: rest } : null;
    }
  }
  return null;
}

export class McpSnapshotSource implements SourceAdapter {
  readonly kind = 'notion-mcp-snapshot' as const;

  constructor(private readonly file: string) {}

  async load(): Promise<RawBundle> {
    const snap = JSON.parse(await readFile(this.file, 'utf8')) as SnapshotFile;
    const common = {
      documents: snap.documents.map((d) => ({ ...d, url: d.url ?? notionUrl(d.id) })),
      facts: snap.facts.map(({ sourceId, ...f }) => ({ ...f, sourceUrl: notionUrl(sourceId), capturedAt: snap.capturedAt })),
      errors: [],
    };

    if (snap.dataSources) {
      const dataSources = snap.dataSources.map(structuredSource);
      if (snap.goals?.length) {
        dataSources.push({
          databaseId: '32d38b58768580eb878ac592696f61f3',
          dataSourceId: null,
          title: 'Goals Tracker',
          entity: 'goal',
          origin: 'configured',
          schema: TITLE_SCHEMA,
          rows: snap.goals.map((g) => ({ id: g.id, url: notionUrl(g.id), createdAt: null, lastEditedAt: g.lastEditedAt, properties: { Name: { type: 'title', title: [{ plain_text: g.title }] } }, parentTitle: null })),
        });
      }
      return {
        source: { kind: 'notion-mcp-snapshot', label: 'Notion snapshot via Claude (structured, not live)', capturedAt: snap.capturedAt, coverage: snap.coverage, notes: snap.limits },
        dataSources,
        unmapped: [],
        ...common,
      };
    }

    const byDb = new Map<string, RawRow[]>();
    const databases = snap.databases ?? [];
    for (const page of snap.pages ?? []) {
      const hit = locate(page.path, databases);
      if (!hit) continue;
      const rows = byDb.get(hit.db.id) ?? [];
      rows.push({
        id: page.id,
        url: notionUrl(page.id),
        createdAt: null,
        lastEditedAt: page.lastEditedAt,
        properties: { Name: { type: 'title', title: [{ plain_text: page.title }] } },
        parentTitle: hit.parentTitle,
      });
      byDb.set(hit.db.id, rows);
    }

    const dataSources: RawDataSource[] = databases
      .filter((db) => ['task', 'project', 'goal'].includes(db.entity))
      .map((db) => ({
        databaseId: db.id,
        dataSourceId: null,
        title: db.title,
        entity: db.entity as EntityKind,
        origin: 'configured' as const,
        schema: TITLE_SCHEMA,
        rows: byDb.get(db.id) ?? [],
      }));

    return {
      source: {
        kind: 'notion-mcp-snapshot',
        label: 'Notion snapshot via Claude (metadata only)',
        capturedAt: snap.capturedAt,
        coverage: 'metadata-only',
        notes: snap.limits,
      },
      dataSources,
      unmapped: databases.filter((d) => !['task', 'project', 'goal'].includes(d.entity)).map((d) => ({ id: d.id, title: d.title })),
      ...common,
    };
  }
}
