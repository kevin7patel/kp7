# Project guidance

Read `CLAUDE.md` as the shared source of project requirements and iteration rules. Consult its linked documents only for the current task. Keep these files consistent without duplicating the full guidance here.

## Cursor Cloud specific instructions

- Install dependencies with `npm ci` (Node 22, `package-lock.json`). `npm run verify` runs lint, typecheck, tests, and the production build.
- The environment start command serves the app on port 5173: `npm run dev -- --host 0.0.0.0 --port 5173`. With no `.data/dashboard.json`, the first screen says “No data published yet”; **Preview with demo data** loads the synthetic dashboard (search, theme, and Sync now run locally).
- `npm run screenshots` and `npm run states` launch Chromium from `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Install links `google-chrome` to that path when the binary is missing.
- `NOTION_TOKEN` is optional for local development and `npm run verify` (tests mock the Notion API). Live sync also needs outbound access to `api.notion.com`.
