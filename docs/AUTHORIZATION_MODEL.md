# Performance Operations — Authorization Model

## Principles

- **Deny by default.** Access exists only where an explicit grant exists.
- **Three enforcement layers**: UI (convenience), server helpers (authority
  for application logic), database RLS (final backstop).
- **Never trust client-provided organization IDs.** The workspace cookie and
  any organization ID in a request are treated as *requests*, validated
  against server-loaded memberships before use.

## Roles

| Role key | Scope | Summary |
| --- | --- | --- |
| `platform_admin` | Platform | Full access across all organizations; create organizations; configure compensation; approve payroll; reopen locked periods; read all audit logs |
| `workspace_admin` | Organization | Full access to assigned organizations: trainers, departments, services, imports, payroll, reports |
| `payroll_manager` | Organization | Review imports; calculate/approve/export payroll; create adjustments; no platform-wide settings |
| `department_manager` | Department | Manage assigned departments; view trainers, appointments, KPIs; payroll access restricted |
| `trainer` | Self | View own scorecard and payroll statements; cannot modify compensation or official financial records |
| `viewer` | Organization | Read-only access to approved dashboards and reports |

Roles are database records (`roles`), granted per organization through
`organization_memberships.role_id`. A user may hold different roles in
different organizations.

## Permissions

Permission keys follow `resource:action`. The Phase 1 catalog:

- `org:read`, `org:read_all`, `org:manage`, `org:create`
- `department:read`, `department:manage`
- `trainer:read`, `trainer:read_self`, `trainer:manage`
- `client:read`, `client:manage`
- `service:read`, `service:manage`
- `import:read`, `import:manage`, `import:approve`
- `payroll:read`, `payroll:read_self`, `payroll:calculate`,
  `payroll:approve`, `payroll:export`, `payroll:adjust`, `payroll:reopen`
- `period:read`, `period:manage`
- `report:read`, `report:manage`
- `audit:read`, `audit:read_all`
- `compensation:read`, `compensation:manage`
- `member:read`, `member:manage`

Role → permission grants live in `role_permissions` and are seeded (see
`supabase/seed.sql`). The mapping is mirrored in
`src/lib/authz/permissions.ts` for unit-testable server checks; the database
remains the source of truth.

## Organization Scope

- `organization_memberships` (profile, organization, role, effective dates)
  defines which organizations a user can touch at all.
- Every server query is filtered by the resolved workspace's organization ID
  (or the full accessible set for All Workspaces).
- RLS restricts each organization-scoped table to organizations where the
  user has an active membership, or everything for platform admins.

## Department Scope

- Users whose role is department-limited (`department_manager`) additionally
  require rows in `department_memberships`.
- Server helpers and RLS both narrow department-scoped reads to those
  departments; organization membership alone is not sufficient for a
  department-limited role.

## Trainer Scope

- A trainer's profile links to exactly one `trainers` row.
- Trainers may read their own trainer record, their own assignments, and
  (later) their own scorecards/payroll statements — enforced by
  `trainer:read_self` / `payroll:read_self` server checks and RLS predicates
  comparing `trainers.profile_id` to `auth.uid()`.
- Trainers have no write access to compensation or official financial
  records.

## Server-Side Checks

`src/lib/authz/` provides pure, unit-tested helpers:

- `hasPermission(grants, permission)` — deny by default; unknown permission →
  false.
- `canAccessOrganization(memberships, orgId)` / `canAccessAllWorkspaces(...)`
- `resolveWorkspaceSelection(...)` (in `src/lib/workspace/`) — validates the
  requested workspace against memberships.

Server components and route handlers must call these before querying;
data-access modules take a validated workspace context, not raw IDs.

## RLS Responsibilities

- Every table: `alter table ... enable row level security` **and**
  `force row level security`; no policy → no access (deny by default).
- Helper functions (`security definer`, `search_path` pinned):
  - `app.is_platform_admin()` — true if the current user has an active
    platform-admin membership.
  - `app.user_organization_ids()` — set of organization IDs with an active
    membership.
  - `app.user_department_ids()` — set of department IDs granted via
    `department_memberships`.
  - `app.current_trainer_id()` — the trainer row owned by the current user.
- Policies are written per table and per command (SELECT/INSERT/UPDATE/
  DELETE) — no broad `for all to authenticated using (true)` policies.
- Reference tables (`roles`, `permissions`, `role_permissions`) are readable
  by any authenticated user but writable only by platform admins.
- `audit_events` has INSERT (scoped) and SELECT (scoped) policies only —
  no UPDATE or DELETE for anyone.

## Phase 2 Additions

- **Escalation guards.** `app.can_grant_role(org, role)` (security definer,
  documented in migration 3) backs RESTRICTIVE policies on
  `organization_memberships` and `invitations`: only platform admins can
  grant `platform_admin`; `member:manage` grants everything else; all other
  roles grant nothing. Server actions mirror the same logic
  (`computeGrantableRoles`) and additionally block self role-changes and
  self-deactivation.
