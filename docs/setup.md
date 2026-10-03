# Setup

## Kevin — start here

1. [Open website settings](https://github.com/kevin7patel/kp7/settings/pages). Set **Source → GitHub Actions**.
2. [Open the guided dashboard setup](https://kevin7patel.github.io/kp7/#/settings).
   It links directly to the original Tasks, Projects, Meal Log and Training & Progress databases,
   creates a private dashboard key on your device, and links to GitHub's secret boxes and first sync.
3. Create the read-only Notion connection and enter `NOTION_TOKEN` and `DASHBOARD_KEY`
   **directly into GitHub**. Keep the private unlock link in your password manager.
4. [Run Notion sync](https://github.com/kevin7patel/kp7/actions/workflows/sync.yml), then refresh the dashboard.

If the website is not available after enabling Pages, run
[Deploy app](https://github.com/kevin7patel/kp7/actions/workflows/deploy.yml) once.
After that, code changes and changed encrypted data publish automatically.
No paid plan is required for this public repository. Notion records remain unchanged.

The assistant's Notion and GitHub connectors are separate from the website's runtime connection.
They cannot create the internal integration or enter repository secrets. Never send tokens or keys
to an assistant. A successful CI build is not proof of a live Notion sync: the first-sync workflow
must finish and the dashboard must load a Notion API payload.

## Verified environment and commands (October 2, 2026, cloud session)

Node 22.22 / npm 10.9 with one lockfile (`package-lock.json`). Vite 6, React 18, TypeScript 5.9
(strict), Vitest 3, ESLint 9, tsx 4, playwright-core 1.56 driving the preinstalled Chromium.

| Command | What it does | Status |
|---|---|---|
| `npm ci` | install | verified |
| `npm run verify` | lint + typecheck + unit/pipeline tests + build | verified (23 tests) |
| `npm run sync` | pipeline: live Notion with `NOTION_TOKEN`, else the gitignored MCP snapshot | verified on the snapshot (11/11 invariants) |
| `npm run dev` / `npx vite preview --port 4173` | local app; **Sync now** posts to a same-origin-only `/api/sync` | verified |
| `npm run screenshots` (`-- --demo`) | 1440×900, 1512×982, 1280×800, iPad, 390×844, 375×667 × light/dark → `.artifacts/` | verified, no overflow/console errors |
| `npm run states` | 17 synthetic scenarios, including guided key creation/reuse, clipboard fallback and real service-worker offline use | verified |

Blockers seen in this cloud session: `api.notion.com` is not on the network allowlist (proxy 403)
and no `NOTION_TOKEN` exists, so the live adapter is tested only against a mocked API. GitHub push
needs the Claude GitHub App on the repo. The Notion MCP connector (free plan) can read saved views
and data sources, which is how the current snapshot was captured; that is assistant access, not
runtime authentication for the app.

---

## Turning on live sync (≈10 minutes, free)

Everything below is free: a Notion internal integration, GitHub Actions minutes on a
public repo, and GitHub Pages. Nothing here creates a paid subscription.

If a local snapshot exists, it is labelled as a point-in-time capture. The public site shows no
personal data until an encrypted payload is published. These steps enable live Notion sync about
every 30 minutes; GitHub may delay scheduled runs.

## 1. Create a read-only Notion integration
1. Go to <https://www.notion.so/profile/integrations> → **New integration**.
2. Name it `Command Center (read-only)`, workspace *Kevin Patel's Space*, type **Internal**.
3. Capabilities: tick **Read content** only. Leave *Update content*, *Insert content*
   and comments unticked; set **No user information**. The dashboard never writes to Notion.
4. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`). Do not paste
   it into chat.

## 2. Share your pages with the integration
On each page below: `•••` menu → **Connections** → add `Command Center (read-only)`.
Share the **original** databases — a linked view alone is not enough. Sharing a parent shares
everything inside it.
- **Tasks** and **Projects** (required — the sync fails safely without them)
- [Meal Log](https://app.notion.com/p/4ff20876820c468f8e1c8b5ce430028c) and
  [Training & Progress](https://app.notion.com/p/327983e6b19c43bebfd868335e0c6850) (optional, for food and fitness)
- **Build a Better Me** (optional, for the program status line). Goals Tracker examples remain excluded.
- Any future database you want on the dashboard (Daily Log, Workouts, Meals, Body Metrics).

## 3. Generate the dashboard key
The repo is public, so the published data is encrypted (AES-256-GCM). Open the dashboard,
go to **Settings → Set up your Command Center → Generate dashboard key**, and copy the key and private unlock link.
The generated key is saved on the current device immediately. Existing keys are reused.
(Or run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.)

## 4. Add two GitHub repository secrets
GitHub → `kevin7patel/kp7` → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `NOTION_TOKEN` | the integration secret from step 1 |
| `DASHBOARD_KEY` | the key from step 3 |

## 5. Enable GitHub Pages
1. The original app is already merged into `main`; scheduled workflows run from that branch.
2. **Deploy app** builds the app and preserves encrypted data on `gh-pages`.
3. GitHub → **Settings → Pages** → Source **GitHub Actions**.
   The reusable **Publish website** workflow explicitly deploys the `gh-pages` tree after app
   builds and changed data syncs. Branch-only publishing is insufficient because commits made
   with `GITHUB_TOKEN` do not trigger a GitHub Pages build.
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
| Sync configuration fails | Add both GitHub secrets. No Notion sync ran; missing configuration is reported as a failure. |
| Publish website fails at Configure Pages | Set Settings → Pages → Source to GitHub Actions, then rerun Deploy app or Publish website. |
| Sync fails with `required_source_failed` | Tasks or Projects isn't shared with the integration; the last good data stays live. |
| Sources shows “not shared with the integration (404)” | Add the integration under that page's **Connections**. |
| Dashboard asks for a key / “can’t unlock” | Open the unlock link again, or paste `DASHBOARD_KEY` in Settings. |
| “Stale” badge | Check Actions → Notion sync. GitHub can delay schedules; it also pauses scheduled workflows in public repos after 60 days without repository activity — re-enable with one click. |
