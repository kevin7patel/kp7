---
name: visual-qa
description: Use after dashboard layout, theme, chart, or interaction changes to verify affected screens across desktop/mobile and light/dark.
---

Read project root `docs/setup.md` for verified commands and inspect the affected flow. Consult `docs/architecture.md` when needed. Run available checks appropriate to the change, then review rendered output; report what ran and any verification gaps. Keep scope proportional and avoid implementation-mirroring tests.

For relevant screens, cover desktop and mobile in both light and dark modes. Start with approximately 1440×900 and 390×844 viewports; also inspect a narrow breakpoint when the change could cause wrapping or overflow. Use stable synthetic fixtures, including missing, empty, stale, error, and explicitly labeled demo states. Do not capture personal health records or credentials in screenshots, traces, videos, or test artifacts.

Check visual hierarchy, clipping, spacing, text readability, chart labels, contrast, and consistent theme behavior. Inspect keyboard navigation, visible focus, accessible names, meaningful chart summaries, and touch target size. Exercise changed controls: navigation, filters, theme switching, refresh, expand/collapse, and retries where present. Confirm displayed state actually changes and refresh failures preserve understandable freshness information.

Verified commands (see `docs/setup.md`): `npm run build && npx vite preview --port 4173`, then `npm run screenshots` (real local data; artifacts stay local), `npm run screenshots -- --demo` (labelled synthetic data), and `npm run states` (synthetic fixtures for live, stale, error, locked, wrong-key, disconnected, offline, service-worker, navigation, filters, theme). Playwright drives the preinstalled Chromium via `playwright-core`. Screenshots go to the ignored `.artifacts/` directory; compare affected views without blindly updating baselines. Summarize defects and coverage concisely.
