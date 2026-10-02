---
name: dashboard-ui
description: Use when implementing or refining Kevin's dashboard cards, layouts, themes, responsive behavior, or chart presentation.
---

Read the relevant section of project root `docs/architecture.md` and the component being changed. Reuse verified architecture and tokens; keep edits localized. This skill addresses presentation, not Notion ingestion or metric formulas.

Build for a glance: each card should communicate its purpose, current value, units, timeframe, and useful comparison without requiring paragraphs. Put Today and actionable priorities first. Prefer a small set of reusable cards, section containers, chart wrappers, and state treatments over one-off variants.

Treat desktop/mobile and light/dark as equal requirements. Use fluid grids and readable type, preserve meaningful hierarchy on narrow screens, and avoid horizontal overflow. Use semantic theme tokens with adequate text and chart contrast. Support keyboard access, touch targets, visible focus, reduced motion, and accessible names.

Choose charts to answer a specific question. Label units and time axes; use consistent scales, explicit denominators, and sensible empty ranges. Supply a concise text summary or accessible data alternative. Color must have a second cue. Do not turn sparse records into continuous trends or offer unsupported medical interpretation.

Keep live, demo, missing, loading, stale, and error states visibly distinct. Unknown is not zero; show freshness where it affects interpretation. Use synthetic fixtures when developing visual states. Do not add paid tools, subscriptions, or external services without Kevin's explicit approval.
