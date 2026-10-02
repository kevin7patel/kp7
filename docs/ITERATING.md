# Iterating with Claude

Most requests are a config edit or a component move. Ask in plain language; this table is
where each kind of change lands.

| Request | Change |
|---|---|
| “Add this Notion property” | `config/notion.config.ts` → `fields.<entity>`: add a logical field, or pin `{ types: ['number'], property: 'Exact Name' }`. Read it in `src/pipeline/normalize.ts`. |
| “Track a new database” | Name it so `classifyByTitle` matches (Daily Log, Workouts, Nutrition, Body Metrics…) — it's discovered automatically. Or add it to `databases` with an `entity`. |
| “Add another health metric” | Nothing — every number column in a health/body database becomes a card. Name/unit mapping: `healthMetrics`. |
| “Set my protein / calorie / workout targets” | `config/dashboard.config.ts` → `targets`. Rings switch from value-only to target-vs-actual. |
| “Change how goals are calculated” | `src/metrics/goals.ts` (progress = Notion progress, else (current − start) ÷ (target − start)). |
| “Move / remove / combine sections” | The view files in `src/app/views/` are flat lists of cards on a 12-column grid (`span-3` … `span-12`). |
| “Make this metric larger” | Swap `StatTile` for a hero ring/number, or change its `span-*` class. |
| “Change this visualization” | `src/app/components/charts.tsx` (Ring, Sparkline, Columns, Heatmap, DotStrip, Meter, HBars). |
| “Make mobile simpler” | Mobile rules live in the `@media (max-width: 760px)` blocks in `src/app/styles/app.css`; `m-half`, `m-first`, `desktop-only` classes control per-card behaviour. |
| “Treat status X as waiting/blocked” | `notionConfig.statusRules` / `waitingOnKevin`. |
| “Area classification is wrong” | Best: add an **Area** select to the Tasks database (used verbatim). Fallback: keyword rules in `dashboardConfig.areas`. |

## Workflow for a change
```bash
npm run verify          # lint + typecheck + tests + build
npm run sync -- --source=snapshot   # or with NOTION_TOKEN for live data
npm run build && npx vite preview --port 4173 &
npm run screenshots     # light/dark × MacBook/iPad/iPhone, fails on overflow or console errors
npm run screenshots -- --demo       # every chart with synthetic data
```

## Refreshing the snapshot without a token
In a Claude session with the Notion connector, ask Claude to re-capture
`.data/raw/notion-mcp-snapshot.json` and run `npm run sync -- --source=snapshot`. The file is
gitignored and must never be committed.
