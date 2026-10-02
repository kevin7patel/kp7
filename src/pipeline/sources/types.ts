import type { EntityKind } from '../../../config/notion.config';
import type { DocRef, Fact, SourceInfo, SourceKind } from '../../shared/types';

/** A Notion property value as returned by the API (`{ type, [type]: … }`). */
export interface NotionValue {
  type: string;
  [key: string]: unknown;
}

export interface NotionOption {
  id?: string;
  name: string;
}

export interface NotionPropertySchema {
  name: string;
  type: string;
  status?: { options: NotionOption[]; groups: { name: string; option_ids: string[] }[] };
  select?: { options: NotionOption[] };
  multi_select?: { options: NotionOption[] };
}

export interface RawRow {
  id: string;
  url: string | null;
  createdAt: string | null;
  lastEditedAt: string | null;
  properties: Record<string, NotionValue>;
  /** Title of the parent row/page when known (snapshot paths, or resolved parent relations). */
  parentTitle: string | null;
}

export interface RawDataSource {
  databaseId: string;
  dataSourceId: string | null;
  title: string;
  entity: EntityKind;
  origin: 'configured' | 'discovered';
  schema: Record<string, NotionPropertySchema>;
  rows: RawRow[];
}

/** Everything a source adapter returns. Normalization consumes only this shape. */
export interface RawBundle {
  source: SourceInfo;
  dataSources: RawDataSource[];
  documents: DocRef[];
  facts: Fact[];
  /** Data sources visible to the integration that were not mapped to an entity. */
  unmapped: { id: string; title: string }[];
  errors: string[];
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  load(): Promise<RawBundle>;
}
