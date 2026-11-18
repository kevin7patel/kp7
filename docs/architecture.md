# Architecture

```
Notion ──► Source adapter ──► VALIDATE ──► NORMALIZE ──► CALCULATE ──► UPDATE ──► VERIFY
 (read-only)  src/pipeline/       validate.ts   normalize.ts   src/metrics/   run.ts     verify.ts + read-back
              sources/*.ts                       (config-driven)                (encrypt)
                                                                                    │
                        GitHub Pages (static, public)  ◄── data/dashboard.enc.json ─┘
                                   │
                        PWA (React) ── decrypt on device ── computeDashboard(payload, now) ── views
```

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Source adapters | `src/pipeline/sources/` | `NotionApiSource` (production; data-source API 2025-09-03 with 2022-06-28 fallback, pagination, 429 retry) and `McpSnapshotSource` (point-in-time snapshot captured by Claude through the Notion connector: v2 structured saved-view rows, or v1 titles only). Both emit the same `RawBundle`. The UI never sees raw Notion JSON. |
| Mapping config | `config/notion.config.ts` | The only place that knows database IDs and property names. Logical fields resolve by type + name patterns, or an exact pin. |
| Normalized model | `src/shared/types.ts` | `Task`, `Project`, `Goal`, `DailyLog`, `Workout`, `NutritionEntry`, `HealthSample`, `Automation`, `DocRef`, `Fact`, plus `DashboardPayload`. |
| Metric layer | `src/metrics/` | Pure functions `(payload, now, tz) → DashboardModel`. Runs in the browser (so "today" is always current) and in the pipeline's CALCULATE/VERIFY stages. Each `MetricValue` carries `source`, `calculation`, `period`, `unit`, `lastUpdated`, `quality`. |
| Dashboard state | `src/app/data/useDashboard.ts` | Loads plain (local) or encrypted (hosted) payloads, refreshes on focus/interval/reconnect, "Sync now", freshness state. |
| Views | `src/app/views/` | Today, Tasks, Progress, Body (Fitness/Nutrition/Health), Goals, Sources, Settings. Reusable components in `src/app/components/`. |

## Data integrity
Task scope, Goals Tracker exclusion and the no-completion-date rule: `CLAUDE.md`, `docs/notion-schema.md`.

- **Quality on every metric**: `real` (direct Notion value), `derived` (calculated from Notion records),
  `demo` (synthetic), `missing` (with a reason). Shown as a chip; click/tap for source, calculation,
  period, unit and last-updated time.
- Missing data renders as **“—” with a reason**, never as zero.
- Demo data is generated on-device, is never written to a payload, and forces a striped banner + Demo chips.
- Health values are shown as recorded with neutral deltas.

## Sync strategy
| Concern | Mechanism |
|---|---|
| **SYNC data** | `sync.yml`: GitHub Actions cron every 30 min + manual dispatch + `repository_dispatch: notion-change` (hook for a future webhook relay). |
| **RECALCULATE** | Metrics are recomputed from normalized entities in the browser on every load and every minute (for date rollover). |
| **RENDER** | React re-renders only from the recomputed model; the payload is re-fetched on open, on focus (>2 min), every 15 min while open, and on reconnect. |
| **REDESIGN** | `deploy.yml` rebuilds the app only when code changes on `main`. Data syncs never rebuild the app. Both invoke `pages.yml` to deploy the current encrypted `gh-pages` tree explicitly. GitHub Pages source must be GitHub Actions. |
| Change detection | HMAC (keyed with the dashboard key) of entities + facts + map; unchanged Notion content produces no commit. The sync also compares the live site's `data/content.hmac` with the branch and redeploys when the site lags (e.g. after a cancelled deploy). |
| Queues | Branch pushes share the job-level `gh-pages-branch` queue; Pages deploys use `pages-deploy` with cancel-in-progress, so a deploy stuck waiting on the `github-pages` environment is replaced by the next one and never blocks syncs. |
| Schedule reality | GitHub runs `*/30` crons late on quiet repos (observed ~6 h apart). The app reads freshness from the latest finished, non-cancelled run and says so in the Stale banner. |
| Event-driven | Not available in the current environment: Notion webhooks need a public HTTPS receiver, and this setup has no server. The `notion-change` dispatch trigger is ready for a relay (e.g. a free Cloudflare Worker) if wanted later. |