- **Invitations.** Managed with `member:manage`; the pre-auth preview and
  atomic acceptance run through documented security-definer functions
  (`app.get_invitation_preview`, `app.accept_invitation`) exposed via thin
  `public` wrappers. The unguessable token is the credential; only its
  sha256 hash is stored.
- **Draft-only compensation edits.** Tier/rule policies require
  `app.version_is_draft(version)`; `app.protect_published_version` (trigger)
  freezes published versions even for platform admins.
- **Locked periods.** `app.protect_locked_period` (trigger) requires
  `payroll:reopen` to modify a locked reporting period, in addition to the
  `period:manage` policy.
- All new Phase 2 tables have RLS enabled **and forced**, per-command
  policies, and no broad authenticated grants.

## Phase 7 Additions (period close + report administration)

New permission keys (migration 19): `period_close:read`,
`period_close:create`, `period_close:review`, `period_close:approve`,
`period_close:execute`, `period_close:reopen`, `period_close:export`,
`report_package:create`, `report_package:finalize`,
`saved_report:share`, `scheduled_report:manage`.

Role matrix:

| Role | Period-close authority |
| --- | --- |
| `platform_admin` | Everything, including `period_close:reopen` (the only role that can reopen a closed period) |
| `workspace_admin` | Everything except reopen |
| `payroll_manager` | read / create / review / export + `report_package:create`, `saved_report:share`, `scheduled_report:manage` (cannot approve or execute a close) |
| `department_manager` | `period_close:read` only (and department-scoped package visibility via `app.can_access_department`) |
| `trainer` / `viewer` | none |

Enforcement notes:

- **Separation of duties fails closed**: even with `period_close:approve`
  AND `period_close:execute`, the execute RPC rejects a close whose
  approver equals its initiator unless
  `organization_close_policies.allow_self_approval` is true. The policy
  table itself is writable only with `org:manage`.
- `period_close:void` was folded into `period_close:review` (documented
  deviation) — only unfinalized runs are voidable.
- High-risk transitions (execute / reopen / void) are SECURITY DEFINER
  RPCs that re-check permissions internally; RLS additionally gates all
  table reads/writes (`close_runs_*`, `report_packages_*`,
  `close_exports_*` policies). `period_close_manifests` is SELECT-only
  for users — rows are created exclusively by the close RPC.
- Saved-view sharing beyond `personal` requires `saved_report:share` in
  the view's organization (RLS + action); visibility of shared views
  requires `report:read` (+ department access for department scope).
- `reporting_periods.status='closed'` cannot be set or cleared by ANY
  role directly — only through the close RPCs (GUC-gated trigger).

## Phase 8 Additions (integrations + automation)

Seventeen new keys (migration 22): `integration:read/create/update/
disable/manage_credentials/sync/reset_cursor/view_failures`,
`job:read/retry/cancel/manage_dead_letter`, `scheduled_report:execute`,
`report_delivery:read/manage/retry`, `email_policy:manage`.

| Role | Integration/automation authority |
| --- | --- |
| `platform_admin` | Everything, incl. `integration:reset_cursor` (only role) and dev worker claiming |
| `workspace_admin` | Org-scoped everything except cursor reset (incl. credentials + email policy) |
| `payroll_manager` | `integration:read`, `job:read`, `scheduled_report:execute`, `report_delivery:read/retry` — NO provider credential access |
| `department_manager` | `report_delivery:read` only |
| `trainer` | `report_delivery:read` limited by recipient self-scope on delivery events (their own deliveries only) |
| `viewer` | none |

Enforcement notes: job mutations flow exclusively through per-org
permission-checked definer RPCs (no direct UPDATE policies on
`background_jobs`); job CLAIMING is a system action (service_role or
platform admin); credential retrieval is server-exclusive (service_role
or platform-admin + the server-held worker key — a browser can never
present it); `integration_source_records` and finalized
`email_delivery_events` are immutable; `vault` schema is inaccessible
to the authenticated role entirely.

## Denial Behavior

- Server helpers return typed failures; routes render a 404/permission-denied
  state rather than leaking whether a resource exists.
- RLS denials surface as empty result sets, never as data.
- A stored workspace selection the user can no longer access falls back to
  the user's default organization (see ARCHITECTURE.md); it never errors into
  another organization's data.
- Nothing is granted implicitly: a new table gets no policies until its
  access model is designed, so it is inaccessible by default.

## Phase 9: Analytics Permissions

Migration 28 adds the analytics capability set (analytics:read/compare/
export/presentation, analytics_dataset:export, dashboard:create/update/
share_department/share_organization/set_default, scorecard:manage,
goal:read/create/update/approve/archive, benchmark:read/create/approve/
archive, cohort:read). The full matrix, RLS design, and live
verification results live in docs/ANALYTICS_SECURITY.md. The standing
principles hold: capabilities not role names, deny by default, entry
permissions open surfaces while the intelligence engine + RLS decide
per metric what actually renders.
