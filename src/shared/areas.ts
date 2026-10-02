import { dashboardConfig, type AreaRule } from '../../config/dashboard.config';

const rules: AreaRule[] = dashboardConfig.areas;

/** Keyword-rule area for a title (and optional parent title). Always returns an area id. */
export function classifyArea(title: string, parentTitle?: string | null): string {
  const text = parentTitle ? `${title} ${parentTitle}` : title;
  const own = rules.find((r) => r.id !== 'personal' && r.match.test(title));
  if (own) return own.id;
  return (rules.find((r) => r.match.test(text)) ?? rules[rules.length - 1]!).id;
}

/** Map a Notion area value (e.g. "Tru by Hilton") onto a configured area, or keep it verbatim. */
export function areaFromNotion(value: string): string {
  const hit = rules.find((r) => r.id !== 'personal' && (r.label.toLowerCase() === value.toLowerCase() || r.match.test(value)));
  return hit?.id ?? value;
}

export function areaLabel(id: string): string {
  return rules.find((r) => r.id === id)?.label ?? id;
}

export function areaGroup(id: string): 'hotels' | 'personal' {
  return rules.find((r) => r.id === id)?.group ?? 'personal';
}