## Privacy model (public repository)
- Personal data never enters git: `.data/` and `public/data/` are gitignored; CI asserts `dist/data` does not exist.
- Published payload is AES-256-GCM encrypted with a 32-byte key held in a GitHub secret and in Kevin's browsers.
- The key arrives via a URL fragment (`#k=`), which browsers never send to servers.
- Workflow logs contain stage names and counts, never Notion content. Errors are reduced to codes.
- The integration needs **Read content** only; the code issues only GET and query/search POSTs (asserted in tests).
- Missing GitHub secrets fail configuration instead of producing a successful run that skipped the sync.
- Keys are generated on-device, masked by default and reused; the Notion token is entered only in GitHub.

## Freshness states (sync pill + banner)
`live` · `snapshot` (Claude-captured, not live; structured or titles-only) · `stale` (no successful sync in 90 min) · `error`
(latest scheduled run failed; last good data shown) · `offline` (cached data) · `locked` (key needed) · `demo`.

## Design system
"Performance lab" look (v2): semantic tokens in `src/app/styles/tokens.css`, presentation layer in
`src/app/styles/perf.css` (loaded after `app.css`). Dark is the hero mode (near-black canvas,
graphite cards with a faint sheen, luminous rings, bold tabular numerals, small-caps labels);
light is designed separately (cool, crisp paper). Today opens with the **Day Pulse** hero:
a Top 3 ring (picks done ÷ picks set in Notion), a data-derived coach line, and four big stats
(overdue, due today, waiting, blockers/top priority). No composite or invented scores.
Data hues per domain — tasks blue, fitness orange, nutrition aqua, goals amber, habits magenta,
health violet — validated with the dataviz palette checker against each mode's card surface:
light `#ffffff` ALL PASS, dark `#12161b` ALL PASS. Text tokens meet WCAG AA (hint text ≥ 4.9:1).
Status colours (critical/warning/serious/good) are reserved for state and always paired with an icon + label.

## Where each change lives

| Request | Change |
|---|---|
| Add a Notion property | `config/notion.config.ts` → `fields.<entity>`: add a logical field, or pin `{ types: ['number'], property: 'Exact Name' }`. Read it in `src/pipeline/normalize.ts`. |
| Track a new database | Name it so `classifyByTitle` matches (Daily Log, Workouts, Nutrition, Body Metrics…) and it is discovered; or add it to `databases` with an `entity`. |
| Another health metric | Nothing: every number column in a health/body database becomes a card. Names/units: `healthMetrics`. |
| Protein / calorie / workout targets | `config/dashboard.config.ts` → `targets`. Rings switch to target-vs-actual. |
| Goal calculation | `src/metrics/goals.ts` (Notion progress, else (current − start) ÷ (target − start)). |
| Project details | `projectList` / `projectMetrics` in `src/metrics/goals.ts`; row is `ProjectRow` in `src/app/components/ui.tsx`. |
| What counts as active / test / deferred | `notionConfig.taskScope` (`deferredLists`, `excludeSourceValues`). |
| Waiting / blocked rules | `notionConfig.statusRules` / `waitingOnKevin`. |
| Area classification | Explicit Notion **Area** values are kept verbatim as label and grouped by `dashboardConfig.explicitAreaGroup` (hotels); hotel names never enter the repo. Keyword fallback rules: `dashboardConfig.areas`. |
| Move / remove / resize cards | `src/app/views/*` are flat card lists on a 12-column grid (`span-3` … `span-12`). Swap `StatTile` for a hero ring/number to enlarge. |
| Visualization | `src/app/components/charts.tsx` (Ring, Sparkline, Columns, Heatmap, DotStrip, Meter, HBars). |
| Mobile layout | `@media (max-width: 760px)` blocks in `src/app/styles/app.css`; `m-half`, `m-first`, `desktop-only` per card. |
| Refresh the snapshot without a token | In a Claude session with the Notion connector, re-capture `.data/raw/notion-mcp-snapshot.json` (gitignored), then `npm run sync -- --source=snapshot`. |
