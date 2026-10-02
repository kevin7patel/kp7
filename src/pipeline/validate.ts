/**
 * VALIDATE: structural checks on the raw bundle before normalization.
 * Bad rows are dropped with a warning instead of failing the whole sync.
 */
import type { RawBundle } from './sources/types';

export interface ValidateResult {
  bundle: RawBundle;
  warnings: string[];
  dropped: number;
}

export function validate(bundle: RawBundle): ValidateResult {
  const warnings: string[] = [...bundle.errors];
  let dropped = 0;

  if (!bundle.source?.capturedAt || Number.isNaN(Date.parse(bundle.source.capturedAt))) {
    throw new Error('Source bundle has no valid capturedAt timestamp');
  }

  const dataSources = bundle.dataSources.map((ds) => {
    const seen = new Set<string>();
    const rows = ds.rows.filter((row) => {
      if (!row.id) {
        dropped++;
        return false;
      }
      const key = row.id.replace(/-/g, '');
      if (seen.has(key)) {
        dropped++;
        warnings.push(`${ds.title}: duplicate row ${row.id} dropped`);
        return false;
      }
      seen.add(key);
      if (!row.properties || typeof row.properties !== 'object') {
        dropped++;
        warnings.push(`${ds.title}: row ${row.id} has no properties — dropped`);
        return false;
      }
      return true;
    });
    if (!Object.values(ds.schema).some((p) => p.type === 'title')) {
      warnings.push(`${ds.title}: schema has no title property`);
    }
    return { ...ds, rows };
  });

  return { bundle: { ...bundle, dataSources }, warnings, dropped };
}
