# Analytics Security

Authorization, RLS, and audit for the Phase 9 analytics domain.
Companion to AUTHORIZATION_MODEL.md; live-verified by
`tests/rls/phase9-live-checks.sql` (isolated org, impersonation,
rollback).

## Permissions (migration 28)

`analytics:read` · `analytics:compare` · `analytics:export` ·
`analytics:presentation` · `analytics_dataset:export` ·
`dashboard:create/update/share_department/share_organization/set_default` ·
`scorecard:manage` · `goal:read/create/update/approve/archive` ·
`benchmark:read/create/approve/archive` · `cohort:read`

Role matrix (capabilities, never role-name conditions in code):

| Role | Analytics access |
| --- | --- |
| Platform admin | Everything, platform-wide |
| Workspace admin | Full analytics governance for the organization |
| Payroll manager | Read/compare/export + dataset export + personal dashboards; goal/benchmark read; **no** cohort client detail, **no** presentation governance |
| Department manager | Department analytics/compare, department goals (create/update), department dashboard sharing, cohorts, benchmark read |
| Trainer | Own scorecard, own goals (read), personal dashboards |
| Viewer | `analytics:read` only |

Entry permissions open surfaces; **what renders is decided per metric by
the engine** (requiredPermission / selfPermission / department scoping)
plus RLS on every underlying row. Composition never widens access; a
dashboard shared org-wide shows each viewer only what they could read
directly.

## RLS (all new tables: enable + FORCE, deny by default)

- `performance_goals`: goal:read gated; department-scoped roles see
  their departments; trainers see exactly `trainer_id =
  app.current_trainer_id()`; insert restricted to draft + scope
  discipline; no delete policy. Lifecycle/immutability in a
  security-definer trigger (`search_path` pinned) that checks
  `app.has_permission_in` per transition.
- `performance_goal_events`: visible when the goal is visible;
  **append-only** (no client insert/update/delete policies + trigger for
  privileged paths).
- `performance_goal_progress_snapshots`: goal-visibility reads;
  self-attributed inserts.
- `performance_benchmarks`: benchmark:read + scope narrowing; draft-only
  inserts by benchmark:create; lifecycle trigger freezes approved
  content; no deletes.
- `analytics_dashboards` (+sections/widgets/defaults): owner-only
  writes; visibility = own ∪ org-shared (analytics:read) ∪
  department-shared (department members / org-read roles); sharing
  gates enforced by triggers at insert AND update; defaults gated by
  `dashboard:set_default` for organization scope; partial unique
  indexes guarantee single defaults.

## Live verification results (2026-07-30, all passed, rolled back)

Goals: outsider 0 rows; dept manager sees dept-A only and cannot create
org/dept-B goals but can create dept-A; trainer sees exactly own goal
and cannot create; approval denied without goal:approve; recorded
approver; draft→achieved rejected; definitional fields frozen; active
target edits rejected; completed goal immutable; archived terminal;
event trail ≥3 rows and delete-proof; trainer sees no foreign events.

Benchmarks: trainer cannot create; dept manager's approval attempt
touches 0 rows; approved value/evidence frozen; deprecation recorded;
outsider 0 rows.

Dashboards: trainer's personal dashboard + widgets invisible to others;
trainer cannot share (department or org); org-shared visible to trainer
but not modifiable (0 rows); personal default self-set; org default
denied without permission; dept manager cannot share into an unmanaged
department; department-shared dashboards invisible outside their
department; outsider 0 rows.

## Audit

Application-level audit events: goal create/approve/target-change/
complete/cancel/archive; benchmark create/approve/deprecate/archive;
dashboard create/update/share/share-denied/default/duplicate/archive/
restore; analytics package generation (report_package events); dataset
exports (with content hash); subscriptions via scheduled-report runs.
The domain event trail (`performance_goal_events`) adds deterministic
in-domain history. Audit rows carry safe summaries — never full
analytical datasets.

## GUC hygiene

The analytics domain introduces no transaction-local GUC bypasses; its
security-definer trigger functions pin `search_path = ''` and derive
everything from `auth.uid()` + `app.*` helpers.
