/**
 * Notion REST adapter — the production source. Read-only: it only issues GET
 * requests and POST /query + /search (which are reads). It never writes to Notion.
 *
 * Uses the data-source API (2025-09-03) and falls back to 2022-06-28 database
 * endpoints if a workspace/database does not support data sources.
 */
import { notionConfig, type EntityKind } from '../../../config/notion.config';
import type { DocRef, Fact } from '../../shared/types';
import { readText } from './notionProps';
import type { NotionPropertySchema, NotionValue, RawBundle, RawDataSource, RawRow, SourceAdapter } from './types';

const BASE = 'https://api.notion.com/v1';
const LEGACY_VERSION = '2022-06-28';

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

interface NotionPage {
  object: 'page';
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, NotionValue>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const compactId = (id: string) => id.replace(/-/g, '');

export class NotionClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly version: string = notionConfig.apiVersion,
  ) {}

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, version = this.version): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Notion-Version': version,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 4) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      let code = 'http_error';
      let message = `${res.status} ${res.statusText}`;
      try {
        const err = (await res.json()) as { code?: string; message?: string };
        code = err.code ?? code;
        message = err.message ?? message;
      } catch {
        /* non-JSON error body */
      }
      throw new NotionApiError(message, res.status, code);
    }
  }
}

function schemaFrom(properties: Record<string, NotionPropertySchema & { id?: string }>): Record<string, NotionPropertySchema> {
  const out: Record<string, NotionPropertySchema> = {};
  for (const [name, p] of Object.entries(properties)) {
    out[name] = { name, type: p.type, status: p.status, select: p.select, multi_select: p.multi_select };
  }
  return out;
}

function toRow(page: NotionPage): RawRow {
  return {
    id: page.id,
    url: page.url ?? `https://www.notion.so/${compactId(page.id)}`,
    createdAt: page.created_time ?? null,
    lastEditedAt: page.last_edited_time ?? null,
    properties: page.properties,
    parentTitle: null,
  };
}

function titleOf(t: unknown): string {
  return Array.isArray(t) ? t.map((x: { plain_text?: string }) => x.plain_text ?? '').join('') : '';
}

export class NotionApiSource implements SourceAdapter {
  readonly kind = 'notion-api' as const;
  private readonly client: NotionClient;

  constructor(
    token: string,
    private readonly now: () => Date = () => new Date(),
    fetchImpl: Fetch = fetch,
  ) {
    this.client = new NotionClient(token, fetchImpl);
  }

