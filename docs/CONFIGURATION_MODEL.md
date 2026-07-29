# Performance Operations — Configuration Model

Phase 2 turns the foundation into managed business configuration. Everything
below is a database record behind deny-by-default RLS, mutated only through
permission-checked server actions that write audit events.

## Membership model

- `organization_memberships`: profile ↔ organization with a role and
  effective dates. One open membership per profile/org (partial unique
  index). Role changes close the old row and open a new one — history is
  never rewritten. Deactivation sets `effective_to`; nothing is deleted.
- `department_memberships`: additional narrowing for department-scoped roles
  (Department Manager). Same effective-dating rules.
- `is_default` marks the workspace a user lands in; managers set it, and the
  workspace resolver falls back to it when a stored selection becomes
  invalid.
- Escalation guards: `app.can_grant_role` (RESTRICTIVE RLS policies on
  memberships and invitations) plus mirrored server checks — workspace
  admins can never mint or displace platform admins; users cannot change
  their own role or deactivate themselves.

## Trainer identity model

- `trainers` is the person-level identity: names, contact, employment
  status, hire/separation dates, notes, and `source_identifiers` (JSONB map
  of scheduling-system IDs, e.g. `{"setmore": …, "acuity": …}`) used for
  duplicate detection and future import matching.
- A trainer may exist with **no login** (`profile_id` nullable); linking a
  profile later enables self-service views.
- Organization membership is expressed through effective-dated
  `trainer_organization_assignments` (role/title per organization) and
  `trainer_department_assignments` (composite FK prevents cross-org
  department links). One active assignment per org/department via partial
  unique indexes; ending an assignment closes it, preserving history.
- Duplicate detection at creation compares lowercased email and source
  identifiers; creating anyway requires an explicit confirmation.
- Trainers are never hard-deleted; separation flips employment status and
  active flag.

## Service normalization model

- `service_categories` (org-scoped catalog headings, seeded per org, never
  referenced by name in logic) → `services` → `service_department_assignments`
  (effective-dated, composite-FK org-safe) and `service_source_aliases`.
- A **service** is the internal normalized appointment/revenue category that
  future Setmore/Acuity rows map into. Classification flags
  (session/coaching-hours/payroll-eligible/revenue-eligible/evaluation/team/
  nutrition/group) describe what the service *represents*; calculation
  semantics arrive in later phases.
- **Aliases** are source-specific (`setmore` / `acuity` / `manual_csv`).
  A normalized alias (lowercased, trimmed — stored generated column) maps to
  exactly one service per source per organization (unique constraint), which
  is what makes future import matching deterministic. The UI warns when a
  service has no aliases.

## Reporting-period model

- Org-scoped `reporting_periods` with `period_type`
  (`monthly` / `semi_monthly` / `biweekly` / `custom`), start/end, optional
  payment date, notes, status.
- **Documented overlap rule:** periods of the *same type* may never overlap
  within an organization (DB exclusion constraint on
  `(organization_id, period_type, daterange)`); different types may coexist
  (a monthly reporting period over two semi-monthly payroll periods).
- Status machine: `open → closed → locked`, `closed → open`, and audited
  `locked → closed` (reopen) which requires `payroll:reopen` — enforced in
  the UI, the server action, and a database trigger.
- The header period selector stores the selection in an httpOnly cookie that
  is validated on every request against the *current* workspace's periods;
  stale or forged values are cleared. All Workspaces mode disables selection
  entirely — an organization period is never treated as globally valid.

## Effective-dating (uniform convention)

`effective_from date` (inclusive) + `effective_to date null` (open-ended).
Active-on-D = `from <= D and (to is null or to >= D)`. Records are closed,
never mutated; “end today” on a same-day row ends tomorrow to satisfy the
`to > from` check. Payroll will evaluate assignments as of service dates.

## Audit behavior

Every governed mutation appends to `audit_events` (actor, organization,
entity, action, sanitized metadata — summary fields only, never tokens,
passwords, or raw payloads). No UPDATE/DELETE policies exist for anyone;
platform admins read everything, workspace users only their organizations.
The `/audit` viewer adds filters and human-readable previous/new summaries.
