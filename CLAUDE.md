# Command Center — Kevin's personal performance dashboard

Notion is the source of truth (other agents keep it updated); this app only reads it.

## Product rules
- Never invent records or blur real, demo, derived, missing or partial data. Unknown is not zero.
- Glanceability and UI quality first: clear hierarchy, concise cards, useful charts, reusable
  components. Desktop/mobile and light/dark are equally important.
- Health: values with units and provenance only — no diagnosis, readiness scores or medical interpretation.
- Paid services, purchases, subscriptions and paid infrastructure need Kevin's explicit approval.
- Never write to Notion. The integration is read-only by design.

## Privacy (public repo)
- Never commit Notion content: no task/project titles, names, health values, keys or tokens —
  not in code, tests, fixtures, docs, screenshots or commit messages. Database-level schema facts
  and non-secret IDs are fine.
- Real data lives only in gitignored `.data/`; QA artifacts in gitignored `.artifacts/`.
  Test fixtures are invented. Tokens stay in ignored env files or GitHub secrets — never in chat.
- Hosted data is AES-256-GCM ciphertext only; the key never leaves Kevin's devices/secrets.

## Data rules (see `docs/notion-schema.md`)
- Tasks: active = not Done and List not Later/Project; Source=Test excluded; empty Area is
  "unclassified", never personal. No completion-date property → no dated completion metrics,
  streaks or "done today" (never derive history from Last updated). "Waiting on you" only with an
  explicit needs-Kevin signal; otherwise "Waiting".
- Projects are the V1 outcome layer. Goals Tracker rows are unconfirmed examples → excluded.
- America/Chicago day buckets unless Kevin changes it. Preserve date-only values and units.

## Where things live
- Notion mapping (IDs, property resolution, scope rules): `config/notion.config.ts`
- Behaviour (areas, targets, freshness, check-ins): `config/dashboard.config.ts`
- Pipeline: `src/pipeline/` (`run.ts` = SYNC → VALIDATE → NORMALIZE → CALCULATE → UPDATE → VERIFY)
- Metrics (pure, provenance on every value): `src/metrics/`
- UI: `src/app/views/*` composed from `src/app/components/*`; tokens in `src/app/styles/tokens.css`
- Change → file map: `docs/iterating.md`. Architecture: `docs/architecture.md`. Setup/access: `docs/setup.md`.

## Workflow
1. `git status`, then read only the files the change needs. Reuse recorded findings; don't rescan.
2. Apply the relevant skill on demand: `dashboard-ui`, `notion-integration` or `visual-qa`.
3. Smallest coherent edit; keep adapters, normalized types, metrics and UI separate.
   Add meaningful metric/adapter tests.
4. Verify: `npm run verify`; for visible changes `npx vite preview --port 4173`, then
   `npm run screenshots` (and `-- --demo`) and `npm run states` — and look at the images.
5. Report what changed and what was actually verified. Update the relevant doc when
   architecture, schema, access, commands or decisions change.
