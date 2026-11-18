# Command Center

Kevin's personal performance dashboard: an installable web app (PWA) for MacBook and iPhone.
**Notion is the source of truth**; the dashboard only reads it. Every number carries its provenance
(Notion · Derived · Demo · No data) with source, calculation, period, unit and last-updated time one
tap away. Missing data shows as "—" with a reason, never as a fake zero.

## Screens
- **Today** — Day Pulse (overdue, due today, waiting, blockers or top priority), day plan buckets,
  deadlines, Top 3 with next actions, active projects, check-in / workout / protein / sleep tiles.
- **Tasks** — active tasks with area, status and search filters, next actions, breakdowns.
- **Progress** — training consistency and check-ins where records exist. Completion history, weekly
  rate and streaks switch on once a Completed date exists in Notion (see `docs/notion-schema.md`).
- **Fitness / Nutrition / Health** — workout calendar and trends, intake vs your targets, per-metric
  30-day trends with neutral deltas. Shown as "no data" until records exist.
- **Goals** — Notion Projects (status, area, outcome, target date, linked-task completion).
- **Sources** — the Notion → dashboard map, pipeline stages, verification checks, schema inspector.

## Setup (one time, about 10 minutes, all free)
The app's **Settings** screen walks through this with direct links. In short:

1. **Notion integration.** notion.so → Settings → Integrations → New internal integration, capability
   **Read content** only. Copy the secret; never paste it into a chat.
2. **Share databases** with the integration (page `•••` → Connections): the original **Tasks** and
   **Projects** (required), plus Meal Log, Training & Progress and Build a Better Me (optional).
   Linked views are not enough; sharing a parent page shares its children.
3. **Dashboard key.** Settings → Generate dashboard key. It stays on the device; copy the private
   unlock link to your password manager. (Or `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.)
4. **GitHub secrets.** Repo → Settings → Secrets and variables → Actions: `NOTION_TOKEN` and
   `DASHBOARD_KEY`.
5. **GitHub Pages.** Repo → Settings → Pages → Source **GitHub Actions**. Run the **Deploy app**
   workflow once, then **Notion sync**. The site is <https://kevin7patel.github.io/kp7/>; it then
   syncs every 30 minutes (GitHub may run schedules late).
6. **Install.** Open the unlock link (`…/#k=…`) once per device. iPhone: Share → Add to Home Screen.
   Mac: Safari → File → Add to Dock.

Optional: **Sync now** can trigger an immediate sync with a fine-grained GitHub token
(repository `kp7`, Actions: Read and write) pasted under Settings → On-demand sync. Not set up today.

| Symptom | Fix |
|---|---|
| Sync fails `notion_401` | Token wrong or revoked: re-copy `NOTION_TOKEN`. |
| Sync configuration fails | Add both GitHub secrets. Missing configuration is a failure, not a skipped sync. |
| Publish fails at Configure Pages | Pages source must be GitHub Actions; rerun Deploy app. |
| `required_source_failed` | Tasks or Projects isn't shared with the integration. Last good data stays live. |
| Sources: "not shared (404)" | Add the integration under that page's Connections. |
| Asks for a key | Open the unlock link again, or paste `DASHBOARD_KEY` in Settings. |
| "Stale" badge | Check Actions → Notion sync. GitHub pauses schedules after 60 idle days; re-enable with one click. |

## Commands
```bash
npm ci
npm run sync          # Notion → .data/dashboard.json (API with NOTION_TOKEN, else local snapshot)
npm run dev           # local app at :5173; "Sync now" runs the pipeline on this machine
npm run verify        # lint + typecheck + tests + build
npm run build && npx vite preview --port 4173   # needed by the two QA scripts below
npm run screenshots   # desktop → phone × light/dark → .artifacts/ (add -- --demo for synthetic data)
npm run states        # synthetic freshness / offline / navigation scenarios
```
Local Notion sync: `cp .env.example .env.local`, put `NOTION_TOKEN=…` in it, `set -a; . ./.env.local; set +a`.

## Docs
- [Architecture: layers, sync, privacy, design system, where each change lives](docs/architecture.md)
- [Notion sources, schema and to-do](docs/notion-schema.md)

> Public repository. Personal data never enters git: payloads live in gitignored `.data/` and the
> hosted payload is AES-256-GCM encrypted with a key only Kevin holds.
