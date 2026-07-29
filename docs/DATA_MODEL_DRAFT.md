# Performance Operations — Data Model Draft

## Current Foundation Entities (Phase 1 migrations)

| Table | Purpose |
| --- | --- |
| `organizations` | Top-level tenant (Timberhill Athletic Club, G3 Sports & Fitness, …) |
| `locations` | Physical/virtual sites within an organization |
| `departments` | Business units within an organization (Personal Training, Athlete Performance, …) |
| `profiles` | One row per platform user, keyed to `auth.users` |
| `roles` | Role catalog (platform_admin, workspace_admin, payroll_manager, department_manager, trainer, viewer) |
| `permissions` | Permission catalog (`resource:action` keys) |
| `role_permissions` | Role → permission grants |
| `organization_memberships` | Profile ↔ organization with role and active dates |
| `department_memberships` | Profile ↔ department scoping (for department-limited roles) |
| `trainers` | Trainer identity (may link to a profile; may exist before the person has a login) |
| `trainer_organization_assignments` | Trainer ↔ organization, effective-dated, with per-organization role/compensation linkage point |
| `trainer_department_assignments` | Trainer ↔ department, effective-dated |
| `reporting_periods` | Organization-scoped payroll/reporting windows with status |
| `audit_events` | Append-only audit trail |

## Phase 2 Entities (migrated and live)

| Table | Purpose |
| --- | --- |
| `invitations` | Invite-only onboarding; sha256 token hashes; pending/accepted/revoked/expired |
| `service_categories` | Org-scoped catalog headings (seeded per organization) |
| `services` | Normalized appointment/revenue categories with classification flags and effective dates |
| `service_department_assignments` | Effective-dated service ↔ department (composite-FK org-safe) |
| `service_source_aliases` | Source-specific (setmore/acuity/manual_csv) names for import matching; normalized-unique per source+org |
| `compensation_plans` | Org-scoped plan containers |
| `compensation_plan_versions` | Immutable-when-published versions (method, tier behavior, effective dates) |
| `commission_tiers` | Integer-cent revenue ranges + basis-point rates; DB overlap exclusion |
| `compensation_rules` | Structured amount OR rate per rule type (no free-form JSON) |
| `trainer_compensation_assignments` | Trainer ↔ published version per purpose; effective-dated; DB overlap exclusion |

Phase 2 also extended `trainers` (names, phone, employment status,
hire/separation dates, notes, `source_identifiers` JSONB, default org) and
`reporting_periods` (`period_type`, `payment_date`, `notes`, per-type overlap
exclusion, locked-period trigger).

## Phase 3 Entities (migrated and live)

Clients: `clients`, `client_organization_assignments`,
`client_source_identifiers`. Import staging: `import_batches` (file
metadata folded in; 1 file : 1 batch), `import_schema_profiles`,
`import_rows` (immutable originals; matching folded in),
`import_row_issues`, `import_resolutions` (append-only),
`import_batch_events` (append-only), `trainer_source_aliases`,
`appointment_status_definitions`, `source_status_mappings`. Ledger:
`appointments` (trigger-frozen source evidence), `appointment_participants`,
`appointment_status_history`, `appointment_source_links`,
`appointment_corrections` (all append-only). See
IMPORT_ARCHITECTURE.md and APPOINTMENT_LEDGER.md.

## Future Planned Entities (not yet migrated)

- `payroll_runs`, `payroll_line_items`, `payroll_adjustments`,
  `payroll_state_transitions`
- `kpi_snapshots`, `trainer_scorecards`

## Relationships

```
organizations 1─* locations
organizations 1─* departments
organizations 1─* reporting_periods
organizations 1─* audit_events (nullable org for platform-level events)

profiles *─* organizations   via organization_memberships (role_id, dates)
profiles *─* departments     via department_memberships
profiles 0..1─1 trainers     (trainers.profile_id nullable, unique)

trainers *─* organizations   via trainer_organization_assignments (effective-dated)
trainers *─* departments     via trainer_department_assignments (effective-dated)

roles *─* permissions        via role_permissions
```

## Constraints

- UUID primary keys (`gen_random_uuid()`).
- `organization_id NOT NULL` + FK on every organization-scoped table;
  department rows also FK to their organization to prevent cross-org linking
  (department's org must match the assignment's org — enforced via composite
  FK `(department_id, organization_id)`).
- Unique constraints: organization slug; department name per organization;
  location name per organization; role key; permission key; one active
  membership per (profile, organization); one trainer row per profile;
  non-overlapping reporting periods per organization (exclusion constraint on
  the date range); one assignment row per (trainer, organization,
  effective_from) and (trainer, department, effective_from).
- `CHECK` constraints: `effective_to` null or `> effective_from`; period
  `end_date >= start_date`; status values via enums.

## Index Strategy

- Every FK column is indexed.
- Scoping hot paths: `(organization_id)` on all scoped tables;
  `(organization_id, status)` on `reporting_periods`;
  `(organization_id, created_at desc)` on `audit_events`;
  `(profile_id)` / `(organization_id)` on memberships;
  `(trainer_id)`, `(organization_id)`, `(department_id)` on assignment
  tables.
- Partial indexes on "currently active" rows (`effective_to is null`) for
  membership/assignment lookups used by RLS helpers.

## Effective-Dating Strategy

- Assignment tables (`organization_memberships`,
  `trainer_organization_assignments`, `trainer_department_assignments`, and
  future `trainer_compensation_assignments`) carry `effective_from date not
  null` and `effective_to date null` (null = open-ended).
- "Active on date D" = `effective_from <= D and (effective_to is null or
  effective_to >= D)`.
- History is preserved by closing a row (setting `effective_to`) and
  inserting a new row — never by mutating past facts.
- Payroll and KPI calculations always evaluate assignments *as of the service
  date*, not as of the calculation date.

## Money-Storage Strategy

- All monetary values are `bigint` cents (e.g., `$45.00` → `4500`), with
  a `currency` code column (`text`, default `'USD'`) wherever money appears.
- No `float`/`double`/`numeric` arithmetic in application code; the
  TypeScript money utilities (`src/lib/money/`) operate on integer cents and
  make rounding explicit (banker's vs half-up documented per use).
- Percentages/rates are stored as integer basis points (e.g., 35% → 3500)
  so commission math stays in integers.

## Historical Integrity Approach

- Compensation plans are versioned: a plan is a container; each version is
  immutable once any payroll references it.
- Payroll runs snapshot their inputs (plan version IDs, rates, appointment
  IDs) at approval time.
- Posted/locked payroll rows are protected by RLS (no UPDATE/DELETE policy)
  and by application-level state checks; corrections are new adjustment
  records with audit events.
- `audit_events` is append-only and records every state transition.
