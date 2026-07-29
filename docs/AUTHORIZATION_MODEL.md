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

## Denial Behavior

- Server helpers return typed failures; routes render a 404/permission-denied
  state rather than leaking whether a resource exists.
- RLS denials surface as empty result sets, never as data.
- A stored workspace selection the user can no longer access falls back to
  the user's default organization (see ARCHITECTURE.md); it never errors into
  another organization's data.
- Nothing is granted implicitly: a new table gets no policies until its
  access model is designed, so it is inaccessible by default.
