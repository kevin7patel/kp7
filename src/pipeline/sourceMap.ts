/**
 * Builds the "what exists in Notion" map shown on the Sources screen:
 * each requested category → connected / partial / template / missing, with sources.
 */
import { notionConfig } from '../../config/notion.config';
import type { Category, Entities, Fact, FieldSource, SourceInfo, SourceMapEntry } from '../shared/types';
import type { RawBundle } from './sources/types';

const nUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`;

export function buildSourceMap(bundle: RawBundle, entities: Entities, taskFields: Record<string, FieldSource>, facts: Fact[]): SourceMapEntry[] {
  const src: SourceInfo = bundle.source;
  const ds = (entity: string) => bundle.dataSources.filter((d) => d.entity === entity);
  const asSources = (entity: string, note: string) => ds(entity).map((d) => ({ title: d.title, url: nUrl(d.databaseId), note }));
  const fact = (cat: Category) => facts.find((f) => f.category === cat);
  const meta = src.coverage === 'metadata-only';
  const out: SourceMapEntry[] = [];

  const taskNote = meta
    ? `${entities.tasks.length} task rows (incl. sub-tasks) readable as titles only; status, due date, priority and owner need the API token.`
    : `Status ${taskFields.status}, due ${taskFields.due}, priority ${taskFields.priority}, owner ${taskFields.owner}.`;
  out.push({
    category: 'tasks',
    status: entities.tasks.length === 0 ? 'missing' : meta || taskFields.status === 'unavailable' ? 'partial' : 'connected',
    sources: asSources('task', `${entities.tasks.length} rows`),
    note: taskNote,
  });

  out.push({
    category: 'projects',
    status: entities.projects.length === 0 ? 'missing' : meta ? 'partial' : 'connected',
    sources: asSources('project', `${entities.projects.length} rows`),
    note: meta ? 'Project titles only.' : 'Projects with status.',
  });

  const personalGoals = entities.goals.filter((g) => !g.isTemplate);
  out.push({
    category: 'goals',
    status: entities.goals.length === 0 ? 'missing' : personalGoals.length === 0 ? 'template' : 'connected',
    sources: asSources('goal', `${entities.goals.length} rows, ${entities.goals.length - personalGoals.length} template samples`),
    note:
      personalGoals.length === 0
        ? 'Goals Tracker holds only Notion template sample rows (e.g. "Increase sales by 20%"). They are not shown as your goals. Add personal goals there (Start / End values + Due) and they appear automatically.'
        : `${personalGoals.length} personal goals.`,
  });

  const logs = ds('dailyLog');
  out.push({
    category: 'habits',
    status: entities.dailyLogs.length ? 'connected' : 'missing',
    sources: logs.length ? asSources('dailyLog', `${entities.dailyLogs.length} days`) : [{ title: 'Build a Better Me', url: nUrl('3ed38b587685817cbbb1d66caef90823'), note: 'Defines 9 AM / 10 PM check-ins as page text' }],
    note: entities.dailyLogs.length
      ? 'Checkbox columns become habits; check-ins drive streaks and the heatmap.'
      : 'No Daily Log database yet. Journal/check-ins live as page text and cannot be charted. A Daily Log DB (one row per day, checkbox per habit) is picked up automatically.',
  });
  out.push({
    category: 'routines',
    status: entities.dailyLogs.length ? 'connected' : 'missing',
    sources: [],
    note: 'Daily routines are read from the same Daily Log database.',
  });

  for (const [cat, entity, count, label] of [
    ['workouts', 'workout', entities.workouts.length, 'workout'],
    ['nutrition', 'nutrition', entities.nutrition.length, 'nutrition'],
    ['health', 'health', entities.health.length, 'body / health'],
  ] as const) {
    const f = fact(cat === 'workouts' ? 'fitness' : cat);
    out.push({
      category: cat,
      status: count ? 'connected' : 'missing',
      sources: count ? asSources(entity, `${count} records`) : f ? [{ title: f.sourceTitle, url: f.sourceUrl, note: f.text }] : [],
      note: count ? `${count} ${label} records.` : `No ${label} database found. A database whose title matches ${String(notionConfig.classifyByTitle.find((r) => r.entity === entity)?.match)} is picked up automatically.`,
    });
  }

  out.push({
    category: 'fitness',
    status: entities.workouts.length ? 'connected' : 'missing',
    sources: fact('fitness') ? [{ title: fact('fitness')!.sourceTitle, url: fact('fitness')!.sourceUrl, note: 'Program page' }] : [],
    note: fact('fitness')?.text ?? 'No fitness program data.',
  });
  out.push({ category: 'body', status: entities.health.some((h) => /weight|body_fat|waist/.test(h.metric)) ? 'connected' : 'missing', sources: [], note: 'Weight / body composition come from the health database.' });
  out.push({
    category: 'sleep',
    status: entities.health.some((h) => /sleep|hrv|recovery|resting_hr/.test(h.metric)) ? 'connected' : 'missing',
    sources: [],
    note: fact('health')?.text ?? 'Sleep and recovery come from the health database or a wearable export.',
  });
  out.push({ category: 'development', status: 'missing', sources: [], note: 'No personal-development database found.' });
  out.push({ category: 'milestones', status: 'missing', sources: [], note: 'No milestone records found; goal due dates will populate the timeline once goals exist.' });
  out.push({
    category: 'automations',
    status: entities.automations.length ? 'connected' : 'missing',
    sources: [{ title: 'AI Execution Team — Connection & Handoffs', url: nUrl('3ec38b5876858182a056f0b7e2de2aa7'), note: 'Agent roster and handoffs (page text)' }],
    note: entities.automations.length ? 'Automation registry connected.' : 'No Automation Registry database yet (proposed in the research handoff).',
  });
  out.push({
    category: 'finance',
    status: 'partial',
    sources: [{ title: 'Credit Card Benefits Tracker', url: nUrl('8f041be0615e4cec82c49eccff7ab5d0'), note: 'Mapped; intentionally not on the personal dashboard in v1' }],
    note: 'Finance data exists but is out of scope for v1.',
  });
  out.push({
    category: 'travel',
    status: 'partial',
    sources: [{ title: 'Travel Packing List', url: nUrl('b5738b587685826e8419810af519df60'), note: 'Reference list' }],
    note: 'Trip-related tasks appear under the Travel area.',
  });
  out.push({
    category: 'notes',
    status: entities.documents.length ? 'connected' : 'missing',
    sources: entities.documents.map((d) => ({ title: d.title, url: d.url, note: d.kind })),
    note: 'Hub pages linked for quick access.',
  });

  return out;
}
