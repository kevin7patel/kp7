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

## Relationship to the setup bundle
The setup bundle recommended Next.js with server routes as a baseline for an empty repository.
This repo was already implemented as a static PWA plus a GitHub Actions pipeline, because the
brief requires iPhone and MacBook access, a 30-minute sync and no paid services, and there is no
always-on server. The bundle's principles are kept: separate adapters, normalized types, pure
metrics and UI; metric contracts with source, scope, unit, window and missing-data policy;
required sources with last-good preservation; synthetic fixtures; nothing private in git.

## Scope and source rules
- Required sources (Tasks, Projects) must load or the run fails; the last good payload stays
  live and the failure reaches the UI as an error state. Optional sources fail independently.
- Full pagination; rows are deduplicated by page ID; `Source = Test` rows are excluded and the
  row-preservation invariant accounts for them.
- Active tasks exclude Done and the deferred lists (Later, Project), which are counted separately.
  An empty Area is "unclassified"; keyword heuristics apply only when no Area property exists.
- No dated history is derived from `Last updated`: without a completion-date property, completion
  metrics are `missing` with a reason.

## Data integrity rules
- **Quality on every metric**: `real` (direct Notion value), `derived` (calculated from Notion records),
  `demo` (synthetic), `missing` (with a reason). Shown as a chip; click/tap for source, calculation,
  period, unit and last-updated time.
- Missing data renders as **“—” with a reason**, never as zero.
- Demo data is generated on-device, is never written to a payload, and forces a striped banner + Demo chips.
- Notion template sample rows (Goals Tracker) are detected and excluded from goals.
- Health values are shown as recorded with neutral deltas. No scores, no medical interpretation.

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
The bundle's rule is "do not deploy personal data publicly". The hosted copy is ciphertext only;
plaintext exists solely in gitignored `.data/` and in the browser after the key unlocks it.
Kevin can choose a stricter option instead (see the final report): local-only use, or a private
repository (GitHub Pages on private repos needs a paid plan, so it requires his approval).

- Personal data never enters git: `.data/` and `public/data/` are gitignored; CI asserts `dist/data` does not exist.
- Published payload is AES-256-GCM encrypted with a 32-byte key held in a GitHub secret and in Kevin's browsers.
- The key arrives via a URL fragment (`#k=`), which browsers never send to servers.
- Workflow logs contain stage names and counts, never Notion content. Errors are reduced to codes.
- The integration needs **Read content** only; the code issues only GET and query/search POSTs (asserted in tests).
- Missing GitHub secrets fail configuration instead of producing a successful run that skipped the sync.
- Settings guides setup with direct account/database links. Keys are generated on-device, masked by default,
  and reused when present; the Notion token is entered only in GitHub.

## Freshness states (sync pill + banner)
`live` · `snapshot` (Claude-captured, not live; structured or titles-only) · `stale` (no successful sync in 90 min) · `error`
(latest scheduled run failed; last good data shown) · `offline` (cached data) · `locked` (key needed) · `demo`.

## Design system
Semantic tokens in `src/app/styles/tokens.css`; light (warm paper, soft elevation) and dark
(graphite, hairline highlights, luminous rings) are designed separately. Data hues per domain —
tasks blue, fitness orange, nutrition aqua, goals yellow, habits magenta, health violet —
validated with the dataviz palette checker against the actual card surfaces:
light `#ffffff` PASS (contrast WARN → every mark has a visible text label), dark `#141517` PASS.
Status colours (critical/warning/serious/good) are reserved for state and always paired with an icon + label.
