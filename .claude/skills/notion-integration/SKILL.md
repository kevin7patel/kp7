---
name: notion-integration
description: Use when connecting Notion, adding or changing a property/source, modifying synchronization, or defining a dashboard metric from Notion data.
---

# Notion integration

Read the project-root `docs/notion-schema.md` for relevant verified sources and `docs/architecture.md` for boundaries. Reuse findings; inspect only the source/property affected by the task.

1. Verify the current connection and source access. Claude/Codex MCP authorization and runtime server authentication are separate. Never request tokens in chat or print environment values. No paid upgrade/service without Kevin's approval.
2. Fetch schema before rows. Use stable source/property IDs with centralized mappings and type validation; distinguish database/data-source IDs. Never assume a new property, relation, wearable connection, or history exists.
3. Keep retrieval/normalization server-only. Paginate fully, deduplicate IDs, exclude known Test/demo rows, handle rate limits, reconcile removals, and preserve the last good snapshot on required-source failure. Do not log raw payloads.
4. Preserve units, local dates versus instants, provenance, uncertainty, null values, coverage, and freshness. Planned actions and prose are not completed observations. Unclassified scope is not personal by default.
5. Define each metric's inputs, scope, time window, denominator, and availability. Last edited is not completion time; absence is not zero. Goal achievement, task completion, and habit consistency require distinct definitions. Health values do not justify medical interpretation.
6. Test meaningful adapter/metric edge cases with synthetic fixtures, then update only relevant schema facts and mappings. Keep UI contracts stable so synchronization/schema changes stay localized.

Current V1 excludes unconfirmed Goals Tracker examples and renders unavailable fitness/health states until actual records exist. Never fill those gaps with demo data in real mode.
