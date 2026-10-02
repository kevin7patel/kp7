/**
 * Dashboard behaviour that Kevin and Claude tune while iterating.
 * Nothing here contains personal data — this file is committed to a public repo.
 */

export interface AreaRule {
  id: string;
  label: string;
  /** Filter group used by the All / Hotels / Personal switch. */
  group: 'hotels' | 'personal' | 'unclassified';
  /** Keyword rule applied to titles when Notion has no Area/Property field. First match wins. */
  match: RegExp;
}

export const dashboardConfig = {
  owner: 'Kevin',
  /** Pipeline timezone (the browser uses the device timezone for "today"). */
  timezone: (typeof process !== 'undefined' && process.env?.DASHBOARD_TIMEZONE) || 'America/Chicago',

  /** Public GitHub repo that hosts the app and runs the scheduled sync. */
  github: { owner: 'kevin7patel', repo: 'kp7', syncWorkflow: 'sync.yml', ref: 'main' },

  freshness: {
    /** Scheduled reconciliation runs every 30 minutes; flag as stale after this. */
    staleAfterMinutes: 90,
    veryStaleAfterMinutes: 24 * 60,
  },

  refresh: {
    /** Re-fetch data when the app regains focus and the last fetch is older than this. */
    onFocusAfterMinutes: 2,
    /** Background re-fetch while the app stays open. */
    whileOpenEveryMinutes: 15,
  },

  /** Time-of-day buckets for Today (R3 pattern: Overdue / Today / Afternoon / Tonight). */
  timeBuckets: { afternoonFromHour: 12, tonightFromHour: 17 },

  /**
   * Area rules: keyword heuristics, labelled "derived" in the UI.
   * They are only used when the Notion database has no Area / Property select.
   */
  areas: [
    { id: 'legal', label: 'Legal', group: 'personal', match: /\bcourt\b|legal|attorney|lawyer|city hall/i },
    { id: 'staybridge', label: 'Staybridge', group: 'hotels', match: /staybridge/i },
    { id: 'tru', label: 'Tru', group: 'hotels', match: /\btru\b|room \d{3}|fire panel|dumpster|sysco/i },
    { id: 'travel', label: 'Travel', group: 'personal', match: /travel|packing|trip\b|flights?\b|itinerary|passport|rental car/i },
    { id: 'health', label: 'Health', group: 'personal', match: /doctor|dentist|medicine|pharmacy|\bgym\b|fitness|workout|nutrition/i },
    { id: 'finance', label: 'Finance', group: 'personal', match: /cards?\b|checks\b|billing|\bbill\b|refund|dispute|insur|subscription|bank|\btax/i },
    { id: 'hotel', label: 'Hotel ops', group: 'hotels', match: /hilton|hotel|\bstr\b|servsafe|lightstay|guest|chargeback|rfp|dbpr|merchant|sales lead|\bpool\b|breakfast|uniform|roofing|time-?clock/i },
    // Explicit Notion value "Personal" maps here; keyword rules never default to it.
    { id: 'personal', label: 'Personal', group: 'personal', match: /^personal$/i },
    // No signal → unclassified (not personal). Shown under "All" only.
    { id: 'unclassified', label: 'Unclassified', group: 'unclassified', match: /[\s\S]*/ },
  ] satisfies AreaRule[],

  /**
   * Personal targets. Deliberately empty: targets must come from Kevin or Notion,
   * never invented. Set a number to enable target-vs-actual rings.
   */
  targets: {
    caloriesKcal: null as number | null,
    proteinG: null as number | null,
    waterMl: null as number | null,
    workoutsPerWeek: null as number | null,
  },

  /** Daily check-in habits (Build a Better Me sets 9 AM and 10 PM prompts). */
  checkins: [
    { id: 'morning', label: 'Morning check-in', match: /morning|check-?in|9 ?am/i },
    { id: 'evening', label: 'Evening journal', match: /evening|journal|10 ?pm/i },
  ],

  /** Heatmap / trend windows. */
  windows: { heatmapWeeks: 12, trendDays: 28, healthDays: 30 },
};

export type DashboardConfig = typeof dashboardConfig;