  private async queryAll(path: string, version?: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.request<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        'POST',
        path,
        { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
        version,
      );
      pages.push(...res.results.filter((p) => p.object === 'page' && !p.in_trash && !p.archived));
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  /** Load one configured database (all of its data sources). */
  private async loadDatabase(databaseId: string, name: string, entity: EntityKind, origin: RawDataSource['origin']): Promise<RawDataSource[]> {
    const db = await this.client.request<{
      title?: unknown;
      data_sources?: { id: string; name: string }[];
      properties?: Record<string, NotionPropertySchema>;
    }>('GET', `/databases/${databaseId}`);

    if (db.data_sources?.length) {
      const out: RawDataSource[] = [];
      for (const ds of db.data_sources) {
        const meta = await this.client.request<{ properties: Record<string, NotionPropertySchema>; title?: unknown }>('GET', `/data_sources/${ds.id}`);
        const pages = await this.queryAll(`/data_sources/${ds.id}/query`);
        out.push({
          databaseId,
          dataSourceId: ds.id,
          title: db.data_sources.length > 1 ? `${name} · ${ds.name}` : name,
          entity,
          origin,
          schema: schemaFrom(meta.properties),
          rows: pages.map(toRow),
        });
      }
      return out;
    }

    // Legacy single-source database endpoint.
    const legacy = await this.client.request<{ properties: Record<string, NotionPropertySchema> }>('GET', `/databases/${databaseId}`, undefined, LEGACY_VERSION);
    const pages = await this.queryAll(`/databases/${databaseId}/query`, LEGACY_VERSION);
    return [{ databaseId, dataSourceId: null, title: name, entity, origin, schema: schemaFrom(legacy.properties), rows: pages.map(toRow) }];
  }

  private async discover(): Promise<{ id: string; databaseId: string; title: string }[]> {
    const found: { id: string; databaseId: string; title: string }[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.request<{
        results: { object: string; id: string; title?: unknown; parent?: { database_id?: string } }[];
        has_more: boolean;
        next_cursor: string | null;
      }>('POST', '/search', { filter: { property: 'object', value: 'data_source' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      for (const r of res.results) {
        if (r.object !== 'data_source') continue;
        found.push({ id: r.id, databaseId: r.parent?.database_id ?? r.id, title: titleOf(r.title) || 'Untitled' });
      }
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return found;
  }

  private async readFacts(): Promise<Fact[]> {
    const facts: Fact[] = [];
    for (const w of notionConfig.watchedPages) {
      try {
        const res = await this.client.request<{ results: { type: string; [k: string]: unknown }[] }>('GET', `/blocks/${w.id}/children?page_size=100`);
        for (const block of res.results) {
          const body = block[block.type] as { rich_text?: unknown } | undefined;
          const text = titleOf(body?.rich_text).trim();
          if (text && w.match.test(text)) {
            facts.push({
              id: `watch-${w.id}`,
              category: w.category as Fact['category'],
              label: w.label,
              text,
              sourceTitle: w.title,
              sourceUrl: `https://www.notion.so/${compactId(w.id)}`,
              capturedAt: this.now().toISOString(),
            });
            break;
          }
        }
      } catch {
        /* page not shared with the integration — reported via the Sources map */
      }
    }
    return facts;
  }

  private async readDocuments(): Promise<DocRef[]> {
    const docs: DocRef[] = [];
    for (const d of notionConfig.documents) {
      try {
        const page = await this.client.request<NotionPage>('GET', `/pages/${d.id}`);
        const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
        docs.push({
          id: d.id,
          title: readText(titleProp) ?? d.title,
          url: page.url ?? `https://www.notion.so/${d.id}`,
          path: null,
          lastEditedAt: page.last_edited_time ?? null,
          kind: d.kind as DocRef['kind'],
        });
      } catch {
        docs.push({ id: d.id, title: d.title, url: `https://www.notion.so/${d.id}`, path: null, lastEditedAt: null, kind: d.kind as DocRef['kind'] });
      }
    }
    return docs;
  }

  async load(): Promise<RawBundle> {
    const capturedAt = this.now().toISOString();
    const errors: string[] = [];
    const dataSources: RawDataSource[] = [];
    const configuredIds = new Set(notionConfig.databases.map((d) => compactId(d.id)));

    for (const db of notionConfig.databases) {
      if (db.entity === 'ignore') continue;
      try {
        dataSources.push(...(await this.loadDatabase(db.id, db.name, db.entity, 'configured')));
      } catch (e) {
        const err = e as NotionApiError;
        // 401 means the token itself is bad: nothing else will work, so fail the sync loudly.
        if (err.status === 401) throw err;
        errors.push(`${db.name}: ${err.status === 404 ? 'not shared with the integration (404)' : err.message}`);
      }
    }

    const unmapped: { id: string; title: string }[] = [];
    if (notionConfig.autoDiscover) {
      try {
        for (const ds of await this.discover()) {
          if (configuredIds.has(compactId(ds.databaseId)) || configuredIds.has(compactId(ds.id))) continue;
          const rule = notionConfig.classifyByTitle.find((r) => r.match.test(ds.title));
          if (!rule) {
            unmapped.push({ id: ds.id, title: ds.title });
            continue;
          }
          const meta = await this.client.request<{ properties: Record<string, NotionPropertySchema> }>('GET', `/data_sources/${ds.id}`);
          const pages = await this.queryAll(`/data_sources/${ds.id}/query`);
          dataSources.push({
            databaseId: ds.databaseId,
            dataSourceId: ds.id,
            title: ds.title,
            entity: rule.entity,
            origin: 'discovered',
            schema: schemaFrom(meta.properties),
            rows: pages.map(toRow),
          });
        }
      } catch (e) {
        errors.push(`Discovery skipped: ${(e as Error).message}`);
      }
    }

    // Resolve parent-row titles within each data source (sub-tasks).
    for (const ds of dataSources) {
      const titles = new Map<string, string>();
      for (const r of ds.rows) {
        const t = readText(Object.values(r.properties).find((p) => p.type === 'title'));
        if (t) titles.set(compactId(r.id), t);
      }
      for (const r of ds.rows) {
        const parent = Object.entries(r.properties).find(([n, p]) => p.type === 'relation' && /parent/i.test(n))?.[1];
        const pid = (parent?.relation as { id: string }[] | undefined)?.[0]?.id;
        if (pid) r.parentTitle = titles.get(compactId(pid)) ?? null;
      }
    }

    const [facts, documents] = await Promise.all([this.readFacts(), this.readDocuments()]);

    return {
      source: {
        kind: 'notion-api',
        label: 'Notion API (integration token)',
        capturedAt,
        coverage: errors.length ? 'partial' : 'full',
        notes: errors.length ? ['Some databases could not be read — see Sources.'] : [],
      },
      dataSources,
      documents,
      facts,
      unmapped,
      errors,
    };
  }
}
