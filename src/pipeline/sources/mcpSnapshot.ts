/**
 * Adapter for a metadata snapshot captured by Claude through the Notion MCP
 * connector (titles, hierarchy, last-edited times). It emits the same RawBundle
 * shape as the API adapter, with a schema that honestly contains only a title —
 * so every downstream field (status, due, priority…) resolves to "unavailable".
 */
import { readFile } from 'node:fs/promises';
import type { EntityKind } from '../../../config/notion.config';
import type { DocRef, Fact } from '../../shared/types';
import type { NotionPropertySchema, RawBundle, RawDataSource, RawRow, SourceAdapter } from './types';

interface SnapshotPage {
  id: string;
  title: string;
  path: string | null;
  lastEditedAt: string | null;
}

interface SnapshotFile {
  kind: 'notion-mcp-snapshot';
  capturedAt: string;
  capturedBy: string;
  coverage: 'metadata-only';
  limits: string[];
  databases: { id: string; title: string; path: string | null; lastEditedAt: string | null; entity: string }[];
  pages: SnapshotPage[];
  documents: (Omit<DocRef, 'url'> & { url?: string | null })[];
  facts: (Omit<Fact, 'sourceUrl' | 'capturedAt'> & { sourceId: string })[];
}

const TITLE_SCHEMA: Record<string, NotionPropertySchema> = { Name: { name: 'Name', type: 'title' } };
const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`;

/** Which configured database a page path belongs to, and the parent row title if nested. */
function locate(path: string | null, dbs: SnapshotFile['databases']): { db: SnapshotFile['databases'][number]; parentTitle: string | null } | null {
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
    const byDb = new Map<string, RawRow[]>();

    for (const page of snap.pages) {
      const hit = locate(page.path, snap.databases);
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

    const dataSources: RawDataSource[] = snap.databases
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
      documents: snap.documents.map((d) => ({ ...d, url: d.url ?? notionUrl(d.id) })),
      facts: snap.facts.map(({ sourceId, ...f }) => ({ ...f, sourceUrl: notionUrl(sourceId), capturedAt: snap.capturedAt })),
      unmapped: snap.databases.filter((d) => !['task', 'project', 'goal'].includes(d.entity)).map((d) => ({ id: d.id, title: d.title })),
      errors: [],
    };
  }
}
