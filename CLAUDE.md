# Command Center — notes for Claude

Kevin's personal dashboard. Notion is the source of truth; this app only reads it.

## Hard rules
- **Public repo.** Never commit Notion content or anything personal: no task/project titles,
  names, places, health values, keys or tokens — not in code, tests, fixtures, docs or commit
  messages. Real data lives only in gitignored `.data/`. Test fixtures must be invented.
- Never write to Notion. The integration is read-only by design.
- Never present demo/placeholder values as real. Missing data shows as “—” with a reason.
- No health scores or medical interpretation.

## Where things live
- Notion mapping (DB ids, property detection): `config/notion.config.ts`
- Behaviour (areas, targets, freshness, check-ins): `config/dashboard.config.ts`
- Pipeline: `src/pipeline/` (`run.ts` = SYNC → VALIDATE → NORMALIZE → CALCULATE → UPDATE → VERIFY)
- Metrics (pure, provenance on every value): `src/metrics/`
- UI: `src/app/views/*` composed from `src/app/components/*`; tokens in `src/app/styles/tokens.css`
- See `docs/ITERATING.md` for the change → file map.

## Verify before pushing
`npm run verify`, then `npm run build && npx vite preview --port 4173 &` and
`npm run screenshots` (and `-- --demo`). Look at the screenshots.
