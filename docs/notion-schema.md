# Notion sources and schema

Read-only inspection, October 2, 2026. Counts are snapshots, not permanent facts (other agents
add tasks continuously). Database-level only: no record content is stored in this public repo.
IDs are identifiers, not credentials. The live map, with row counts and per-property resolution,
is on the dashboard's **Sources** screen.

## Source registry

| Source | Identifier | Role | Required |
|---|---|---|---|
| Tasks | data source `ed47cf5c-9013-48bd-8c76-d3fd8806caff` | Primary structured tasks | yes |
| Projects | data source `a862fc2e-e045-45a0-972b-6592df011baa` | Real longer-term outcomes | yes |
| Goals Tracker | data source `32d38b58-7685-8064-90bb-000b08e4d5ae` | Example/template rows — excluded in V1 | no |
| Build a Better Me | page `3ed38b58-7685-817c-bbb1-d66caef90823` | Fitness plan; status line shown, no observations yet | no |
| Meal Log | data source `d54e44a6-8fbf-4829-9959-0a4c1f2e33a4` | Recorded food and estimates | no |
| Training & Progress | data source `55cedb1b-58f8-49c3-a2ce-7bea7e4f161e` | Mixed tracker; dated Workout rows only | no |
| Command Center, Master Checklist | pages `3eb38b58…b219`, `3ec38b58…624e` | Context and links | no |

A failure on a required source fails the sync and keeps the last good payload; optional sources
fail independently with an explicit coverage note.

## Tasks
- `Name` title · `Done` checkbox · `Progress` select (Inbox, To Do, In Progress, Waiting)
- `Priority` select (P1 · High, P2 · Normal, P3 · Low) · `Top 3` select (1/2/3) · `Next action` text
- `Due date`, `Received date`, `Suggested follow-up` dates · `Last updated` last-edited time · `Owner` person
- `Area` select (Personal, Tru Fort Walton Beach, Staybridge Suites Crestview)
- `List` select (Kevin, Agent help, Family hands-on, Family calls, Tru, Staybridge, Project, Later)
- `Source` select (Manual, Uploaded file, Conversation, Email, Test) · `Project` relation
- `Status`, `This week`, `Timing` are formulas — the dashboard derives state from explicit properties instead.

Dashboard rules: status group = `Done` first, then `Progress`. Active = not Done and List not
Later/Project (those are counted separately as deferred). `Source = Test` rows are excluded and
reported in sync warnings. Empty Area → "unclassified" (never personal). Priority rank comes from
the select's own option order. Deduplicate by page ID.

Verified saved views (complete, `has_more=false`):
- All active `view://3ed38b58-7685-8174-94ce-000c072339c7` — 49 rows at the bundle inspection;
  **62** at the Claude snapshot (19:52 UTC): the same 18 personal + 21 hotel, plus 13 more with no
  Area (the new "Agent help" list). Progress then: 27 To Do, 26 Waiting, 7 Inbox, 2 In Progress.
- Personal active `view://3eb38b58-7685-81a3-aacf-000c032ad353` — includes Later/Project rows.
- Completed `view://3ed38b58-7685-8141-927f-000cbb089a10` — 6 rows: a current state, not dated history.

There is **no completion-date property**, so completed-today, weekly completion, streaks and the
completion chart stay "missing" with a reason. There is **no explicit needs-Kevin signal**, so the
tile reads "Waiting" (on anyone) rather than "Waiting on you"; no Blocked option → blockers unknown.

## Projects
`Name` title · `Outcome` text · `Area` select · `Owner` person · `Status` select (Needs Review,
To Do, In Progress, Waiting, Done) · `Target date` date · `Last updated`. 5 rows; none has a Target
date (verified by a filtered query). Linked-task completion is shown only for projects that tasks
relate to, labelled as task completion, never goal achievement.

## Goals Tracker
Title, Status, Priority, Owner, Due date, Start/End value, Quarter, Team, Progress and Days-until-due
formulas. Rows look like corporate examples (2025 due dates); personal authenticity is unconfirmed, so
`goalsTrackerConfirmed: false` excludes them. No Current value or history exists.

## Meal Log and Training & Progress

Meal Log is inside Food Log / Build a Better Me. `Date` is the local meal date; `Captured at`
is a separate timestamp. `Calories` is the central value, distinct from `Calories low` and
`Calories high`. `Protein g`, `Carbs g`, `Fat g`, `Total sugar g`, `Added sugar g`, `Basis` and
`Confidence` retain supplied values or unknowns. The dashboard labels sums as logged subtotals:
there is no structured full-day-completion property, so complete intake coverage is unconfirmed.

Training & Progress has `Entry` title, `Type`, `Status`, `Date`, `Minutes`, `Source` and `Capture ID`.
Types include Workout, Check-in, Measurements, Progress photos, Weekly review and Milestone.
Only dated `Type = Workout` rows enter the workout model. Only `Status = Completed` counts
toward completed training; plans, partial/skipped sessions and unknown completion do not.
The current schema has no numeric body measurements or habit checkboxes. Other entry types
are not reinterpreted as workouts, health samples, or completed morning/evening habits.

## Category coverage

| Category | Status | Source / unlock |
|---|---|---|
| Tasks | connected (snapshot now, live with token) | Tasks |
| Projects / outcomes | connected | Projects |
| Goals | excluded | Goals Tracker — confirm or replace rows |
| Habits / check-ins | missing | Build a Better Me defines a 9 AM check-in and 10 PM journal; a **Daily Log** database would make them chartable |
| Fitness and nutrition | mapped; live access awaits runtime integration | Share Meal Log and Training & Progress; empty data remains missing |
| Health | missing until recorded | Body/sleep/WHOOP metrics require actual structured values or verified imports |
| Automations / agents | missing | An Automation Registry database would enable the agent-status cards |
| Finance, travel | mapped, not shown | Credit Card Benefits Tracker, Travel Packing List (ignored in V1) |

## Highest-value Notion additions (proposals — nothing was changed)
1. **Completed** date on Tasks → real completion history, weekly rate, streaks.
2. A **Needs Kevin** checkbox (or Progress option) → an honest "Waiting on you".
3. **Daily Log** database (Date + habit checkboxes) → check-in streaks and the heatmap.
4. **Target date** on Projects → countdowns and the milestone timeline.
5. Personal rows in Goals Tracker with Start / Current / Target values (archive the samples).
