# Notion sources and schema

Database-level facts only; no record content lives in this public repo. IDs are identifiers, not
credentials. The live map with row counts and per-property resolution is on the dashboard's
**Sources** screen. Property resolution rules: `config/notion.config.ts`.

## Sources

| Source | Identifier | Role | Required |
|---|---|---|---|
| Tasks | data source `ed47cf5c-9013-48bd-8c76-d3fd8806caff` | Structured tasks | yes |
| Projects | data source `a862fc2e-e045-45a0-972b-6592df011baa` | Longer-term outcomes (the "goals") | yes |
| Goals Tracker | data source `32d38b58-7685-8064-90bb-000b08e4d5ae` | Template example rows: excluded | no |
| Build a Better Me | page `3ed38b58-7685-817c-bbb1-d66caef90823` | Fitness plan, program status line | no |
| Meal Log | data source `d54e44a6-8fbf-4829-9959-0a4c1f2e33a4` | Recorded food | no |
| Training & Progress | data source `55cedb1b-58f8-49c3-a2ce-7bea7e4f161e` | Mixed tracker; dated Workout rows only | no |

A required source failing fails the sync and keeps the last good payload; optional sources fail
independently with a coverage note.

## Tasks
`Name` title · `Done` checkbox · `Progress` select (Inbox, To Do, In Progress, Waiting) ·
`Priority` select (P1 · High, P2 · Normal, P3 · Low) · `Top 3` select (1/2/3) · `Next action` text ·
`Due date`, `Received date`, `Suggested follow-up` dates · `Last updated` · `Owner` person ·
`Area` select (Personal + one option per hotel) · `List` select (personal, hotel, family and agent
lists, plus `Project` and `Later`) · `Source` select (Manual, Uploaded file, Conversation, Email,
Test) · `Project` relation. `Status`, `This week`, `Timing` are formulas; the dashboard derives state
from the explicit properties instead.

Rules: status group = Done first, then Progress. Active = not Done and List not Later/Project
(counted separately as deferred). Source = Test excluded and reported in sync warnings. Empty Area
= "unclassified", never personal. Priority rank follows the select's option order. Dedupe by page ID.

## Projects
`Name` · `Outcome` text · `Area` · `Owner` · `Status` select (Needs Review, To Do, In Progress,
Waiting, Done) · `Target date` (currently empty on all rows) · `Last updated`. Linked-task completion
is shown per project, labelled as task completion, never goal achievement.

## Goals Tracker
Corporate-looking template rows with 2025 dates and no Current value or history.
`goalsTrackerConfirmed: false` excludes them; Projects are the goals.

## Meal Log and Training & Progress
Meal Log: `Date` (local meal date) and `Captured at` (timestamp) are different. `Calories` is the
central value, distinct from `Calories low/high`. `Protein g`, `Carbs g`, `Fat g`, `Total sugar g`,
`Added sugar g`, `Basis`, `Confidence` keep supplied values or unknowns. Sums are "logged subtotals":
no property says a day's intake is complete.

Training & Progress: `Entry` · `Type` (Workout, Check-in, Measurements, Progress photos, Weekly
review, Milestone) · `Status` · `Date` · `Minutes` · `Source` · `Capture ID`. Only dated
`Type = Workout` rows enter the workout model; only `Status = Completed` counts as completed training.
No numeric body measurements or habit checkboxes exist; other entry types are not reinterpreted.

## Not available yet (shown as "no data", never demo in real mode)
Habits/check-ins (no Daily Log database), health samples (no structured body/sleep values),
automation status (no registry database). Finance and travel databases are ignored.

## Notion to-do (for Kevin or the agents; the dashboard never writes)
The dashboard auto-detects each of these by property type and name and switches the metric on.

1. **Needs Kevin** checkbox on Tasks → "Waiting on you" tile (today everything reads "Waiting").
2. **Completed** date on Tasks, set when Done is ticked → completion chart, weekly rate, streaks.
3. **Target date** on each active Project → countdowns and the milestone timeline.

Decided Oct 8, 2026: default view All areas (each device remembers its filter); hosting is the
encrypted payload on free GitHub Pages; on-demand sync token not now.
