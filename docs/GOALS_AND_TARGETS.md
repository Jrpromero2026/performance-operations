# Goals and Targets

Governed targets against catalog metrics — migration 29
(`performance_goals`, `performance_goal_events`,
`performance_goal_progress_snapshots`), `src/lib/analytics/goals/`.

## Data model

A goal pins its metric **id, version, and unit at creation**. Scope is
exactly one of organization / department / trainer / service
(CHECK-enforced shape). Targets are stored in metric-native units —
currency stays integer cents; rates stay basis points. Goal types:

| Type | Meaning | Achieved when |
| --- | --- | --- |
| `minimum` | at least the target | value ≥ target (exceeded when >) |
| `maximum` | at most the target | value ≤ target (exceeded when <) |
| `exact` | exactly the target | value = target |
| `range` | inside [low, high] | low ≤ value ≤ high |
| `maintain` | keep at/above the pinned baseline target | value ≥ target |
| `improvement` | signed delta vs baseline | (value − baseline) meets the signed delta |

`maintain`/`improvement` require a baseline reporting period; the
baseline **value is computed by the engine** for that period at creation
— never typed in (source-backed or refused).

## Lifecycle

`draft → active → achieved | missed | cancelled → archived`
(drafts may also cancel). Enforced by a BEFORE UPDATE trigger:

- activation and completion require `goal:approve` (recorded with
  approver + timestamp);
- definitional fields (metric, scope, window, type, baseline) are frozen
  at creation — changing the metric means a new goal;
- targets change only while `draft` (audited as `goal_target_changed`);
- completed goals accept **only** archival; archived goals accept
  nothing.

Every change writes a `performance_goal_events` row (append-only:
clients have no update/delete policy and a trigger blocks privileged
paths) plus an application audit event.

## Progress derivation (read-time, never stored as truth)

`deriveGoalProgress(goal, engineResult, today)` returns
`not_started | in_progress | met | exceeded | missed | unavailable | blocked`
plus `absoluteGap`, `percentToTargetBp` (only when target > 0 — zero
denominators refuse), `timeElapsedBp`, and `onTrack`.

Rules that matter:

- **An unavailable engine result never counts as achieved** — and after
  the window ends it stays `unavailable`, not `missed` (no evidence
  either way).
- **`blocked`** means the pinned metric version or unit no longer
  matches the live catalog — review the goal, don't evaluate it.
- **The on-track rule** (the only one, documented verbatim): for
  `minimum` goals before their end date,
  `onTrack = value ≥ floor(target × elapsed_days / total_days)` — the
  current cumulative value has met the linearly prorated share of the
  target through today. No projections, ever.

`performance_goal_progress_snapshots` freeze a progress reading into
goal-progress report packages so package numbers stay reproducible
evidence; they are presentation records, never re-read as inputs.

## Permissions and RLS (live-verified)

- Visibility: org-read roles see org-wide; department-scoped roles see
  their departments' goals only; trainers see exactly their own goals.
- Creation: `goal:create`; department-scoped actors create only
  department/trainer goals inside their departments; trainers cannot
  create goals; nobody department-scoped creates organization goals.
- `goal:approve` — workspace admin (and platform admin); `goal:archive`
  — workspace admin.
- No deletes anywhere: goals archive.

No sales quotas and no compensation consequences are attached to goals.
