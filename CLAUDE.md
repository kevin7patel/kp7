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
  Tokens stay in ignored env files / GitHub secrets, never in chat.

## Data (details: `docs/notion-schema.md`)
- Active task = not Done, List ∉ {Later, Project}, Source ≠ Test. Empty Area = "unclassified", not personal.
- Needs Kevin, Completed date and Project target date are auto-detected when added in Notion.
  Until then: "Waiting" (not "Waiting on you"), no completion history/streaks (never from Last updated).
- Projects = outcome layer; Goals Tracker rows are template examples → excluded.
- America/Chicago day buckets. Preserve date-only values and units.

## Map
Notion mapping `config/notion.config.ts` · behaviour `config/dashboard.config.ts` ·
pipeline `src/pipeline/` · metrics `src/metrics/` (pure, provenance on every value) ·
UI `src/app/views/*` from `src/app/components/*`, tokens `src/app/styles/tokens.css`.
Change→file table, layers, sync, privacy, design system: `docs/architecture.md`. Setup, commands: `README.md`.

## Workflow
`git status`, read only what the change needs. Smallest coherent edit; keep adapters, types, metrics,
UI separate; add metric/adapter tests with invented fixtures. Verify with `npm run verify`; for visible
changes build, `npx vite preview --port 4173`, run `npm run screenshots` (+ `-- --demo`) and
`npm run states`, then look at the images in `.artifacts/` (desktop + phone, light + dark). Report what
was verified; update the doc when architecture, schema, commands or decisions change.
