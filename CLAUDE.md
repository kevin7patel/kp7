# Command Center — Kevin's personal dashboard

Read-only view of Notion (other agents update it). Never write to Notion.

## Rules
- Never invent records or blur real/demo/derived/missing data. Unknown ≠ zero.
- Glanceable UI: hierarchy, concise cards, reusable components. Desktop/mobile and light/dark equal.
- Health: values + units + provenance only. No diagnosis, scores or medical interpretation.
- Anything paid (services, subscriptions, infra) needs Kevin's explicit approval.

## Privacy (public repo)
- Never commit Notion content (titles, names, health values, keys, tokens) anywhere: code, tests,
  fixtures, docs, screenshots, commits. Schema facts and non-secret IDs are fine.
- Real data only in gitignored `.data/`; QA output in gitignored `.artifacts/`. Fixtures are invented.
  Tokens stay in ignored env files / GitHub secrets, never in chat. Hosted data is AES-256-GCM ciphertext.

## Data (details: `docs/notion-schema.md`)
- Active task = not Done, List ∉ {Later, Project}, Source ≠ Test. Empty Area = "unclassified", not personal.
- No completion-date property → no completion history, streaks or "done today" (never from Last updated).
- "Waiting on you" needs an explicit needs-Kevin signal; else "Waiting".
- Projects = V1 outcome layer; Goals Tracker rows are examples → excluded.
- America/Chicago day buckets. Preserve date-only values and units.

## Map
Notion mapping `config/notion.config.ts` · behaviour `config/dashboard.config.ts` ·
pipeline `src/pipeline/` · metrics `src/metrics/` (pure, provenance on every value) ·
UI `src/app/views/*` from `src/app/components/*`, tokens `src/app/styles/tokens.css`.
Change→file table: `docs/iterating.md`. Architecture/setup: `docs/architecture.md`, `docs/setup.md`.

## Workflow
`git status`, read only what the change needs. Use skills `dashboard-ui`, `notion-integration`,
`visual-qa` on demand. Smallest coherent edit; keep adapters, types, metrics, UI separate; add
metric/adapter tests. Verify with `npm run verify`; for visible changes preview on :4173 and run
`npm run screenshots` (+ `-- --demo`) and `npm run states`, then look at the images. Report what was
verified; update docs when architecture, schema, commands or decisions change.
