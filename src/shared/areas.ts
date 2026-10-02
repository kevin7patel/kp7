import { dashboardConfig, type AreaRule } from '../../config/dashboard.config';

const rules: AreaRule[] = dashboardConfig.areas;

/** Keyword-rule area for a title (and optional parent title). Always returns an area id. */
export function classifyArea(title: string, parentTitle?: string | null): string {
  const keywordRules = rules.filter((r) => r.id !== 'personal' && r.id !== 'unclassified');
  const own = keywordRules.find((r) => r.match.test(title));
  if (own) return own.id;
  const viaParent = parentTitle ? keywordRules.find((r) => r.match.test(parentTitle)) : undefined;
  return viaParent?.id ?? 'unclassified';
}

/** Map a Notion area value (e.g. "Tru by Hilton") onto a configured area, or keep it verbatim. */
export function areaFromNotion(value: string): string {
  const v = value.trim();
  const exact = rules.find((r) => r.label.toLowerCase() === v.toLowerCase());
  if (exact) return exact.id;
  const hit = rules.find((r) => r.id !== 'unclassified' && r.match.test(v));
  return hit?.id ?? v;
}

export function areaLabel(id: string): string {
  return rules.find((r) => r.id === id)?.label ?? id;
}

export function areaGroup(id: string): 'hotels' | 'personal' | 'unclassified' {
  return rules.find((r) => r.id === id)?.group ?? 'unclassified';
}
