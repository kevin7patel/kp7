/**
 * Pure helpers that read Notion property values into plain JS values, plus the
 * schema-driven field resolver. Isolated so schema changes stay local.
 */
import type { FieldSpec } from '../../../config/notion.config';
import type { NotionPropertySchema, NotionValue } from './types';

type RichText = { plain_text?: string }[];

function rich(v: unknown): string {
  return Array.isArray(v) ? (v as RichText).map((t) => t.plain_text ?? '').join('') : '';
}

export function readText(p: NotionValue | undefined): string | null {
  if (!p) return null;
  switch (p.type) {
    case 'title':
    case 'rich_text': {
      const s = rich(p[p.type]).trim();
      return s || null;
    }
    case 'select':
    case 'status':
      return ((p[p.type] as { name?: string } | null)?.name ?? null) || null;
    case 'multi_select': {
      const names = ((p.multi_select as { name: string }[] | null) ?? []).map((o) => o.name);
      return names.length ? names.join(', ') : null;
    }
    case 'people': {
      const names = ((p.people as { name?: string }[] | null) ?? []).map((u) => u.name ?? '').filter(Boolean);
      return names.length ? names.join(', ') : null;
    }
    case 'url':
    case 'email':
    case 'phone_number':
      return (p[p.type] as string | null) ?? null;
    case 'formula': {
      const f = p.formula as { type: string; string?: string | null; number?: number | null } | null;
      if (!f) return null;
      if (f.type === 'string') return f.string ?? null;
      if (f.type === 'number' && f.number != null) return String(f.number);
      return null;
    }
    case 'unique_id': {
      const u = p.unique_id as { prefix?: string | null; number?: number | null } | null;
      return u?.number != null ? `${u.prefix ? `${u.prefix}-` : ''}${u.number}` : null;
    }
    default:
      return null;
  }
}

export function readNumber(p: NotionValue | undefined): number | null {
  if (!p) return null;
  let n: unknown = null;
  if (p.type === 'number') n = p.number;
  else if (p.type === 'formula') {
    const f = p.formula as { type: string; number?: number | null } | null;
    n = f?.type === 'number' ? f.number : null;
  } else if (p.type === 'rollup') {
    const r = p.rollup as { type: string; number?: number | null; array?: NotionValue[] } | null;
    if (r?.type === 'number') n = r.number;
    else if (r?.type === 'array' && r.array?.length === 1) return readNumber(r.array[0]);
  }
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function readBool(p: NotionValue | undefined): boolean | null {
  if (!p) return null;
  if (p.type === 'checkbox') return p.checkbox === true;
  if (p.type === 'formula') {
    const f = p.formula as { type: string; boolean?: boolean | null } | null;
    return f?.type === 'boolean' ? (f.boolean ?? null) : null;
  }
  return null;
}

export interface DateValue {
  start: string;
  end: string | null;
  hasTime: boolean;
}

type RawDate = { start?: string | null; end?: string | null } | null;

export function readDate(p: NotionValue | undefined): DateValue | null {
  if (!p) return null;
  let d: RawDate = null;
  if (p.type === 'date') d = p.date as RawDate;
  else if (p.type === 'formula') {
    const f = p.formula as { type: string; date?: RawDate } | null;
    d = f?.type === 'date' ? (f.date ?? null) : null;
  } else if (p.type === 'rollup') {
    const r = p.rollup as { type: string; date?: RawDate } | null;
    d = r?.type === 'date' ? (r.date ?? null) : null;
  } else if (p.type === 'created_time' || p.type === 'last_edited_time') {
    const s = p[p.type] as string | null;
    return s ? { start: s, end: null, hasTime: true } : null;
  }
  if (!d?.start) return null;
  return { start: d.start, end: d.end ?? null, hasTime: d.start.length > 10 };
}

export function readRelationIds(p: NotionValue | undefined): string[] {
  if (!p || p.type !== 'relation') return [];
  return ((p.relation as { id: string }[] | null) ?? []).map((r) => r.id);
}

export function readNames(p: NotionValue | undefined): string[] {
  if (!p) return [];
  if (p.type === 'multi_select') return ((p.multi_select as { name: string }[] | null) ?? []).map((o) => o.name);
  const t = readText(p);
  return t ? [t] : [];
}

/**
 * Resolve a logical field to a concrete property name using its spec.
 * Order: pinned property → first (type, name-pattern) match in pattern order → (title only) type match.
 */
export function resolveField(schema: Record<string, NotionPropertySchema>, spec: FieldSpec): string | null {
  const props = Object.values(schema);
  if (spec.property) return schema[spec.property] ? spec.property : null;
  if (!spec.names?.length) {
    for (const t of spec.types) {
      const hit = props.find((p) => p.type === t);
      if (hit) return hit.name;
    }
    return null;
  }
  for (const pattern of spec.names) {
    for (const t of spec.types) {
      const hit = props.find((p) => p.type === t && pattern.test(p.name));
      if (hit) return hit.name;
    }
  }
  return null;
}

export function resolveFields(
  schema: Record<string, NotionPropertySchema>,
  specs: Record<string, FieldSpec>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const [field, spec] of Object.entries(specs)) {
    // Avoid assigning one property to two logical fields (e.g. "Due" as both due and completedAt).
    const filtered = Object.fromEntries(Object.entries(schema).filter(([name]) => !used.has(name) || spec.types.includes('title')));
    const name = resolveField(filtered, spec);
    out[field] = name;
    if (name) used.add(name);
  }
  return out;
}

/** Map a status option name to its Notion status group name ("To-do" / "In progress" / "Complete"). */
export function statusGroupName(schema: NotionPropertySchema | undefined, option: string | null): string | null {
  if (!schema?.status || !option) return null;
  const opt = schema.status.options.find((o) => o.name === option);
  if (!opt?.id) return null;
  return schema.status.groups.find((g) => g.option_ids.includes(opt.id!))?.name ?? null;
}
