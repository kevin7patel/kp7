# Command Center

Kevin's personal performance dashboard — a responsive, installable web app (PWA) for
MacBook and iPhone. **Notion is the source of truth**; the dashboard is a read-only
visualization layer on top of it.

- **Today** — operator strip (Overdue · Due today · Waiting · Blockers or top priority), day plan in
  Overdue / Today / Afternoon / Tonight buckets, upcoming deadlines, *Focus next* led by your Top 3
  with next actions, active projects, *Needs attention*, check-in / workout / protein / sleep tiles.
- **Tasks** — every active task with area filter (All / Hotels / Personal), status filters, search,
  next actions, status / priority / area breakdowns, upcoming and recently completed.
- **Progress** — completions per day, weekly completion, check-in streaks with honest misses,
  12-week habit calendar, training consistency, personal records.
- **Fitness / Nutrition / Health** — workout calendar, trends, PRs; intake vs your own targets;
  per-metric 30-day trends with neutral deltas.
- **Goals** — Notion Projects (status, area, outcome, target date, linked-task completion), plus
  measurable-goal rings, countdowns and a milestone timeline once confirmed goals exist.
- **Sources** — the Notion → dashboard map, pipeline stages, verification checks, schema inspector.

Every number carries its provenance (Notion · Derived · Demo · No data) with source,
calculation, period, unit and last-updated time one tap away. Missing data shows as “—” with
a reason — never as a fake zero.

## Status
Version 1. Live structured sync starts once the Notion integration token is added — see
**[docs/setup.md](docs/setup.md)**. Until then the app runs on a point-in-time structured snapshot
of the Tasks and Projects databases captured by Claude (kept out of git).

## Commands
```bash
npm ci
npm run sync          # Notion → .data/dashboard.json (API if NOTION_TOKEN is set, else local snapshot)
npm run dev           # local app; "Sync now" runs the pipeline on this machine
npm run verify        # lint + typecheck + tests + build
npm run screenshots   # visual checks, desktop → phone × light / dark (needs a running preview)
npm run states        # synthetic freshness / offline / navigation scenarios
```

## Docs
- [Setup — verified commands, live sync, hosting, install](docs/setup.md)
- [Architecture, data integrity, sync strategy, privacy model](docs/architecture.md)
- [Iterating — where each kind of change lives](docs/iterating.md)
- [Notion sources and schema](docs/notion-schema.md)

> This repository is public. Personal data never enters git: payloads live in gitignored
> `.data/`, and the hosted payload is AES-256-GCM encrypted with a key only Kevin holds.
