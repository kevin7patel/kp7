# Setup

## Verified environment and commands (October 2, 2026, cloud session)

Node 22.22 / npm 10.9 with one lockfile (`package-lock.json`). Vite 6, React 18, TypeScript 5.9
(strict), Vitest 3, ESLint 9, tsx 4, playwright-core 1.56 driving the preinstalled Chromium.

| Command | What it does | Status |
|---|---|---|
| `npm ci` | install | verified |
| `npm run verify` | lint + typecheck + unit/pipeline tests + build | verified (20 tests) |
| `npm run sync` | pipeline: live Notion with `NOTION_TOKEN`, else the gitignored MCP snapshot | verified on the snapshot (11/11 invariants) |
| `npm run dev` / `npx vite preview --port 4173` | local app; **Sync now** posts to a same-origin-only `/api/sync` | verified |
| `npm run screenshots` (`-- --demo`) | 1440×900, 1512×982, 1280×800, iPad, 390×844, 375×667 × light/dark → `.artifacts/` | verified, no overflow/console errors |
| `npm run states` | 14 synthetic scenarios (live, stale, error, locked, wrong key, unlock link, disconnected, offline, real service-worker offline, provenance, theme, mobile nav, area filter) | verified |

Blockers seen in this cloud session: `api.notion.com` is not on the network allowlist (proxy 403)
and no `NOTION_TOKEN` exists, so the live adapter is tested only against a mocked API. GitHub push
needs the Claude GitHub App on the repo. The Notion MCP connector (free plan) can read saved views
and data sources, which is how the current snapshot was captured; that is assistant access, not
runtime authentication for the app.

---

## Turning on live sync (≈10 minutes, free)

Everything below is free: a Notion internal integration, GitHub Actions minutes on a
public repo, and GitHub Pages. Nothing here creates a paid subscription.

The dashboard works today from a point-in-time structured snapshot captured by Claude. These
steps switch it to live Notion data that re-syncs every 30 minutes.

## 1. Create a read-only Notion integration
1. Go to <https://www.notion.so/profile/integrations> → **New integration**.
2. Name it `Command Center (read-only)`, workspace *Kevin Patel's Space*, type **Internal**.
3. Capabilities: tick **Read content** only. Leave *Update content*, *Insert content*
   and comments unticked. The dashboard never writes to Notion.
4. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`). Do not paste
   it into chat.

## 2. Share your pages with the integration
On each page below: `•••` menu → **Connections** → add `Command Center (read-only)`.
Share the **original** databases — a linked view alone is not enough. Sharing a parent shares
everything inside it.
- **Tasks** and **Projects** (required — the sync fails safely without them)
- **Build a Better Me** and **Goals Tracker** (optional)
- Any future database you want on the dashboard (Daily Log, Workouts, Meals, Body Metrics).

## 3. Generate the dashboard key
The repo is public, so the published data is encrypted (AES-256-GCM). Open the dashboard,
go to **Settings → Generate a new key**, and copy both the key and the unlock link.
(Or run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.)

## 4. Add two GitHub repository secrets
GitHub → `kevin7patel/kp7` → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `NOTION_TOKEN` | the integration secret from step 1 |
| `DASHBOARD_KEY` | the key from step 3 |

## 5. Merge to `main` and enable GitHub Pages
1. Merge the `claude/laughing-heisenberg-u9d2gx` branch into `main` (the scheduled sync and
   deploy workflows only run from the default branch).
2. The **Deploy app** workflow creates the `gh-pages` branch.
3. GitHub → **Settings → Pages** → Source **Deploy from a branch** → Branch `gh-pages` / `(root)` → Save.
4. Actions → **Notion sync** → **Run workflow** for the first sync (after that it runs every 30 minutes).
5. Your dashboard is at <https://kevin7patel.github.io/kp7/>.

## 6. Install on iPhone and MacBook
1. Open your **unlock link** (`https://kevin7patel.github.io/kp7/#k=…`) once on each device.
   The key is stored on that device only; the `#k=` part is never sent to any server.
2. iPhone: Safari → Share → **Add to Home Screen**.
   MacBook: Safari → File → **Add to Dock** (or Chrome's install icon).

## Optional: make “Sync now” trigger an immediate Notion sync
Without this, **Sync now** re-fetches the latest published data (the 30-minute schedule keeps it current).
To trigger a sync on demand, create a fine-grained GitHub token
(<https://github.com/settings/personal-access-tokens/new>): repository access *Only kp7*,
permission **Actions: Read and write**. Paste it in the dashboard under **Settings → On-demand Notion sync**.
It stays on that device.

## Optional: run locally on the MacBook
```bash
npm ci
cp .env.example .env.local           # gitignored; put NOTION_TOKEN=... in it yourself
set -a; . ./.env.local; set +a
npm run sync      # writes .data/dashboard.json (gitignored)
npm run dev       # http://localhost:5173 — "Sync now" runs the pipeline live
```

## Optional: live sync inside a Claude cloud session
Allow `api.notion.com` in the environment's network settings and add `NOTION_TOKEN` as an
environment secret. Not needed for GitHub Actions or local use.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Sync run fails with `notion_401` | Token wrong or revoked — re-copy it into `NOTION_TOKEN`. |
| Sync fails with `required_source_failed` | Tasks or Projects isn't shared with the integration; the last good data stays live. |
| Sources shows “not shared with the integration (404)” | Add the integration under that page's **Connections**. |
| Dashboard asks for a key / “can’t unlock” | Open the unlock link again, or paste `DASHBOARD_KEY` in Settings. |
| “Stale” badge | Check Actions → Notion sync. GitHub can delay schedules; it also pauses scheduled workflows in public repos after 60 days without repository activity — re-enable with one click. |
