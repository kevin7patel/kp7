# Command Center

Kevin's personal performance dashboard — a responsive, installable web app (PWA) for
MacBook and iPhone. **Notion is the source of truth**; the dashboard is a read-only
visualization layer on top of it.

- **Today** — operator strip (Overdue · Due today · Waiting on you · Blockers), day plan in
  Overdue / Today / Afternoon / Tonight buckets, upcoming deadlines, ranked *Focus next*,
  *Needs attention*, check-in / workout / protein / sleep tiles, weekly completion and goal rings.
- **Tasks** — every task with area filter (All / Hotels / Personal), status filters, search,
  sub-tasks under parents, area distribution, upcoming and recently completed.
- **Progress** — completions per day, weekly completion, check-in streaks with honest misses,
  12-week habit calendar, training consistency, personal records.
- **Fitness / Nutrition / Health** — workout calendar, trends, PRs; intake vs your own targets;
  per-metric 30-day trends with neutral deltas.
- **Goals** — progress rings, start → current → target, countdowns, milestone timeline.
- **Sources** — the Notion → dashboard map, pipeline stages, verification checks, schema inspector.

Every number carries its provenance (Notion · Derived · Demo · No data) with source,
calculation, period, unit and last-updated time one tap away. Missing data shows as “—” with
a reason — never as a fake zero.

## Status
Version 1. Live structured sync starts once the Notion integration token is added — see
**[docs/SETUP.md](docs/SETUP.md)**. Until then the app runs on a titles-only snapshot of the
Notion workspace captured by Claude (kept out of git).

## Commands
```bash
npm ci
npm run sync          # Notion → .data/dashboard.json (API if NOTION_TOKEN is set, else local snapshot)
npm run dev           # local app; "Sync now" runs the pipeline on this machine
npm run verify        # lint + typecheck + tests + build
npm run screenshots   # visual checks across MacBook / iPad / iPhone × light / dark (needs a running preview)
```

## Docs
- [Setup — live sync, hosting, install](docs/SETUP.md)
- [Architecture, data integrity, sync strategy, privacy model](docs/ARCHITECTURE.md)
- [Iterating — where each kind of change lives](docs/ITERATING.md)
- [Notion mapping](docs/NOTION_MAPPING.md)

> This repository is public. Personal data never enters git: payloads live in gitignored
> `.data/`, and the hosted payload is AES-256-GCM encrypted with a key only Kevin holds.
