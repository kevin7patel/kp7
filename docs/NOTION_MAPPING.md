# Notion → dashboard mapping (discovered 2026-10-02)

Read-only discovery through the Notion connector. Database-level only — no record content
is written to this public repository. The live map (with row counts and per-property
resolution) is on the dashboard's **Sources** screen.

| Category | Status | Notion source | Notes |
|---|---|---|---|
| Tasks / To-do | partial → connected with token | **Tasks** (HOTELS OPS / GM Command Center) | ~93 rows incl. sub-tasks (parent rows nest children). Titles readable now; status, due, priority, owner need the integration token. Work and personal tasks are mixed — the All / Hotels / Personal filter separates them. |
| Projects | partial | **Projects** (Kevin’s Life & Hotel Command Center) | Project titles now; status with token. |
| Goals | template | **Goals Tracker** | Only Notion template sample rows today (excluded automatically). Schema has Start value, End value, Progress formula, Due, Priority — ready for personal goals. |
| Habits / Daily routines | missing | Build a Better Me (page text) | 9 AM check-in and 10 PM journal are defined as text; a **Daily Log** database would make them chartable. |
| Fitness / Workouts | missing | Build a Better Me | Page status: awaiting intake; no workouts recorded. |
| Nutrition | missing | Build a Better Me | Meal-photo workflow defined; no entries. |
| Health / Body / Sleep | missing | Build a Better Me | No wearable connection verified; no body metrics recorded. |
| Personal development | missing | — | Nothing found. |
| Milestones | missing | — | Will come from goal due dates. |
| Automations / agents | missing | AI Execution Team — Connection & Handoffs (page text) | An Automation Registry database would enable an agents panel. |
| Finance | partial (out of scope v1) | Credit Card Benefits Tracker | Mapped, intentionally not shown. |
| Travel | partial | Travel Packing List | Trip tasks show under the Travel area. |
| Notes / hubs | connected | Command Center, Master Checklist, Executive Links & Action Desk, AI Execution Team, Build a Better Me | Linked from Sources. |

## Highest-value additions in Notion (proposals, nothing was changed)
1. **Daily Log** database — Date + checkboxes (Morning check-in, Evening journal, Workout…) + Win / Improvement text. Unlocks streaks, heatmap, consistency.
2. **Area** select on Tasks (Tru / Staybridge / Hotel ops / Personal / Travel / Finance…) — replaces keyword heuristics.
3. **Completed** date on Tasks — exact completion history instead of the last-edited proxy.
4. **Workouts** and **Body Metrics** databases once Build a Better Me intake is done.
5. Personal rows in **Goals Tracker** (and archive the template samples).
